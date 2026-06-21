// 颜色向量 / 代币池纯函数小工具。
import {
  COLOR_ORDER,
  PAYABLE_ORDER,
  type ColorCost,
  type ColorVector,
  type Cost,
  type TokenPool,
} from './types';

export function emptyColorVector(): ColorVector {
  return { red: 0, blue: 0, black: 0, pink: 0, yellow: 0 };
}

export function emptyPool(): TokenPool {
  return { red: 0, blue: 0, black: 0, pink: 0, yellow: 0, master: 0 };
}

export function colorCostToVector(cost: ColorCost): ColorVector {
  const v = emptyColorVector();
  for (const c of COLOR_ORDER) v[c] = cost[c] ?? 0;
  return v;
}

export function vectorToColorCost(v: ColorVector): ColorCost {
  const c: ColorCost = {};
  for (const e of COLOR_ORDER) if (v[e] > 0) c[e] = v[e];
  return c;
}

/** 手中代币总数（含大师球）。 */
export function totalTokens(pool: TokenPool): number {
  let n = 0;
  for (const t of PAYABLE_ORDER) n += pool[t];
  return n;
}

/** 成本各项之和（含 master）。 */
export function sumCost(cost: Cost): number {
  let n = 0;
  for (const t of PAYABLE_ORDER) n += cost[t] ?? 0;
  return n;
}

/** 满足 need(v) <= have(v) （各色）。 */
export function colorVectorMeets(have: ColorVector, need: ColorCost): boolean {
  for (const c of COLOR_ORDER) if (have[c] < (need[c] ?? 0)) return false;
  return true;
}

export function clonePool(pool: TokenPool): TokenPool {
  return { ...pool };
}
