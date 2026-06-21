// =============================================================================
// 《璀璨宝石：宝可梦版》— 引擎类型契约 (src/engine/types.ts)
// 按 docs/RULES.md 的真实规则:5 色宝可梦球 + 大师球(百搭);进化(回合末免费动作);
// 稀有/传说两条可购买卡线;胜利 18 分;无贵族/无徽章。
// =============================================================================

// ----------------------------- 颜色 / 代币 -----------------------------------
export type Color = 'red' | 'blue' | 'black' | 'pink' | 'yellow';
export type PayableToken = Color | 'master'; // master = 大师球(百搭，等同基础版金币)

/** 固定颜色顺序：所有确定性 tiebreak 用它。 */
export const COLOR_ORDER: readonly Color[] = ['red', 'blue', 'black', 'pink', 'yellow'] as const;
export const PAYABLE_ORDER: readonly PayableToken[] = ['red', 'blue', 'black', 'pink', 'yellow', 'master'] as const;

/** 颜色计数（进化需求、加成等）。 */
export type ColorCost = Partial<Record<Color, number>>;
/** 可含大师球的成本（稀有/传说卡成本含 master）。 */
export type Cost = Partial<Record<PayableToken, number>>;
/** 满颜色向量（派生 bonus 用）。 */
export type ColorVector = Record<Color, number>;
/** 代币堆（含大师球）。 */
export type TokenPool = Record<PayableToken, number>;

export type Stage = 1 | 2 | 3;
export type CardKind = 'normal' | 'rare' | 'legendary';
/** 牌库/展示区分区键：普通三阶 + 稀有 + 传说。 */
export type PileKey = 1 | 2 | 3 | 'rare' | 'legendary';

// ----------------------------- 常量 ------------------------------------------
export const WIN_THRESHOLD = 18 as const;
export const HAND_LIMIT = 10 as const;
export const MAX_RESERVED = 3 as const;
export const TAKE_TWO_MIN_PILE = 4 as const;
export const MASTER_SUPPLY = 5 as const;
export const TIER_SLOTS = 4 as const; // 普通阶层展示 4 张
export const SPECIAL_SLOTS = 1 as const; // 稀有/传说各展示 1 张

/** 普通球按人数每色供给；大师球恒 5（[存疑] 默认采信，详见 RULES.md）。 */
export const COLOR_SUPPLY_BY_PLAYERS: Record<2 | 3 | 4, number> = { 2: 4, 3: 5, 4: 7 };

export const ALL_PILES: readonly PileKey[] = [1, 2, 3, 'rare', 'legendary'] as const;
export const TIER_PILES: readonly Stage[] = [1, 2, 3] as const;

// ----------------------------- 卡牌 (宝可梦) ---------------------------------
export interface Card {
  id: string; // 唯一实例 id（同物种有多张不同成本变体）
  speciesId: string; // 物种 key（进化目标 / 已拥物种用）
  name: string;
  nameZh: string;
  dexId: number; // 全国图鉴号（取官方插画用）
  kind: CardKind;
  stage: Stage; // 普通卡 1/2/3；稀有/传说固定 3（不参与进化，由 kind 守卫）
  cost: Cost; // 捕捉成本；稀有/传说含 master
  bonus: Color; // 永久加成颜色
  bonusAmount: number; // 普通卡 1；稀有/传说 2
  points: number; // 分数

  // --- 进化（仅普通 stage1/2 卡） ---
  evolveCost?: ColorCost; // 进化所需的永久加成图标数（不花代币）
  evolvesToSpeciesId?: string; // 下一阶物种
  art?: string;
}

// ----------------------------- 玩家 ------------------------------------------
export interface PlayerState {
  id: string;
  name: string;
  isAI: boolean;
  tokens: TokenPool; // 手中球（含大师球，总和 <=10）
  purchased: Card[]; // 桌面（提供 bonus 与分数）
  reserved: Card[]; // 预订区，<=3（不含稀有/传说）
  evolved: Card[]; // 已进化而面朝下的低阶卡：不计分/不加成，仅用于平局计数

  // 派生缓存（购买/进化后重算）
  bonuses: ColorVector; // 各色永久加成（含稀有/传说的 ×2）
  ownedSpecies: Set<string>;
  points: number; // sum(purchased.points)
}

// ----------------------------- 牌库 / 棋局 -----------------------------------
export interface DeckState {
  key: PileKey;
  drawPile: Card[];
  faceUp: (Card | null)[]; // 普通阶 4 张；稀有/传说 1 张
}

export interface GameConfig {
  /** 进化时下一阶卡是否也可取自本人预订手牌（[存疑] 默认 true）。 */
  evolveFromReserved: boolean;
}

export interface GameState {
  players: PlayerState[];
  currentPlayerIndex: number;
  tokenPool: TokenPool; // 共享供给
  decks: Record<PileKey, DeckState>;
  turnNumber: number;
  roundStartIndex: number;
  lastProgressTurn: number; // 僵局安全网
  config: GameConfig;

  endTriggeredByPlayerIndex: number | null;
  isGameOver: boolean;
  winnerId?: string;

  awaitingDiscard: boolean; // 取/预订后手牌>10，需弃牌
  awaitingEvolve: boolean; // 主动作后，可执行 1 次回合末进化或跳过

  rngSeed: number;
  log: string[];
}

// ----------------------------- 动作 ------------------------------------------
export interface TakeThreeAction {
  type: 'TAKE_THREE';
  colors: Color[]; // 1~3 个互异颜色（不可取大师球）
}
export interface TakeTwoAction {
  type: 'TAKE_TWO';
  color: Color; // 该堆取前 >=4
}
export interface ReserveAction {
  type: 'RESERVE';
  source: { kind: 'board'; cardId: string } | { kind: 'deck'; pile: Stage }; // 仅普通阶可预订
}
export interface BuyAction {
  type: 'BUY';
  source: { kind: 'board'; cardId: string } | { kind: 'reserved'; cardId: string };
  payment: TokenPool;
}
export interface DiscardAction {
  type: 'DISCARD';
  tokens: TokenPool;
}
export interface EvolveAction {
  type: 'EVOLVE';
  fromCardId: string; // 自己已购的低阶卡
  toCardId: string; // 展示区/预订区中同物种下一阶目标卡
}
export interface EndTurnAction {
  type: 'END_TURN'; // 放弃本回合进化
}
export type Action =
  | TakeThreeAction
  | TakeTwoAction
  | ReserveAction
  | BuyAction
  | DiscardAction
  | EvolveAction
  | EndTurnAction;

// --------------------- 购买结算（UI 可解释性） -------------------------------
export interface BuyResolution {
  baseCost: Cost;
  afterBonuses: Cost; // 颜色经 bonus 减免后的需付（不含 master 要求）
  masterRequired: number; // 卡面 master 成本（稀有/传说）
  colorShortfallToMaster: number; // 颜色不足、由大师球顶替的数量
  masterSpent: number; // = masterRequired + colorShortfallToMaster
  finalColorCost: Cost; // 实际用各色代币支付的部分
}

// --------------------- 数据集构建期校验器 ------------------------------------
export interface DeckValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}
export type ValidateDeck = (cards: Card[]) => DeckValidationResult;

/** 取卡所属分区。 */
export function pileOf(card: Card): PileKey {
  if (card.kind === 'rare') return 'rare';
  if (card.kind === 'legendary') return 'legendary';
  return card.stage;
}
