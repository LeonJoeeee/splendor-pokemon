import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CARDS } from '../data/cards';
import { createGame, passTurn, refreshPlayerDerived } from '../engine';
import { loadSoloGame, saveSoloGame, SOLO_SAVE_KEY } from '../solo/save';
import { GameTable } from './GameTable';

function game() {
  return createGame({
    players: [
      { id: 'P0', name: 'Ash', isAI: false },
      { id: 'P1', name: 'Misty', isAI: true },
    ],
    cards: CARDS,
    seed: 42,
  });
}

describe('game result banner', () => {
  it('announces all exact co-winners in a restored solo game', () => {
    const stalled = game();
    stalled.turnNumber = 101;
    stalled.lastProgressTurn = 0;
    const ended = passTurn(stalled);
    expect(ended.isGameOver).toBe(true);
    expect(ended.winnerId).toBe('P0');
    expect(ended.log.at(-1)).toContain('平局共享胜利:Ash、Misty');
    const values = new Map<string, string>();
    saveSoloGame({ setItem: (key, value) => { values.set(key, value); } }, ended);
    const restored = loadSoloGame({ getItem: (key) => values.get(key) ?? null });
    expect(values.has(SOLO_SAVE_KEY)).toBe(true);
    expect(restored).not.toBeNull();

    const html = renderToStaticMarkup(createElement(GameTable, { game: restored!, youIndex: 0, dispatch: () => {} }));

    expect(html).toContain('Ash、Misty 共享胜利');
    expect(html).not.toContain('Ash 获胜!');
  });

  it('uses evolution then owned-card count to distinguish a single winner', () => {
    const stalled = game();
    const zeroPoint = CARDS.filter((card) => card.points === 0);
    stalled.players[0].purchased = [zeroPoint[0]];
    stalled.players[1].evolved = [zeroPoint[1]];
    refreshPlayerDerived(stalled.players[0]);
    refreshPlayerDerived(stalled.players[1]);
    stalled.turnNumber = 101;
    stalled.lastProgressTurn = 0;
    const ended = passTurn(stalled);
    expect(ended.winnerId).toBe('P1');

    const html = renderToStaticMarkup(createElement(GameTable, { game: ended, youIndex: 0, dispatch: () => {} }));

    expect(html).toContain('Misty 获胜!');
    expect(html).not.toContain('共享胜利');
  });

  it('breaks a points and evolution tie by total owned cards', () => {
    const stalled = game();
    const zeroPoint = CARDS.filter((card) => card.points === 0);
    stalled.players[0].purchased = [zeroPoint[0]];
    stalled.players[1].purchased = [zeroPoint[1], zeroPoint[2]];
    refreshPlayerDerived(stalled.players[0]);
    refreshPlayerDerived(stalled.players[1]);
    stalled.turnNumber = 101;
    stalled.lastProgressTurn = 0;
    const ended = passTurn(stalled);

    expect(ended.winnerId).toBe('P1');
    const html = renderToStaticMarkup(createElement(GameTable, { game: ended, youIndex: 0, dispatch: () => {} }));
    expect(html).toContain('Misty 获胜!');
    expect(html).not.toContain('共享胜利');
  });
});
