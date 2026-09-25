import { describe, expect, it } from 'vitest';
import { CARDS } from '../data/cards';
import { createGame, legalMoves } from '../engine';
import { nextSoloTurn } from './turn';

function game() {
  return createGame({
    players: [
      { id: 'P0', name: 'Human', isAI: false },
      { id: 'P1', name: 'Computer', isAI: true },
    ],
    cards: CARDS,
    seed: 42,
  });
}

function noMoves() {
  const state = game();
  for (const deck of Object.values(state.decks)) {
    deck.faceUp.fill(null);
    deck.drawPile = [];
  }
  for (const color of ['red', 'blue', 'black', 'pink', 'yellow'] as const) state.tokenPool[color] = 0;
  expect(legalMoves(state)).toEqual([]);
  return state;
}

describe('solo turn advancement', () => {
  it('passes an AI turn with no legal move', () => {
    const state = noMoves();
    state.currentPlayerIndex = 1;

    const next = nextSoloTurn(state);

    expect(next).not.toBe(state);
    expect(next.currentPlayerIndex).toBe(0);
    expect(next.turnNumber).toBe(2);
    expect(next.log.at(-1)).toContain('Computer 无合法动作,跳过');
  });

  it('passes a human turn with no legal move', () => {
    const state = noMoves();

    const next = nextSoloTurn(state);

    expect(next.currentPlayerIndex).toBe(1);
    expect(next.turnNumber).toBe(2);
    expect(next.log.at(-1)).toContain('Human 无合法动作,跳过');
  });

  it('leaves a playable human turn alone', () => {
    const state = game();
    expect(legalMoves(state).length).toBeGreaterThan(0);
    expect(nextSoloTurn(state)).toBe(state);
  });

  it('takes an ordinary AI move when available', () => {
    const state = game();
    state.currentPlayerIndex = 1;
    expect(legalMoves(state).length).toBeGreaterThan(0);

    const next = nextSoloTurn(state);

    expect(next).not.toBe(state);
    expect(next.turnNumber).toBe(2);
    expect(next.currentPlayerIndex).toBe(0);
  });

  it('still ends a no-progress game at the stalemate safety limit', () => {
    let state = noMoves();
    for (let i = 0; i < 101 && !state.isGameOver; i++) state = nextSoloTurn(state);

    expect(state.isGameOver).toBe(true);
    expect(state.log.some((line) => line.startsWith('僵局'))).toBe(true);
  });
});
