import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CARDS } from '../data/cards';
import { createGame, legalEvolutions, passTurn, refreshPlayerDerived, type Card, type GameState } from '../engine';
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

function moveCard(state: GameState, id: string): Card {
  for (const deck of Object.values(state.decks)) {
    const face = deck.faceUp.findIndex((card) => card?.id === id);
    if (face >= 0) {
      const card = deck.faceUp[face]!;
      deck.faceUp[face] = deck.drawPile.shift() ?? null;
      return card;
    }
    const draw = deck.drawPile.findIndex((card) => card.id === id);
    if (draw >= 0) return deck.drawPile.splice(draw, 1)[0];
  }
  throw new Error(`Missing card ${id}`);
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

describe('tabletop controls', () => {
  it('renders public cards as selectable faces and reserves the action area for an inspector', () => {
    const html = renderToStaticMarkup(createElement(GameTable, { game: game(), youIndex: 0, mode: 'local', dispatch: () => {} }));
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('取宝可梦球');
    expect(html).toContain('确认取 0 种');
    expect(html).not.toContain('class="inspector-details');
  });

  it('renders an online unseated viewer with no enabled game actions', () => {
    const state = game();
    for (const color of ['red', 'blue', 'black', 'pink', 'yellow'] as const) state.players[0].bonuses[color] = 10;
    const html = renderToStaticMarkup(createElement(GameTable, { game: state, youIndex: null, mode: 'online', dispatch: () => {} }));
    expect(html).toContain('观战模式');
    expect(html).not.toMatch(/aria-label="捕捉 [^"]+"/);
  });
});

describe('trainer rail phase behavior', () => {
  it('distinguishes same-name public and reserved evolution targets', () => {
    const state = game();
    const me = state.players[0];
    me.purchased.push(moveCard(state, 'bulbasaur-0'));
    for (const card of CARDS.filter((card) => card.bonus === 'pink' && card.id !== 'ivysaur-35' && card.id !== 'ivysaur-36').slice(0, 3)) {
      me.purchased.push(moveCard(state, card.id));
    }
    me.reserved.push(moveCard(state, 'ivysaur-36'));
    const target = moveCard(state, 'ivysaur-35');
    const displaced = state.decks[2].faceUp[2];
    state.decks[2].faceUp[2] = target;
    if (displaced) state.decks[2].drawPile.push(displaced);
    refreshPlayerDerived(me);
    state.awaitingEvolve = true;
    expect(legalEvolutions(state, me).filter((action) => action.fromCardId === 'bulbasaur-0')).toHaveLength(2);

    const html = renderToStaticMarkup(createElement(GameTable, { game: state, youIndex: 0, mode: 'local', dispatch: () => {} }));

    expect(html).toContain('妙蛙种子 → 妙蛙草 · 展示区·第 2 阶·第 3 格');
    expect(html).toContain('妙蛙种子 → 妙蛙草 · 我的预订·第 1 格');
  });

  it('removes card actions during forced discard while keeping supply visible', () => {
    const state = game();
    state.players[0].tokens = { red: 4, blue: 3, black: 2, pink: 2, yellow: 0, master: 0 };
    state.awaitingDiscard = true;

    const html = renderToStaticMarkup(createElement(GameTable, { game: state, youIndex: 0, mode: 'local', dispatch: () => {} }));

    expect(html).toContain('弃球');
    expect(html).toContain('大师');
    expect(html).not.toMatch(/<button[^>]*>捕捉<\/button>/);
    expect(html).toContain('mode-discard');
    expect(html).not.toContain('mode-card');
  });

  it('keeps three own reservation positions visible when none are filled', () => {
    const html = renderToStaticMarkup(createElement(GameTable, { game: game(), youIndex: 0, mode: 'local', dispatch: () => {} }));
    expect(html.match(/class="reserved-slot[^\"]*"/g)).toHaveLength(3);
  });
});
