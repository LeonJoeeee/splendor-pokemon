// 能量向量 / 代币池的纯函数小工具。
import {
  ENERGY_ORDER,
  PAYABLE_ORDER,
  type EnergyCost,
  type EnergyType,
  type EnergyVector,
  type PayableToken,
  type TokenPool,
} from './types';

export function emptyVector(): EnergyVector {
  return { grass: 0, fire: 0, water: 0, electric: 0, psychic: 0 };
}

export function emptyPool(): TokenPool {
  return { grass: 0, fire: 0, water: 0, electric: 0, psychic: 0, rainbow: 0 };
}

/** EnergyCost（稀疏）转为满向量。 */
export function costToVector(cost: EnergyCost): EnergyVector {
  const v = emptyVector();
  for (const e of ENERGY_ORDER) v[e] = cost[e] ?? 0;
  return v;
}

/** 满向量转为稀疏 EnergyCost（仅保留 >0）。 */
export function vectorToCost(v: EnergyVector): EnergyCost {
  const c: EnergyCost = {};
  for (const e of ENERGY_ORDER) if (v[e] > 0) c[e] = v[e];
  return c;
}

/** 手中能量代币总数（含彩虹）。 */
export function totalTokens(pool: TokenPool): number {
  let n = 0;
  for (const t of PAYABLE_ORDER) n += pool[t];
  return n;
}

/** 仅非彩虹能量总数。 */
export function totalEnergyTokens(pool: TokenPool): number {
  let n = 0;
  for (const e of ENERGY_ORDER) n += pool[e];
  return n;
}

export function sumCost(cost: EnergyCost): number {
  let n = 0;
  for (const e of ENERGY_ORDER) n += cost[e] ?? 0;
  return n;
}

export function clonePool(pool: TokenPool): TokenPool {
  return { ...pool };
}

export function addToken(pool: TokenPool, t: PayableToken, n = 1): void {
  pool[t] += n;
}

/** 返回剩余需求量最大的能量色；并列按 ENERGY_ORDER 取首。无正需求返回 null。 */
export function maxNeedColor(need: EnergyCost): EnergyType | null {
  let best: EnergyType | null = null;
  let bestN = 0;
  for (const e of ENERGY_ORDER) {
    const n = need[e] ?? 0;
    if (n > bestN) {
      bestN = n;
      best = e;
    }
  }
  return best;
}
