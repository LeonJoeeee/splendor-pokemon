import { describe, it, expect } from 'vitest';
import {
  applyAction,
  createGame,
  legalEvolutions,
  legalMoves,
  refreshPlayerDerived,
  computePayment,
  resolveBuyCost,
  validateDeck,
  type Card,
  type GameState,
  type PlayerSeed,
} from './index';
import { CARDS } from '../data/cards';
import { totalTokensInPlay, totalCardsInPlay, runBatch, randomPolicy, playGreedyGame } from '../sim/selfplay';

const P2: PlayerSeed[] = [
  { id: 'P0', name: '小智', isAI: false },
  { id: 'P1', name: '小茂', isAI: true },
];
const newGame = (seed = 1): GameState => createGame({ players: P2, cards: CARDS, seed });
const bonusCards = (color: Card['bonus'], n: number): Card[] =>
  CARDS.filter((c) => c.kind === 'normal' && c.bonus === color).slice(0, n);

describe('数据集校验', () => {
  it('真实卡表结构合法(无 error)', () => {
    const r = validateDeck(CARDS);
    if (!r.ok) console.error(r.errors);
    expect(r.ok).toBe(true);
  });
  it('分布 35/30/15/5/5,共 90 张', () => {
    expect(CARDS.length).toBe(90);
    const n = (pred: (c: Card) => boolean) => CARDS.filter(pred).length;
    expect(n((c) => c.kind === 'normal' && c.stage === 1)).toBe(35);
    expect(n((c) => c.kind === 'rare')).toBe(5);
    expect(n((c) => c.kind === 'legendary')).toBe(5);
  });
});

describe('开局', () => {
  it('展示区/代币供给符合规则', () => {
    const g = newGame();
    expect(g.decks[1].faceUp.length).toBe(4);
    expect(g.decks.rare.faceUp.length).toBe(1);
    expect(g.decks.legendary.faceUp.length).toBe(1);
    expect(g.tokenPool.red).toBe(4); // 2 人每色 4
    expect(g.tokenPool.master).toBe(5);
  });
  it('4 人每色 7、大师球 5', () => {
    const g = createGame({ players: [...P2, { id: 'P2', name: 'C', isAI: true }, { id: 'P3', name: 'D', isAI: true }], cards: CARDS, seed: 1 });
    expect(g.tokenPool.red).toBe(7);
    expect(g.tokenPool.master).toBe(5);
  });
});

describe('代币动作', () => {
  it('取 2 个不同色:守恒且入手、轮转', () => {
    const g = newGame();
    const before = totalTokensInPlay(g);
    const g2 = applyAction(g, { type: 'TAKE_THREE', colors: ['red', 'blue'] });
    expect(totalTokensInPlay(g2)).toBe(before);
    expect(g2.players[0].tokens.red).toBe(1);
    expect(g2.players[0].tokens.blue).toBe(1);
    // 取币不会触发进化(无前置),应已轮转到对手
    expect(g2.currentPlayerIndex).toBe(1);
  });
  it('legalMoves 给出的动作均合法', () => {
    const g = newGame(7);
    for (const m of legalMoves(g)) expect(() => applyAction(g, m)).not.toThrow();
  });
});

describe('购买与大师球', () => {
  it('稀有/传说卡成本含大师球,须用大师球代币支付', () => {
    const g = newGame();
    const special = CARDS.find((c) => c.kind === 'rare' || c.kind === 'legendary')!;
    expect((special.cost.master ?? 0)).toBeGreaterThanOrEqual(1);
    const p = g.players[0];
    g.decks[special.kind === 'rare' ? 'rare' : 'legendary'].faceUp[0] = special;
    // 给足代币(每色 + 大师球)
    p.tokens = { red: 7, blue: 7, black: 7, pink: 7, yellow: 7, master: 5 };
    const pay = computePayment(p, special)!;
    expect(pay.resolution.masterSpent).toBeGreaterThanOrEqual(1);
    const g2 = applyAction(g, { type: 'BUY', source: { kind: 'board', cardId: special.id }, payment: pay.payment });
    const p2 = g2.players[0];
    expect(p2.purchased.map((c) => c.id)).toContain(special.id);
    expect(p2.bonuses[special.bonus]).toBe(2); // 稀有/传说给 2 加成
  });

  it('永久加成减免颜色成本', () => {
    const g = newGame();
    const p = g.players[0];
    const target = CARDS.find((c) => c.kind === 'normal' && (c.cost.red ?? 0) >= 2)!;
    p.purchased = bonusCards('red', 1); // +1 red 加成
    refreshPlayerDerived(p);
    const res = resolveBuyCost(p, target); // 与支付无关,只看 bonus 减免
    expect(res.finalColorCost.red ?? 0).toBe(Math.max(0, (target.cost.red ?? 0) - p.bonuses.red));
  });
});

