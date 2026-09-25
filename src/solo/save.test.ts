import { describe, expect, it } from 'vitest';
import { CARDS } from '../data/cards';
import { createGame, refreshPlayerDerived } from '../engine';
import { loadSoloGame, saveSoloGame, SOLO_SAVE_KEY } from './save';

function game() {
  return createGame({
    players: [
      { id: 'P0', name: 'Ash', isAI: false },
      { id: 'P1', name: 'Computer', isAI: true },
    ],
    cards: CARDS,
    seed: 42,
  });
}

function memoryStore() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe('solo save', () => {
  it('restores the turn, players, resources, and owned species Set', () => {
    const storage = memoryStore();
    const original = game();
    original.players[0].purchased.push(CARDS[0]);
    refreshPlayerDerived(original.players[0]);
    original.players[0].tokens.red = 2;
    original.tokenPool.red -= 2;
    original.currentPlayerIndex = 1;
    original.turnNumber = 6;

    saveSoloGame(storage, original);
    const restored = loadSoloGame(storage);

    expect(restored?.turnNumber).toBe(6);
    expect(restored?.currentPlayerIndex).toBe(1);
    expect(restored?.players.map((p) => [p.name, p.tokens.red])).toEqual([
      ['Ash', 2], ['Computer', 0],
    ]);
    expect(restored?.tokenPool.red).toBe(2);
    expect(restored?.players[0].ownedSpecies).toBeInstanceOf(Set);
    expect(restored?.players[0].ownedSpecies.has(CARDS[0].speciesId)).toBe(true);
  });

  it('replaces the previous game when a new one is saved', () => {
    const storage = memoryStore();
    const oldGame = game();
    oldGame.turnNumber = 9;
    saveSoloGame(storage, oldGame);
    saveSoloGame(storage, game());
    expect(loadSoloGame(storage)?.turnNumber).toBe(1);
  });

  it('ignores corrupt, incompatible, and incomplete records', () => {
    const storage = memoryStore();
    for (const value of [
      '{bad json',
      JSON.stringify({ version: 0, state: '{}' }),
      JSON.stringify({ version: 1, state: '{}' }),
    ]) {
      storage.setItem(SOLO_SAVE_KEY, value);
      expect(loadSoloGame(storage)).toBeNull();
    }
  });

  it('does not interrupt play when storage is unavailable', () => {
    const unavailable = {
      getItem: (_key: string): string | null => { throw new Error('blocked'); },
      setItem: (_key: string, _value: string): void => { throw new Error('blocked'); },
    };
    expect(loadSoloGame(unavailable)).toBeNull();
    expect(() => saveSoloGame(unavailable, game())).not.toThrow();
    expect(loadSoloGame(null)).toBeNull();
    expect(() => saveSoloGame(null, game())).not.toThrow();
  });
});
