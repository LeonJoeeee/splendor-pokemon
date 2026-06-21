// 浏览器安全的对局策略（无 node 依赖）。UI 的 bot 与自对弈 harness 共用。
import { legalMoves, type Action, type Card, type GameState, type PlayerState } from '../engine';
import type { Rng } from '../engine/rng';

export type Policy = (moves: Action[], state: GameState, rng: Rng) => Action;

export const randomPolicy: Policy = (moves, _state, rng) => moves[rng.int(moves.length)];

export function cardOfBuy(state: GameState, me: PlayerState, action: Action): Card | null {
  if (action.type !== 'BUY') return null;
  if (action.source.kind === 'reserved') {
    return me.reserved.find((c) => c.id === action.source.cardId) ?? null;
  }
  for (const tier of [1, 2, 3] as const) {
    const c = state.decks[tier].faceUp.find((x) => x?.id === action.source.cardId);
    if (c) return c;
  }
  return null;
}

/** 贪心基线：能买就买最高名望卡（代表真实对弈，驱动到 15）；否则取币/预定。 */
export const greedyPolicy: Policy = (moves, state, rng) => {
  const me = state.players[state.currentPlayerIndex];
  if (state.awaitingDiscard) return moves[0];

  const buys = moves.filter((m) => m.type === 'BUY');
  if (buys.length > 0) {
    let best = buys[0];
    let bestP = -1;
    for (const b of buys) {
      const card = cardOfBuy(state, me, b);
      const p = card ? card.prestige : 0;
      if (p > bestP) {
        bestP = p;
        best = b;
      }
    }
    return best;
  }
  const take3 = moves.filter((m) => m.type === 'TAKE_THREE');
  if (take3.length > 0) {
    const maxLen = Math.max(...take3.map((m) => (m.type === 'TAKE_THREE' ? m.energies.length : 0)));
    const best = take3.filter((m) => m.type === 'TAKE_THREE' && m.energies.length === maxLen);
    return best[rng.int(best.length)];
  }
  const take2 = moves.filter((m) => m.type === 'TAKE_TWO');
  if (take2.length > 0) return take2[rng.int(take2.length)];
  return moves[rng.int(moves.length)];
};

/** 便捷：对给定状态用某策略选一个动作（UI bot 用）。 */
export function chooseMove(state: GameState, policy: Policy, rng: Rng): Action | null {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  return policy(moves, state, rng);
}
