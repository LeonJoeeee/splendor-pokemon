// 玩家派生缓存：bonus 向量、已拥物种、名望。引擎在购买/认领后调用刷新。
import { BADGE_PRESTIGE, type Card, type EnergyVector, type GameConfig, type PlayerState } from './types';
import { emptyVector } from './util';

/** 各色永久 bonus；启用招牌特性时 extraBonus 卡其 energy 额外计 amount。 */
export function computeBonuses(purchased: Card[], config: GameConfig): EnergyVector {
  const v = emptyVector();
  for (const card of purchased) {
    v[card.bonus] += 1;
    if (config.enableSignatureAbility && card.ability?.type === 'extraBonus') {
      v[card.ability.energy] += card.ability.amount;
    }
  }
  return v;
}

export function computeOwnedSpecies(purchased: Card[]): Set<string> {
  const s = new Set<string>();
  for (const card of purchased) s.add(card.speciesId);
  return s;
}

export function computePrestige(player: Pick<PlayerState, 'purchased' | 'badges'>): number {
  let p = 0;
  for (const card of player.purchased) p += card.prestige;
  p += player.badges.length * BADGE_PRESTIGE;
  return p;
}

/** 原地刷新玩家的所有派生字段。 */
export function refreshPlayerDerived(player: PlayerState, config: GameConfig): void {
  player.bonuses = computeBonuses(player.purchased, config);
  player.ownedSpecies = computeOwnedSpecies(player.purchased);
  player.prestige = computePrestige(player);
}
