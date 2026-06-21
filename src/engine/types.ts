// =============================================================================
// 宝可梦：训练家联盟 — 引擎类型契约 (src/engine/types.ts)
// 权威、自洽、可直接粘贴。v1 机制：进化链折扣 + 招牌特性(extraBonus)。
// 属性克制为 v2 可选模块，类型已预留但默认关闭。
// 来源：设计工作流 design-pokemon-splendor 的综合产物。
// =============================================================================

// ----------------------------- 能量 ------------------------------------------
export type EnergyType = 'grass' | 'fire' | 'water' | 'electric' | 'psychic';
export type PayableToken = EnergyType | 'rainbow'; // rainbow = 万能/gold

/** 固定能量顺序：所有确定性 tiebreak 必须用它。 */
export const ENERGY_ORDER: readonly EnergyType[] =
  ['grass', 'fire', 'water', 'electric', 'psychic'] as const;

/** 含彩虹的可支付顺序（仅用于稳定迭代 TokenPool）。 */
export const PAYABLE_ORDER: readonly PayableToken[] =
  ['grass', 'fire', 'water', 'electric', 'psychic', 'rainbow'] as const;

/** 各色计数（成本/bonus 用，rainbow 永不出现在卡面成本里）。 */
export type EnergyCost = Partial<Record<EnergyType, number>>;
/** 满向量（派生 bonus 等场景用，每色显式 >=0）。 */
export type EnergyVector = Record<EnergyType, number>;
/** 代币堆（含万能）。 */
export type TokenPool = Record<PayableToken, number>;

export type Tier = 1 | 2 | 3;
export type Stage = 1 | 2 | 3; // 1=基础, 2=一阶, 3=最终

// ----------------------- 属性克制 (v2 可选模块) -------------------------------
/** 封闭克制表，无自循环。v1 不结算，v2 启用。 */
export const SUPER_EFFECTIVE_AGAINST: Record<EnergyType, EnergyType[]> = {
  fire: ['grass'],
  grass: ['water'],
  water: ['fire'],
  electric: ['water'],
  psychic: ['fire'],
};

// ----------------------------- 常量 ------------------------------------------
export const WIN_THRESHOLD = 15 as const;
export const BADGE_PRESTIGE = 3 as const;
export const HAND_LIMIT = 10 as const;
export const MAX_RESERVED = 3 as const;
export const RAINBOW_SUPPLY = 5 as const;
export const TAKE_TWO_MIN_PILE = 4 as const;
export const BOARD_SLOTS_PER_TIER = 4 as const;
/** 每次购买所有折扣机制合计扣除上限（防跨机制复利）。 */
export const MAX_DISCOUNT_PER_PURCHASE = 3 as const;

export const ENERGY_SUPPLY_BY_PLAYERS: Record<2 | 3 | 4, number> = {
  2: 4,
  3: 5,
  4: 7,
};

// ------------------------- 招牌特性 (v1: 仅 extraBonus) -----------------------
export interface ExtraBonusAbility {
  type: 'extraBonus';
  energy: EnergyType; // 不变式: 必须 === 所在卡的 bonus
  amount: 1; // v1 固定为 1
}
/** 闭合联合；将来扩展在此追加。 */
export type CardAbility = ExtraBonusAbility;

// ----------------------------- 卡牌 (宝可梦) ---------------------------------
export interface Card {
  id: string; // 唯一实例 id，如 "charmander-t1-014"
  speciesId: string; // 物种 key，如 "CHARMANDER"（进化检查用）
  name: string; // "Charmander"
  nameZh: string; // "小火龙"
  tier: Tier;
  cost: EnergyCost; // 各色捕捉成本（无 rainbow）
  bonus: EnergyType; // 该宝可梦产出的唯一永久属性
  prestige: number; // 点数 (tier1:0|1, tier2:1-3, tier3:3-5)
  weakness: EnergyType; // 弱点属性（v2 属性克制用；v1 仅作数据）

  // --- 进化机制 ---
  family: string; // 进化家族 id，如 "charmander-line"
  stage: Stage;
  evolvesFromFamily?: string; // === family；当且仅当 stage>1 出现
  evolutionDiscount: 0 | 1 | 2; // 印在卡面；v1 数据全为 1（stage>1），stage1 为 0

  // --- 可选招牌特性（tier3 少数） ---
  ability?: CardAbility;
  art?: string;
}

// ----------------------------- 徽章 (贵族) -----------------------------------
export interface Badge {
  id: string;
  name: string; // "Cascade Badge"
  nameZh: string; // "蓝色徽章"
  requirement: EnergyCost; // 各类型所需 bonus 数，如 {water:4, psychic:4}
  prestige: 3; // 恒为 3
  art?: string;
}

