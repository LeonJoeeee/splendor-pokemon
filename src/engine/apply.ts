// 纯函数 reducer：applyAction(state, action) -> 新 GameState（不修改入参）。
import {
  HAND_LIMIT,
  MAX_RESERVED,
  TAKE_TWO_MIN_PILE,
  WIN_THRESHOLD,
  ENERGY_ORDER,
  PAYABLE_ORDER,
  type Action,
  type Badge,
  type BuyAction,
  type Card,
  type GameState,
  type PlayerState,
  type Tier,
} from './types';
import { computePayment, resolveBuyCost } from './buy';
import { refreshPlayerDerived } from './derive';
import { totalTokens } from './util';

// 僵局安全网：连续这么多个人回合无人购买/认领徽章 → 按当前名望判定结束。
// 仅在病态对局（如随机策略 + 小数据集、卡牌耗尽）触发；正常对弈每回合都在购买，永不触顶。
const STALEMATE_LIMIT = 100;

function clone(state: GameState): GameState {
  return structuredClone(state);
}

function opponents(state: GameState, idx: number): PlayerState[] {
  return state.players.filter((_, i) => i !== idx);
}

function findBoardCard(
  state: GameState,
  cardId: string,
): { tier: Tier; slot: number; card: Card } | null {
  for (const tier of [1, 2, 3] as Tier[]) {
    const slot = state.decks[tier].faceUp.findIndex((c) => c?.id === cardId);
    if (slot >= 0) return { tier, slot, card: state.decks[tier].faceUp[slot]! };
  }
  return null;
}

function refillBoard(state: GameState, tier: Tier, slot: number): void {
  state.decks[tier].faceUp[slot] = state.decks[tier].drawPile.shift() ?? null;
}