describe('进化(回合末免费动作)', () => {
  it('满足加成需求且目标在展示区时可进化,低阶入面朝下、高阶计分', () => {
    const g = newGame();
    const p = g.players[0];
    const base = CARDS.find((c) => c.kind === 'normal' && c.stage === 1 && c.evolvesToSpeciesId && c.evolveCost)!;
    const evoColor = (Object.keys(base.evolveCost!) as Card['bonus'][])[0];
    const evoNeed = base.evolveCost![evoColor]!;
    const target = CARDS.find((c) => c.kind === 'normal' && c.speciesId === base.evolvesToSpeciesId)!;
    // 拥有 base + 足够该色加成
    p.purchased = [base, ...bonusCards(evoColor, evoNeed + 2)];
    refreshPlayerDerived(p);
    // 目标放展示区
    g.decks[target.stage].faceUp[0] = target;
    g.awaitingEvolve = true;
    const evos = legalEvolutions(g, p);
    expect(evos.length).toBeGreaterThan(0);
    const g2 = applyAction(g, { type: 'EVOLVE', fromCardId: base.id, toCardId: target.id });
    const p2 = g2.players[0];
    expect(p2.purchased.map((c) => c.id)).toContain(target.id);
    expect(p2.purchased.map((c) => c.id)).not.toContain(base.id);
    expect(p2.evolved.map((c) => c.id)).toContain(base.id); // 面朝下计为已进化
  });

  it('加成不足时无合法进化', () => {
    const g = newGame();
    const p = g.players[0];
    const base = CARDS.find((c) => c.kind === 'normal' && c.stage === 1 && c.evolvesToSpeciesId)!;
    p.purchased = [base];
    refreshPlayerDerived(p);
    g.awaitingEvolve = true;
    expect(legalEvolutions(g, p).length).toBe(0);
  });
});

describe('胜利与终局', () => {
  it('达到 18 分触发终局', () => {
    const g = newGame();
    // 直接堆够 18 分的卡给 P0,然后让对手走一步触发回合边界检测
    const big = CARDS.filter((c) => c.points >= 4).slice(0, 5);
    g.players[0].purchased = big;
    refreshPlayerDerived(g.players[0]);
    expect(g.players[0].points).toBeGreaterThanOrEqual(18);
    // 轮到 P1 行动 → advanceTurn 回到 P0(回合边界)→ 终局
    g.currentPlayerIndex = 1;
    const moves = legalMoves(g);
    const g2 = applyAction(g, moves.find((m) => m.type === 'TAKE_THREE') ?? moves[0]);
    expect(g2.isGameOver).toBe(true);
    expect(g2.winnerId).toBe('P0');
  });
});

describe('自对弈', () => {
  it('50 局随机:全部终止、有获胜者、代币/卡牌守恒', () => {
    const report = runBatch(50, 100, randomPolicy, 'random');
    expect(report.failures).toEqual([]);
    expect(report.allHaveWinner).toBe(true);
    expect(report.tokenInvariantHeld).toBe(true);
    expect(report.cardInvariantHeld).toBe(true);
  });
  it('30 局 2 人贪心:全部达成 18 分(非僵局),且出现进化', () => {
    let realWins = 0, evolutions = 0;
    for (let i = 0; i < 30; i++) {
      const r = playGreedyGame(300 + i, 2);
      expect(r.winnerId).toBeDefined();
      expect(r.tokenInvariantOk).toBe(true);
      expect(r.cardInvariantOk).toBe(true);
      if (!r.stalemate) realWins++;
      evolutions += r.evolutions;
    }
    expect(realWins).toBe(30);
    expect(evolutions).toBeGreaterThan(0); // 进化机制确实被用到
  });
  it('单局快照守恒', () => {
    const g = newGame(5);
    expect(totalTokensInPlay(g)).toBe(4 * 5 + 5);
    expect(totalCardsInPlay(g)).toBe(CARDS.length);
  });
});
