// 构建期数据集校验：结构问题为 error（构建失败），分布/配平为 warning。
import {
  ENERGY_ORDER,
  type Badge,
  type Card,
  type DeckValidationResult,
  type EnergyType,
} from './types';
import { sumCost } from './util';

export function validateDeck(cards: Card[], badges: Badge[]): DeckValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 唯一 id
  const ids = new Set<string>();
  for (const c of cards) {
    if (ids.has(c.id)) errors.push(`DUPLICATE_ID: ${c.id}`);
    ids.add(c.id);
  }
  const speciesSeen = new Set<string>();
  for (const c of cards) {
    if (speciesSeen.has(c.speciesId)) warnings.push(`DUPLICATE_SPECIES: ${c.speciesId}`);
    speciesSeen.add(c.speciesId);
  }

  // 进化结构
  for (const c of cards) {
    if (c.stage > 1) {
      if (c.evolvesFromFamily !== c.family) {
        errors.push(`EVOLVE_FAMILY_MISMATCH: ${c.id} evolvesFromFamily 须 === family`);
      }
      const prereq = cards.find(
        (p) => p.family === c.family && p.stage === c.stage - 1 && p.tier <= c.tier,
      );
      if (!prereq) {
        errors.push(`DANGLING_FAMILY: ${c.id}(stage${c.stage}) 缺同 family stage${c.stage - 1} 前置（且 tier 不更高）`);
      }
      if (c.evolutionDiscount < 1) {
        warnings.push(`NO_EVO_DISCOUNT: ${c.id} stage>1 但 evolutionDiscount=${c.evolutionDiscount}`);
      }
    } else {
      if (c.evolvesFromFamily !== undefined) {
        errors.push(`STAGE1_HAS_EVOLVE_FROM: ${c.id} stage1 不应有 evolvesFromFamily`);
      }
      if (c.evolutionDiscount !== 0) {
        warnings.push(`STAGE1_DISCOUNT_NONZERO: ${c.id}`);
      }
    }
    // 招牌特性约束
    if (c.ability?.type === 'extraBonus' && c.ability.energy !== c.bonus) {
      errors.push(`ABILITY_ENERGY_MISMATCH: ${c.id} extraBonus.energy 须 === bonus`);
    }
  }

  // 颜色配平（warning）：各色总成本份额偏离均值 >10% 提示
  const costByColor: Record<EnergyType, number> = {
    grass: 0, fire: 0, water: 0, electric: 0, psychic: 0,
  };
  let totalCost = 0;
  for (const c of cards) {
    for (const e of ENERGY_ORDER) {
      const v = c.cost[e] ?? 0;
      costByColor[e] += v;
      totalCost += v;
    }
  }
  if (totalCost > 0) {
    const mean = totalCost / ENERGY_ORDER.length;
    for (const e of ENERGY_ORDER) {
      const dev = (costByColor[e] - mean) / mean;
      if (Math.abs(dev) > 0.1) {
        warnings.push(`COLOR_PARITY: ${e} 总成本份额偏离均值 ${(dev * 100).toFixed(0)}%`);
      }
    }
  }

  // 徽章（warning）：模式 4+4 或 3+3+3、prestige=3、5 色覆盖
  const badgeColorCount: Record<EnergyType, number> = {
    grass: 0, fire: 0, water: 0, electric: 0, psychic: 0,
  };
  for (const b of badges) {
    if (b.prestige !== 3) errors.push(`BADGE_PRESTIGE: ${b.id} prestige 须为 3`);
    const colors = ENERGY_ORDER.filter((e) => (b.requirement[e] ?? 0) > 0);
    const total = sumCost(b.requirement);
    const pattern44 = colors.length === 2 && total === 8;
    const pattern333 = colors.length === 3 && total === 9;
    if (!pattern44 && !pattern333) {
      warnings.push(`BADGE_PATTERN: ${b.id} 非 4+4 或 3+3+3（colors=${colors.length}, total=${total}）`);
    }
    for (const e of colors) badgeColorCount[e] += 1;
  }
  for (const e of ENERGY_ORDER) {
    if (badges.length > 0 && badgeColorCount[e] === 0) {
      warnings.push(`BADGE_COVERAGE: ${e} 未被任何徽章要求覆盖`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
