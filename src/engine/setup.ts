// 开局:种子化洗牌,构建 5 个牌库(普通三阶 + 稀有 + 传说)、代币供给、玩家。
import {
  COLOR_ORDER,
  COLOR_SUPPLY_BY_PLAYERS,
  MASTER_SUPPLY,
  SPECIAL_SLOTS,
  TIER_SLOTS,
  type Card,
  type DeckState,
  type GameConfig,
  type GameState,
  type PileKey,
  type PlayerState,
  type TokenPool,
  pileOf,
} from './types';
import { makeRng, shuffleInPlace } from './rng';
import { emptyColorVector, emptyPool } from './util';

export interface PlayerSeed {
  id: string;
  name: string;
  isAI: boolean;
}

export interface NewGameOptions {
  players: PlayerSeed[]; // 2–4 名
  cards: Card[];
  seed: number;
  config?: Partial<GameConfig>;
}

export const DEFAULT_CONFIG: GameConfig = {
  evolveFromReserved: true,
};

function makeDeck(key: PileKey, cards: Card[], slots: number): DeckState {
  const pile = cards.slice();
  const faceUp: (Card | null)[] = [];
  for (let i = 0; i < slots; i++) faceUp.push(pile.shift() ?? null);
  return { key, drawPile: pile, faceUp };
}

function makeTokenPool(playerCount: 2 | 3 | 4): TokenPool {
  const supply = COLOR_SUPPLY_BY_PLAYERS[playerCount];
  const pool = emptyPool();
  for (const c of COLOR_ORDER) pool[c] = supply;
  pool.master = MASTER_SUPPLY;
  return pool;
}

function makePlayer(seed: PlayerSeed): PlayerState {
  return {
    id: seed.id,
    name: seed.name,
    isAI: seed.isAI,
    tokens: emptyPool(),
    purchased: [],
    reserved: [],
    evolved: [],
    bonuses: emptyColorVector(),
    ownedSpecies: new Set<string>(),
    points: 0,
  };
}

export function createGame(opts: NewGameOptions): GameState {
  const n = opts.players.length;
  if (n < 2 || n > 4) throw new Error(`玩家数必须为 2–4，收到 ${n}`);
  const playerCount = n as 2 | 3 | 4;
  const config: GameConfig = { ...DEFAULT_CONFIG, ...opts.config };
  const rng = makeRng(opts.seed);

  const byPile: Record<PileKey, Card[]> = { 1: [], 2: [], 3: [], rare: [], legendary: [] };
  for (const card of opts.cards) byPile[pileOf(card)].push(card);

  const decks: Record<PileKey, DeckState> = {
    1: makeDeck(1, shuffleInPlace(byPile[1], rng), TIER_SLOTS),
    2: makeDeck(2, shuffleInPlace(byPile[2], rng), TIER_SLOTS),
    3: makeDeck(3, shuffleInPlace(byPile[3], rng), TIER_SLOTS),
    rare: makeDeck('rare', shuffleInPlace(byPile.rare, rng), SPECIAL_SLOTS),
    legendary: makeDeck('legendary', shuffleInPlace(byPile.legendary, rng), SPECIAL_SLOTS),
  };

  return {
    players: opts.players.map(makePlayer),
    currentPlayerIndex: 0,
    tokenPool: makeTokenPool(playerCount),
    decks,
    turnNumber: 1,
    roundStartIndex: 0,
    lastProgressTurn: 1,
    config,
    endTriggeredByPlayerIndex: null,
    isGameOver: false,
    awaitingDiscard: false,
    awaitingEvolve: false,
    rngSeed: opts.seed,
    log: [],
  };
}
