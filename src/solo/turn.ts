import { heuristicPolicy } from '../ai/heuristic';
import { applyAction, legalMoves, passTurn, type GameState } from '../engine';
import { makeRng } from '../engine/rng';

const AI_POLICY = heuristicPolicy();

/** Advance an AI turn or a turn with no legal action; leave playable human turns to the UI. */
export function nextSoloTurn(game: GameState): GameState {
  if (game.isGameOver) return game;
  const moves = legalMoves(game);
  if (moves.length === 0) return passTurn(game);
  if (!game.players[game.currentPlayerIndex].isAI) return game;
  const rng = makeRng((game.turnNumber * 2654435761 + game.rngSeed) >>> 0);
  return applyAction(game, AI_POLICY(moves, game, rng));
}