/** 自动认领徽章：满足要求者中按 id 字典序取 1（每回合至多 1）。 */
function awardBadge(state: GameState, me: PlayerState): Badge | null {
  const satisfied = state.badges
    .filter((b) =>
      ENERGY_ORDER.every((e) => me.bonuses[e] >= (b.requirement[e] ?? 0)),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  if (satisfied.length === 0) return null;
  const badge = satisfied[0];
  state.badges = state.badges.filter((b) => b.id !== badge.id);
  me.badges.push(badge);
  return badge;
}

function finishGame(state: GameState, stalemate = false): void {
  state.isGameOver = true;
  if (stalemate) {
    state.log.push(`僵局：连续 ${STALEMATE_LIMIT} 回合无人推进，按当前名望判定。`);
  }
  const maxP = Math.max(...state.players.map((p) => p.prestige));
  const contenders = state.players.filter((p) => p.prestige === maxP);
  // tiebreak：购买卡最少；仍平则共享。
  const minCards = Math.min(...contenders.map((p) => p.purchased.length));
  const winners = contenders.filter((p) => p.purchased.length === minCards);
  state.winnerId = winners[0].id;
  if (winners.length > 1) {
    state.log.push(`平局共享胜利：${winners.map((w) => w.name).join('、')}（${maxP} 名望）`);
  } else {
    state.log.push(`${winners[0].name} 获胜！（${maxP} 名望）`);
  }
}

function advanceTurn(state: GameState): void {
  const n = state.players.length;
  // 记忆首位达 15 者（UI 显示「最终回合」）。
  if (state.endTriggeredByPlayerIndex === null) {
    const reacher = state.players.findIndex((p) => p.prestige >= WIN_THRESHOLD);
    if (reacher >= 0) {
      state.endTriggeredByPlayerIndex = reacher;
      state.log.push(`${state.players[reacher].name} 达到 ${WIN_THRESHOLD} 名望，进入最终回合！`);
    }
  }
  const next = (state.currentPlayerIndex + 1) % n;
  state.turnNumber += 1;
  // 回合边界（回到起始玩家）= 一整轮结束，所有人回合数相等 → 检查终局。
  if (next === state.roundStartIndex && state.players.some((p) => p.prestige >= WIN_THRESHOLD)) {
    finishGame(state);
    return;
  }
  // 僵局安全网（病态对局防死循环）。
  if (state.turnNumber - state.lastProgressTurn > STALEMATE_LIMIT) {
    finishGame(state, true);
    return;
  }
  state.currentPlayerIndex = next;
}

// ----------------------------- 各动作 ----------------------------------------

function applyTakeThree(state: GameState, me: PlayerState, energies: readonly string[]): void {
  const set = new Set(energies);
  if (set.size !== energies.length) throw new Error('取不同色：颜色须互异');
  if (energies.length < 1 || energies.length > 3) {
    throw new Error(`取不同色：应取 1~3 种，收到 ${energies.length}`);
  }
  for (const e of energies as (keyof typeof state.tokenPool)[]) {
    if (state.tokenPool[e] <= 0) throw new Error(`供给区无 ${String(e)}`);
    state.tokenPool[e] -= 1;
    me.tokens[e] += 1;
  }
}

function applyTakeTwo(state: GameState, me: PlayerState, energy: keyof typeof state.tokenPool): void {
  if (state.tokenPool[energy] < TAKE_TWO_MIN_PILE) {
    throw new Error(`TAKE_TWO 要求该堆 ≥${TAKE_TWO_MIN_PILE}`);
  }
  state.tokenPool[energy] -= 2;
  me.tokens[energy] += 2;
}

function applyReserve(state: GameState, me: PlayerState, action: Extract<Action, { type: 'RESERVE' }>): void {
  if (me.reserved.length >= MAX_RESERVED) throw new Error('预定区已满（3）');
  let card: Card;
  if (action.source.kind === 'board') {
    const found = findBoardCard(state, action.source.cardId);
    if (!found) throw new Error('预定目标不在场上');
    card = found.card;
    refillBoard(state, found.tier, found.slot);
  } else {
    const deck = state.decks[action.source.tier];
    if (deck.drawPile.length === 0) throw new Error('该层牌库已空，无法盲抽预定');
    card = deck.drawPile.shift()!;
  }
  me.reserved.push(card);
  if (state.tokenPool.rainbow > 0) {
    state.tokenPool.rainbow -= 1;
    me.tokens.rainbow += 1;
  }
}

function applyBuy(state: GameState, idx: number, me: PlayerState, action: BuyAction): void {
  // 定位卡
  let card: Card;
  let fromBoard: { tier: Tier; slot: number } | null = null;
  if (action.source.kind === 'board') {
    const found = findBoardCard(state, action.source.cardId);
    if (!found) throw new Error('购买目标不在场上');
    card = found.card;
    fromBoard = { tier: found.tier, slot: found.slot };
  } else {
    const i = me.reserved.findIndex((c) => c.id === action.source.cardId);
    if (i < 0) throw new Error('购买目标不在预定区');
    card = me.reserved[i];
    me.reserved.splice(i, 1);
  }

  // 重算规范结算与支付（以引擎为准，不盲信 action.payment）。
  const resolution = resolveBuyCost(me, card, state.config, opponents(state, idx));
  const pay = computePayment(me, resolution.finalCost);
  if (!pay) throw new Error(`${me.name} 无法负担 ${card.nameZh}`);

  for (const t of PAYABLE_ORDER) {
    me.tokens[t] -= pay.payment[t];
    state.tokenPool[t] += pay.payment[t];
  }

  if (fromBoard) refillBoard(state, fromBoard.tier, fromBoard.slot);
  me.purchased.push(card);
  refreshPlayerDerived(me, state.config);
  state.lastProgressTurn = state.turnNumber; // 购买 = 推进，重置僵局计数

  const badge = awardBadge(state, me);
  if (badge) refreshPlayerDerived(me, state.config);

  state.log.push(
    `${me.name} 捕捉 ${card.nameZh}（${card.prestige}分${resolution.totalDiscount ? `，进化折扣-${resolution.totalDiscount}` : ''}）${badge ? `，获得${badge.nameZh}` : ''}`,
  );
}

function applyDiscard(state: GameState, me: PlayerState, action: Extract<Action, { type: 'DISCARD' }>): void {
  if (!state.awaitingDiscard) throw new Error('当前无需弃牌');
  const excess = totalTokens(me.tokens) - HAND_LIMIT;
  let sum = 0;
  for (const t of PAYABLE_ORDER) sum += action.tokens[t];
  if (sum !== excess) throw new Error(`需弃 ${excess} 个，收到 ${sum}`);
  for (const t of PAYABLE_ORDER) {
    if (action.tokens[t] > me.tokens[t]) throw new Error(`弃牌超出持有：${t}`);
    me.tokens[t] -= action.tokens[t];
    state.tokenPool[t] += action.tokens[t];
  }
  state.awaitingDiscard = false;
}

// ----------------------------- 入口 ------------------------------------------

export function applyAction(prev: GameState, action: Action): GameState {
  if (prev.isGameOver) throw new Error('对局已结束');
  const state = clone(prev);
  const idx = state.currentPlayerIndex;
  const me = state.players[idx];

  if (state.awaitingDiscard && action.type !== 'DISCARD') {
    throw new Error('需先弃牌至 10');
  }

  switch (action.type) {
    case 'TAKE_THREE':
      applyTakeThree(state, me, action.energies);
      break;
    case 'TAKE_TWO':
      applyTakeTwo(state, me, action.energy);
      break;
    case 'RESERVE':
      applyReserve(state, me, action);
      break;
    case 'BUY':
      applyBuy(state, idx, me, action);
      break;
    case 'DISCARD':
      applyDiscard(state, me, action);
      break;
  }

  if (action.type === 'DISCARD') {
    advanceTurn(state);
  } else if (totalTokens(me.tokens) > HAND_LIMIT) {
    state.awaitingDiscard = true; // 等待弃牌，不结束回合
  } else {
    advanceTurn(state);
  }

  return state;
}

/** 安全网：当前玩家无任何合法动作时跳过其回合（极罕见，近终局）。 */
export function passTurn(prev: GameState): GameState {
  if (prev.isGameOver) return prev;
  const state = clone(prev);
  state.log.push(`${state.players[state.currentPlayerIndex].name} 无合法动作，跳过`);
  advanceTurn(state);
  return state;
}
