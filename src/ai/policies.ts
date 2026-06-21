// 浏览器安全的对局策略(无 node 依赖)。UI bot 与自对弈共用。
import { legalMoves, type Action, type Card, type GameState, type PlayerState } from '../engine';
import { ALL_PILES } from '../engine/types';
import type { Rng } from '../engine/rng';

export type Policy = (moves: Action[], state: GameState, rng: Rng) => Action;

export const randomPolicy: Policy = (moves, _state, rng) => moves[rng.int(moves.length)];

function findCard(state: GameState, me: PlayerState, cardId: string): Card | null {
  for (const c of me.reserved) if (c.id === cardId) return c;
  for (const pile of ALL_PILES) {
    const c = state.decks[pile].faceUp.find((x) => x?.id === cardId);
    if (c) return c;
  }
  return null;
}

/** 贪心基线:能进化就进化(免费升级);能买就买最高分卡;否则取币。代表真实对弈、驱动到 18。 */
export const greedyPolicy: Policy = (moves, state, rng) => {
  const me = state.players[state.currentPlayerIndex];

  if (state.awaitingDiscard) return moves[0];

  if (state.awaitingEvolve) {
    const evolves = moves.filter((m) => m.type === 'EVOLVE');
    if (evolves.length > 0) {
      let best = evolves[0];
      let bestP = -1;
      for (const m of evolves) {
        if (m.type !== 'EVOLVE') continue;
        const t = findCard(state, me, m.toCardId);
        const p = t ? t.points : 0;
        if (p > bestP) { bestP = p; best = m; }
      }
      return best;
    }
    return { type: 'END_TURN' };
  }

  const buys = moves.filter((m) => m.type === 'BUY');
  if (buys.length > 0) {
    let best = buys[0];
    let bestP = -1;
    for (const b of buys) {
      if (b.type !== 'BUY') continue;
      const card = findCard(state, me, b.source.cardId);
      const p = card ? card.points : 0;
      if (p > bestP) { bestP = p; best = b; }
    }
    return best;
  }

  const take3 = moves.filter((m) => m.type === 'TAKE_THREE');
  if (take3.length > 0) {
    const maxLen = Math.max(...take3.map((m) => (m.type === 'TAKE_THREE' ? m.colors.length : 0)));
    const best = take3.filter((m) => m.type === 'TAKE_THREE' && m.colors.length === maxLen);
    return best[rng.int(best.length)];
  }
  const take2 = moves.filter((m) => m.type === 'TAKE_TWO');
  if (take2.length > 0) return take2[rng.int(take2.length)];
  return moves[rng.int(moves.length)];
};

export function chooseMove(state: GameState, policy: Policy, rng: Rng): Action | null {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  return policy(moves, state, rng);
}
