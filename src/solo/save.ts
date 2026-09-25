import type { Card, GameState, TokenPool } from '../engine';
import { ALL_PILES, COLOR_ORDER, PAYABLE_ORDER } from '../engine';
import { CARDS } from '../data/cards';
import { deserializeState, serializeState } from '../net/serialize';

export const SOLO_SAVE_KEY = 'splendor-pokemon:solo';
const SAVE_VERSION = 1;
const cardById = new Map(CARDS.map((card) => [card.id, JSON.stringify(card)]));

type ReadStore = Pick<Storage, 'getItem'>;
type WriteStore = Pick<Storage, 'setItem'>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function pool(value: unknown): value is TokenPool {
  return record(value) && PAYABLE_ORDER.every((color) => count(value[color]));
}

function card(value: unknown): value is Card {
  return record(value) && typeof value.id === 'string' && cardById.get(value.id) === JSON.stringify(value);
}

function cards(value: unknown): value is Card[] {
  return Array.isArray(value) && value.every(card);
}

function validGame(value: unknown): value is GameState {
  if (!record(value) || !Array.isArray(value.players) || value.players.length < 2 || value.players.length > 4) return false;
  if (!value.players.every((p: unknown) => {
    if (!record(p) || !record(p.bonuses)) return false;
    const bonuses = p.bonuses;
    return typeof p.id === 'string' && typeof p.name === 'string'
      && typeof p.isAI === 'boolean' && pool(p.tokens) && cards(p.purchased) && cards(p.reserved)
      && cards(p.evolved) && COLOR_ORDER.every((color) => count(bonuses[color]))
      && p.ownedSpecies instanceof Set && count(p.points);
  })) return false;
  if (!count(value.currentPlayerIndex) || value.currentPlayerIndex >= value.players.length || !pool(value.tokenPool)) return false;
  if (!record(value.decks)) return false;
  const decks = value.decks;
  if (!ALL_PILES.every((key) => {
    const deck = decks[key];
    return record(deck) && String(deck.key) === String(key) && cards(deck.drawPile)
      && Array.isArray(deck.faceUp) && deck.faceUp.every((item: unknown) => item === null || card(item));
  })) return false;
  return count(value.turnNumber) && count(value.roundStartIndex) && count(value.lastProgressTurn)
    && record(value.config) && typeof value.config.evolveFromReserved === 'boolean'
    && (value.endTriggeredByPlayerIndex === null || (count(value.endTriggeredByPlayerIndex)
      && value.endTriggeredByPlayerIndex < value.players.length))
    && typeof value.isGameOver === 'boolean' && typeof value.awaitingDiscard === 'boolean'
    && typeof value.awaitingEvolve === 'boolean' && count(value.rngSeed)
    && (value.winnerId === undefined || typeof value.winnerId === 'string')
    && Array.isArray(value.log) && value.log.every((line: unknown) => typeof line === 'string');
}

export function loadSoloGame(storage: ReadStore | null): GameState | null {
  try {
    const raw = storage?.getItem(SOLO_SAVE_KEY);
    if (!raw) return null;
    const saved: unknown = JSON.parse(raw);
    if (!record(saved) || saved.version !== SAVE_VERSION || typeof saved.state !== 'string') return null;
    const game = deserializeState(saved.state);
    return validGame(game) ? game : null;
  } catch {
    return null;
  }
}

export function saveSoloGame(storage: WriteStore | null, state: GameState): void {
  try {
    storage?.setItem(SOLO_SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, state: serializeState(state) }));
  } catch {
    // Storage may be disabled or full; the in-memory game remains playable.
  }
}