// ----------------------------- 玩家 ------------------------------------------
export interface PlayerState {
  id: string;
  name: string;
  isAI: boolean;
  tokens: TokenPool; // 手中能量 + 彩虹（总和 <=10）
  purchased: Card[]; // 桌面（提供 bonus 与点数）
  reserved: Card[]; // 预定区，<=3
  badges: Badge[]; // 已获徽章
  prestige: number; // 缓存 = sum(purchased.prestige) + 3*badges.length

  // --- 派生缓存（引擎在每次购买后重算，AI 直接读） ---
  /** 各色永久 bonus 数；extraBonus 卡其 energy 计 2。 */
  bonuses: EnergyVector;
  /** 已拥有物种集合，进化前置 O(1) 检查。 */
  ownedSpecies: Set<string>;
}

// ----------------------------- 牌库 / 棋局 -----------------------------------
export interface DeckState {
  tier: Tier;
  drawPile: Card[]; // 顶 = index 0
  faceUp: (Card | null)[]; // 长度 4；null 仅当该层牌库耗尽
}

export interface GameConfig {
  enableEvolutionDiscount: boolean; // 默认 true
  enableSignatureAbility: boolean; // 默认 true
  enableTypeEffectiveness: boolean; // 默认 false (v2)
}

export interface GameState {
  players: PlayerState[];
  currentPlayerIndex: number;
  tokenPool: TokenPool; // 共享供给
  decks: Record<Tier, DeckState>;
  badges: Badge[]; // 未被认领的可用徽章
  turnNumber: number;
  roundStartIndex: number; // 用于判定「回合数相等」终局
  lastProgressTurn: number; // 最近一次有人购买/认领徽章的 turnNumber（僵局安全网用）
  config: GameConfig;

  // 终局簿记
  endTriggeredByPlayerIndex: number | null; // 有人达 15 时设置
  isGameOver: boolean;
  winnerId?: string;

  // 子阶段：取/预定后手牌 >10 时，当前玩家需先弃牌再结束回合。
  // （对 types.ts 的最小引擎扩展：DISCARD 是设计中的独立动作，需一个 await 标志驱动。）
  awaitingDiscard: boolean;

  rngSeed: number; // 种子化洗牌，可复现
  log: string[];
}

// ----------------------------- 动作 ------------------------------------------
export interface TakeThreeAction {
  type: 'TAKE_THREE';
  energies: EnergyType[]; // 恰好 3 个互异类型（供给不足时可少于 3）
}
export interface TakeTwoAction {
  type: 'TAKE_TWO';
  energy: EnergyType; // 该堆取前必须 >=4
}
export interface ReserveAction {
  type: 'RESERVE';
  source: { kind: 'board'; cardId: string } | { kind: 'deck'; tier: Tier };
}
export interface BuyAction {
  type: 'BUY';
  source:
    | { kind: 'board'; cardId: string }
    | { kind: 'reserved'; cardId: string };
  /** 显式支付，引擎据此校验彩虹替代；引擎自动应用折扣后求需付。 */
  payment: TokenPool;
}
export interface DiscardAction {
  type: 'DISCARD';
  tokens: TokenPool; // 仅当超过 10 上限时在回合末触发
}
export type Action =
  | TakeThreeAction
  | TakeTwoAction
  | ReserveAction
  | BuyAction
  | DiscardAction;

// --------------------- 购买结算（UI/AI 可解释性） ----------------------------
export interface BuyResolution {
  baseCost: EnergyCost;
  afterBonuses: EnergyCost;
  /** 进化折扣命中的颜色与扣减量（v1 amount 恒 1）；未命中为 null。 */
  evolutionDiscountApplied: { energy: EnergyType; amount: number } | null;
  /** v2 属性克制命中颜色；v1 恒 null。 */
  typeAdvantageApplied: { energy: EnergyType; amount: number } | null;
  /** 折扣总和（受 MAX_DISCOUNT_PER_PURCHASE 夹断后）。 */
  totalDiscount: number;
  finalCost: EnergyCost; // 实际需付（彩虹前）
  rainbowSpent: number;
  badgeAwarded?: Badge;
}

// --------------------- 数据集构建期校验器签名 --------------------------------
export interface DeckValidationResult {
  ok: boolean;
  errors: string[]; // 例: "DANGLING_FAMILY: charizard stage3 缺同家族 stage2"
  warnings: string[]; // 例: "COLOR_PARITY: fire 总成本偏高 12%"
}
export type ValidateDeck = (
  cards: Card[],
  badges: Badge[],
) => DeckValidationResult;
