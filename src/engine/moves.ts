// 合法动作枚举：购买 / 取2 / 取3 / 预定 / (子阶段)弃牌。UI 高亮、AI 与自对弈共用。
import {
  ENERGY_ORDER,
  HAND_LIMIT,
  MAX_RESERVED,
  PAYABLE_ORDER,
  TAKE_TWO_MIN_PILE,
  type Action,
  type DiscardAction,
  type EnergyType,
  type GameState,
  type PayableToken,
  type PlayerState,
  type Tier,
  type TokenPool,
} from './types';
import { buildBuyAction } from './buy';
import { emptyPool, totalTokens } from './util';

const TIERS: Tier[] = [1, 2, 3];

function opponentsOf(state: GameState, idx: number): PlayerState[] {
  return state.players.filter((_, i) => i !== idx);
}

/** 取「不同色」动作：1~3 个互异色的全部非空子集（Splendor 允许少取）。 */
function takeDifferentCombos(available: EnergyType[]): EnergyType[][] {
  const out: EnergyType[][] = [];
  const n = available.length;
  for (let i = 0; i < n; i++) {
    out.push([available[i]]); // 取 1
    for (let j = i + 1; j < n; j++) {
      out.push([available[i], available[j]]); // 取 2（每色 1）
      for (let k = j + 1; k < n; k++) {
        out.push([available[i], available[j], available[k]]); // 取 3
      }
    }
  }
  return out;
}

/** 规范弃牌：从最大堆起弃至 10，彩虹优先级最低；确定性。 */
export function canonicalDiscard(player: PlayerState): DiscardAction {
  let excess = totalTokens(player.tokens) - HAND_LIMIT;
  const discard = emptyPool();
  const work: TokenPool = { ...player.tokens };
  while (excess > 0) {
    let pick: PayableToken | null = null;
    let pickN = -1;
    // 先在能量色里找最大堆
    for (const e of ENERGY_ORDER) {
      const avail = work[e] - discard[e];
      if (avail > pickN) {
        pickN = avail;
        pick = e;
      }
    }
    // 全为 0 才动彩虹
    if (!pick || pickN <= 0) {
      pick = 'rainbow';
    }
    discard[pick] += 1;
    excess -= 1;
  }
  return { type: 'DISCARD', tokens: discard };
}

export function legalMoves(state: GameState): Action[] {
  if (state.isGameOver) return [];
  const idx = state.currentPlayerIndex;
  const me = state.players[idx];

  if (state.awaitingDiscard) {
    return [canonicalDiscard(me)];
  }

  const moves: Action[] = [];
  const opps = opponentsOf(state, idx);

  // (D) 购买：场上明牌 + 预定区
  for (const tier of TIERS) {
    for (const card of state.decks[tier].faceUp) {
      if (!card) continue;
      const built = buildBuyAction(me, card, state.config, { kind: 'board', cardId: card.id }, opps);
      if (built) moves.push(built.action);
    }
  }
  for (const card of me.reserved) {
    const built = buildBuyAction(me, card, state.config, { kind: 'reserved', cardId: card.id }, opps);
    if (built) moves.push(built.action);
  }

  // (B) 取同色 2 个（该堆 ≥4）
  for (const e of ENERGY_ORDER) {
    if (state.tokenPool[e] >= TAKE_TWO_MIN_PILE) {
      moves.push({ type: 'TAKE_TWO', energy: e });
    }
  }

  // (A) 取 1~3 种不同色
  const available = ENERGY_ORDER.filter((e) => state.tokenPool[e] > 0);
  for (const combo of takeDifferentCombos([...available])) {
    moves.push({ type: 'TAKE_THREE', energies: combo });
  }

  // (C) 预定（场上 + 盲抽），预定区 <3
  if (me.reserved.length < MAX_RESERVED) {
    for (const tier of TIERS) {
      for (const card of state.decks[tier].faceUp) {
        if (card) moves.push({ type: 'RESERVE', source: { kind: 'board', cardId: card.id } });
      }
      if (state.decks[tier].drawPile.length > 0) {
        moves.push({ type: 'RESERVE', source: { kind: 'deck', tier } });
      }
    }
  }

  return moves;
}

/** 仅用于安全网：当前玩家是否完全无合法动作（极罕见，近终局）。 */
export function hasNoMoves(state: GameState): boolean {
  return !state.awaitingDiscard && legalMoves(state).length === 0;
}

export { PAYABLE_ORDER };
