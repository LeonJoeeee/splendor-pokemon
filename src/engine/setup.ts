// 开局：种子化洗牌，构建牌库/明牌区/代币供给/徽章/玩家。
import {
  BOARD_SLOTS_PER_TIER,
  ENERGY_SUPPLY_BY_PLAYERS,
  ENERGY_ORDER,
  RAINBOW_SUPPLY,
  type Badge,
  type Card,
  type DeckState,
  type GameConfig,
  type GameState,
  type PlayerState,
  type Tier,
  type TokenPool,
} from './types';
import { makeRng, shuffleInPlace } from './rng';
import { emptyPool, emptyVector } from './util';

export interface PlayerSeed {
  id: string;
  name: string;
  isAI: boolean;
}

export interface NewGameOptions {
  players: PlayerSeed[]; // 2–4 名
  cards: Card[];
  badges: Badge[];
  seed: number;
  config?: Partial<GameConfig>;
}

export const DEFAULT_CONFIG: GameConfig = {
  enableEvolutionDiscount: true,
  enableSignatureAbility: true,
  enableTypeEffectiveness: false,
};

function makeDeck(tier: Tier, cards: Card[]): DeckState {
  const pile = cards.slice();
  const faceUp: (Card | null)[] = [];
  for (let i = 0; i < BOARD_SLOTS_PER_TIER; i++) {
    faceUp.push(pile.shift() ?? null);
  }
  return { tier, drawPile: pile, faceUp };
}

function makeTokenPool(playerCount: 2 | 3 | 4): TokenPool {
  const supply = ENERGY_SUPPLY_BY_PLAYERS[playerCount];
  const pool = emptyPool();
  for (const e of ENERGY_ORDER) pool[e] = supply;
  pool.rainbow = RAINBOW_SUPPLY;
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
    badges: [],
    prestige: 0,
    bonuses: emptyVector(),
    ownedSpecies: new Set<string>(),
  };
}

export function createGame(opts: NewGameOptions): GameState {
  const n = opts.players.length;
  if (n < 2 || n > 4) throw new Error(`玩家数必须为 2–4，收到 ${n}`);
  const playerCount = n as 2 | 3 | 4;

  const config: GameConfig = { ...DEFAULT_CONFIG, ...opts.config };
  const rng = makeRng(opts.seed);

  const byTier: Record<Tier, Card[]> = { 1: [], 2: [], 3: [] };
  for (const card of opts.cards) byTier[card.tier].push(card);
  const decks: Record<Tier, DeckState> = {
    1: makeDeck(1, shuffleInPlace(byTier[1], rng)),
    2: makeDeck(2, shuffleInPlace(byTier[2], rng)),
    3: makeDeck(3, shuffleInPlace(byTier[3], rng)),
  };

  const badgePool = shuffleInPlace(opts.badges.slice(), rng);
  const badgeCount = n + 1;
  if (badgePool.length < badgeCount) {
    throw new Error(`徽章不足：需要 ${badgeCount}，仅有 ${badgePool.length}`);
  }
  const badges = badgePool.slice(0, badgeCount);

  return {
    players: opts.players.map(makePlayer),
    currentPlayerIndex: 0,
    tokenPool: makeTokenPool(playerCount),
    decks,
    badges,
    turnNumber: 1,
    roundStartIndex: 0,
    lastProgressTurn: 1,
    config,
    endTriggeredByPlayerIndex: null,
    isGameOver: false,
    awaitingDiscard: false,
    rngSeed: opts.seed,
    log: [],
  };
}
