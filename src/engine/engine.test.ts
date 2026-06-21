import { describe, it, expect } from 'vitest';
import {
  applyAction,
  createGame,
  legalMoves,
  refreshPlayerDerived,
  resolveBuyCost,
  validateDeck,
  type GameState,
  type PlayerSeed,
} from './index';
import { CARDS } from '../data/cards';
import { BADGES } from '../data/badges';
import { totalTokensInPlay, totalCardsInPlay, runBatch, randomPolicy, playGreedyGame } from '../sim/selfplay';

const P2: PlayerSeed[] = [
  { id: 'P0', name: '小智', isAI: false },
  { id: 'P1', name: '小茂', isAI: true },
];

function newGame(seed = 1): GameState {
  return createGame({ players: P2, cards: CARDS, badges: BADGES, seed });
}

const find = (species: string) => CARDS.find((c) => c.speciesId === species)!;

describe('数据集校验', () => {
  it('占位数据集结构合法（无 error）', () => {
    const r = validateDeck(CARDS, BADGES);
    if (!r.ok) console.error(r.errors);
    expect(r.ok).toBe(true);
  });
});

describe('开局', () => {
  it('明牌区/徽章/代币供给符合规则', () => {
    const g = newGame();
    expect(g.decks[1].faceUp.length).toBe(4);
    expect(g.decks[2].faceUp.length).toBe(4);
    expect(g.decks[3].faceUp.length).toBe(4);
    expect(g.badges.length).toBe(3); // 2 人 + 1
    expect(g.tokenPool.grass).toBe(4); // 2 人每色 4
    expect(g.tokenPool.rainbow).toBe(5);
    expect(g.isGameOver).toBe(false);
  });

  it('同一种子可复现', () => {
    const a = newGame(42);
    const b = newGame(42);
    expect(a.decks[1].faceUp.map((c) => c?.id)).toEqual(b.decks[1].faceUp.map((c) => c?.id));
  });
});

describe('代币与动作', () => {
  it('取 3 种不同能量：守恒且入手', () => {
    const g = newGame();
    const before = totalTokensInPlay(g);
    const g2 = applyAction(g, { type: 'TAKE_THREE', energies: ['grass', 'fire', 'water'] });
    expect(totalTokensInPlay(g2)).toBe(before);
    expect(g2.players[0].tokens.grass).toBe(1);
    expect(g2.tokenPool.grass).toBe(3);
    expect(g2.currentPlayerIndex).toBe(1); // 已轮转
  });

  it('legalMoves 给出的动作均合法（逐一施加不抛错）', () => {
    const g = newGame(7);
    for (const m of legalMoves(g)) {
      expect(() => applyAction(g, m)).not.toThrow();
    }
  });
});

describe('购买结算', () => {
  it('拥有前置进化体时触发进化折扣（-1，落在剩余需求最大色）', () => {
    const g = newGame();
    const p = g.players[0];
    p.purchased.push(find('CHARMANDER')); // bonus fire
    refreshPlayerDerived(p, g.config);
    const res = resolveBuyCost(p, find('CHARMELEON'), g.config, []);
    expect(res.totalDiscount).toBe(1);
    expect(res.evolutionDiscountApplied).not.toBeNull();
    expect(res.evolutionDiscountApplied!.energy).toBe('grass'); // 并列最大按 ENERGY_ORDER 取首
  });

  it('无前置则无进化折扣', () => {
    const g = newGame();
    const res = resolveBuyCost(g.players[1], find('CHARMELEON'), g.config, []);
    expect(res.totalDiscount).toBe(0);
    expect(res.evolutionDiscountApplied).toBeNull();
  });

  it('extraBonus 卡其能量在 bonus 向量中计 2', () => {
    const g = newGame();
    const p = g.players[0];
    p.purchased.push(find('CHARIZARD')); // ability extraBonus fire +1
    refreshPlayerDerived(p, g.config);
    expect(p.bonuses.fire).toBe(2);
  });

  it('关闭招牌特性后 extraBonus 不计', () => {
    const g = createGame({ players: P2, cards: CARDS, badges: BADGES, seed: 1, config: { enableSignatureAbility: false } });
    const p = g.players[0];
    p.purchased.push(find('CHARIZARD'));
    refreshPlayerDerived(p, g.config);
    expect(p.bonuses.fire).toBe(1);
  });
});

describe('徽章自动认领', () => {
  it('购买使 bonus 达阈值时自动获得徽章 + 3 名望', () => {
    const g = newGame();
    g.badges = BADGES.filter((b) => b.id === 'boulder-badge'); // fire3 grass3 electric3
    const p = g.players[0];
    // 预置 bonus：火(含charizard的×2)、草各 3，电 2 —— 还差 1 电
    p.purchased = [
      find('CHARMANDER'), find('CHARMELEON'), find('CHARIZARD'), // fire: 1+1+(1+1)=4
      find('BULBASAUR'), find('IVYSAUR'), find('VENUSAUR'), // grass 3
      find('PICHU'), find('PIKACHU'), // electric 2
    ];
    refreshPlayerDerived(p, g.config);
    expect(p.bonuses.electric).toBe(2);
    // 放一张电属性卡在场上并给足代币，购买后电→3，触发 boulder
    const raichu = find('RAICHU'); // bonus electric, stage3 (pichu-line)
    g.decks[3].faceUp[0] = raichu;
    p.tokens = { grass: 2, fire: 2, water: 3, electric: 3, psychic: 0, rainbow: 0 };
    const g2 = applyAction(g, { type: 'BUY', source: { kind: 'board', cardId: raichu.id }, payment: { grass: 0, fire: 0, water: 0, electric: 0, psychic: 0, rainbow: 0 } });
    const p2 = g2.players[0];
    expect(p2.bonuses.electric).toBe(3);
    expect(p2.badges.map((b) => b.id)).toContain('boulder-badge');
  });
});

describe('随机自对弈（终止性 + 不变量）', () => {
  it('50 局随机对局：全部终止(无异常)、有获胜者、代币/卡牌守恒', () => {
    const report = runBatch(50, 100, randomPolicy, 'random');
    expect(report.failures).toEqual([]); // 无异常/死循环（僵局网兜底）
    expect(report.allHaveWinner).toBe(true);
    expect(report.tokenInvariantHeld).toBe(true);
    expect(report.cardInvariantHeld).toBe(true);
    expect(report.avgTurns).toBeGreaterThan(0);
  });

  // 注：占位数据集仅 28 张卡(~35 点名望)，3/4 人局名望被稀释、无人能到 15 → 僵局。
  // 这是数据集限制(Phase 3 完整 90 卡可支撑 2-4 人)，非引擎缺陷；故贪心终止性仅在 2 人局断言。
  it('30 局 2 人贪心对局：全部达成 15 名望(非僵局)结束', () => {
    let realWins = 0;
    let stalemates = 0;
    for (let i = 0; i < 30; i++) {
      const r = playGreedyGame(200 + i, 2);
      expect(r.winnerId).toBeDefined();
      expect(r.tokenInvariantOk).toBe(true);
      expect(r.cardInvariantOk).toBe(true);
      if (r.stalemate) stalemates++;
      else realWins++;
    }
    expect(stalemates).toBe(0);
    expect(realWins).toBe(30);
  });

  it('单局快照守恒检查', () => {
    const g = newGame(5);
    expect(totalTokensInPlay(g)).toBe(4 * 5 + 5); // 2 人：每色4×5 + 彩虹5
    expect(totalCardsInPlay(g)).toBe(CARDS.length);
  });
});
