// 购买(捕捉)结算:颜色经永久加成减免;大师球可顶替颜色缺口;稀有/传说成本含的 master 须用大师球代币支付。
import {
  COLOR_ORDER,
  type BuyAction,
  type BuyResolution,
  type Card,
  type Cost,
  type PlayerState,
  type TokenPool,
} from './types';
import { emptyPool } from './util';

/** 与支付无关的成本结算(不改状态)。 */
export function resolveBuyCost(player: PlayerState, card: Card): BuyResolution {
  const baseCost: Cost = { ...card.cost };
  const finalColorCost: Cost = {};
  for (const c of COLOR_ORDER) {
    const need = Math.max(0, (card.cost[c] ?? 0) - player.bonuses[c]);
    if (need > 0) finalColorCost[c] = need;
  }
  const masterRequired = card.cost.master ?? 0;
  return {
    baseCost,
    afterBonuses: { ...finalColorCost },
    masterRequired,
    colorShortfallToMaster: 0,
    masterSpent: masterRequired,
    finalColorCost,
  };
}

/**
 * 规范支付:各色优先用本色代币,不足用大师球顶替;再加上卡面 master 要求。
 * 负担不起返回 null。
 */
export function computePayment(
  player: PlayerState,
  card: Card,
): { payment: TokenPool; resolution: BuyResolution } | null {
  const resolution = resolveBuyCost(player, card);
  const payment = emptyPool();
  let shortfall = 0;
  for (const c of COLOR_ORDER) {
    const need = resolution.finalColorCost[c] ?? 0;
    const pay = Math.min(need, player.tokens[c]);
    payment[c] = pay;
    shortfall += need - pay;
  }
  const masterNeeded = shortfall + resolution.masterRequired;
  if (player.tokens.master < masterNeeded) return null;
  payment.master = masterNeeded;
  resolution.colorShortfallToMaster = shortfall;
  resolution.masterSpent = masterNeeded;
  return { payment, resolution };
}

export function canAfford(player: PlayerState, card: Card): boolean {
  return computePayment(player, card) !== null;
}

/** 构造可执行 BUY 动作 + 结算预览;负担不起返回 null。 */
export function buildBuyAction(
  player: PlayerState,
  card: Card,
  source: BuyAction['source'],
): { action: BuyAction; resolution: BuyResolution } | null {
  const pay = computePayment(player, card);
  if (!pay) return null;
  return { action: { type: 'BUY', source, payment: pay.payment }, resolution: pay.resolution };
}
