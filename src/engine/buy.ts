// 购买（捕捉）结算：严格顺序 bonus 减免 → 进化折扣(≤1) → (v2)属性克制 → 全局上限夹断 → 彩虹补缺。
import {
  MAX_DISCOUNT_PER_PURCHASE,
  SUPER_EFFECTIVE_AGAINST,
  ENERGY_ORDER,
  type BuyAction,
  type BuyResolution,
  type Card,
  type EnergyCost,
  type EnergyType,
  type GameConfig,
  type PlayerState,
  type TokenPool,
} from './types';
import { costToVector, emptyPool, maxNeedColor, vectorToCost } from './util';

/** 是否已『购买』(桌面)拥有同 family 且 stage 恰低一阶的卡 → 触发进化折扣。 */
export function hasEvolutionPrereq(player: PlayerState, card: Card): boolean {
  if (card.stage <= 1) return false;
  return player.purchased.some(
    (c) => c.family === card.family && c.stage === card.stage - 1,
  );
}

/** 主导属性 = 已购卡 bonus 最多色；并列按 ENERGY_ORDER 取首。无则 null。 */
export function dominantType(player: PlayerState): EnergyType | null {
  let best: EnergyType | null = null;
  let bestN = 0;
  for (const e of ENERGY_ORDER) {
    if (player.bonuses[e] > bestN) {
      bestN = player.bonuses[e];
      best = e;
    }
  }
  return best;
}

/** (v2) 该卡类型是否克制任一对手主导属性。 */
function hasTypeAdvantage(card: Card, opponents: PlayerState[]): boolean {
  const beats = SUPER_EFFECTIVE_AGAINST[card.bonus] ?? [];
  if (beats.length === 0) return false;
  for (const opp of opponents) {
    const dom = dominantType(opp);
    if (dom && beats.includes(dom)) return true;
  }
  return false;
}

/**
 * 计算与支付无关的成本结算（折扣后每色需付）。不修改任何状态。
 * opponents 仅 v2 属性克制用；v1 可省略。
 */
export function resolveBuyCost(
  player: PlayerState,
  card: Card,
  config: GameConfig,
  opponents: PlayerState[] = [],
): BuyResolution {
  const baseCostV = costToVector(card.cost);

  // 1. bonus 减免
  const remaining = costToVector(card.cost);
  for (const e of ENERGY_ORDER) {
    remaining[e] = Math.max(0, remaining[e] - player.bonuses[e]);
  }
  const afterBonuses = vectorToCost(remaining);

  let totalDiscount = 0;
  let evolutionDiscountApplied: BuyResolution['evolutionDiscountApplied'] = null;
  let typeAdvantageApplied: BuyResolution['typeAdvantageApplied'] = null;

  const applyDiscountUnit = (amount: number): { energy: EnergyType; amount: number } | null => {
    const room = MAX_DISCOUNT_PER_PURCHASE - totalDiscount;
    const want = Math.min(amount, room);
    if (want <= 0) return null;
    const color = maxNeedColor(vectorToCost(remaining));
    if (!color) return null; // 已无正需求，折扣无处可用
    const reduced = Math.min(want, remaining[color]);
    remaining[color] -= reduced;
    totalDiscount += reduced;
    return { energy: color, amount: reduced };
  };

  // 2. 进化折扣
  if (config.enableEvolutionDiscount && card.stage > 1 && hasEvolutionPrereq(player, card)) {
    evolutionDiscountApplied = applyDiscountUnit(card.evolutionDiscount);
  }

  // 3. (v2) 属性克制折扣
  if (config.enableTypeEffectiveness && hasTypeAdvantage(card, opponents)) {
    typeAdvantageApplied = applyDiscountUnit(1);
  }

  // 4. 全局上限已在 applyDiscountUnit 中夹断。
  const finalCost = vectorToCost(remaining);

  return {
    baseCost: vectorToCost(baseCostV),
    afterBonuses,
    evolutionDiscountApplied,
    typeAdvantageApplied,
    totalDiscount,
    finalCost,
    rainbowSpent: 0, // 由 computePayment 填充
  };
}

/**
 * 据折扣后需付与玩家手牌，贪心算出规范支付（自家能量优先，彩虹补缺）。
 * 不够则返回 null。
 */
export function computePayment(
  player: PlayerState,
  finalCost: EnergyCost,
): { payment: TokenPool; rainbowSpent: number } | null {
  const payment = emptyPool();
  let rainbowNeeded = 0;
  for (const e of ENERGY_ORDER) {
    const need = finalCost[e] ?? 0;
    const pay = Math.min(need, player.tokens[e]);
    payment[e] = pay;
    rainbowNeeded += need - pay;
  }
  if (player.tokens.rainbow < rainbowNeeded) return null;
  payment.rainbow = rainbowNeeded;
  return { payment, rainbowSpent: rainbowNeeded };
}

export function canAfford(
  player: PlayerState,
  card: Card,
  config: GameConfig,
  opponents: PlayerState[] = [],
): boolean {
  const res = resolveBuyCost(player, card, config, opponents);
  return computePayment(player, res.finalCost) !== null;
}

/**
 * 构造一个可直接执行的 BUY 动作（含规范支付）与其结算预览。不可负担则 null。
 */
export function buildBuyAction(
  player: PlayerState,
  card: Card,
  config: GameConfig,
  source: BuyAction['source'],
  opponents: PlayerState[] = [],
): { action: BuyAction; resolution: BuyResolution } | null {
  const resolution = resolveBuyCost(player, card, config, opponents);
  const pay = computePayment(player, resolution.finalCost);
  if (!pay) return null;
  resolution.rainbowSpent = pay.rainbowSpent;
  return {
    action: { type: 'BUY', source, payment: pay.payment },
    resolution,
  };
}
