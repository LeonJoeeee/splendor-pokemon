// 玩家派生缓存：bonus 向量(含稀有/传说 ×2)、已拥物种、分数。购买/进化后调用。
import type { Card, ColorVector, PlayerState } from './types';
import { emptyColorVector } from './util';

/** 各色永久加成；每张卡按 bonusAmount(普通 1 / 稀有传说 2)累加到其 bonus 色。 */
export function computeBonuses(purchased: Card[]): ColorVector {
  const v = emptyColorVector();
  for (const card of purchased) v[card.bonus] += card.bonusAmount;
  return v;
}

export function computeOwnedSpecies(purchased: Card[]): Set<string> {
  const s = new Set<string>();
  for (const card of purchased) s.add(card.speciesId);
  return s;
}

export function computePoints(purchased: Card[]): number {
  let p = 0;
  for (const card of purchased) p += card.points;
  return p;
}

/** 原地刷新玩家派生字段。 */
export function refreshPlayerDerived(player: PlayerState): void {
  player.bonuses = computeBonuses(player.purchased);
  player.ownedSpecies = computeOwnedSpecies(player.purchased);
  player.points = computePoints(player.purchased);
}
