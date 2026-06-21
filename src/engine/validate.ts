// 构建期数据集校验:结构问题为 error,分布为 warning。
import {
  COLOR_ORDER,
  type Card,
  type DeckValidationResult,
} from './types';

export function validateDeck(cards: Card[]): DeckValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const ids = new Set<string>();
  const speciesStage = new Map<string, Set<number>>(); // species -> stages present (normal)
  for (const c of cards) {
    if (ids.has(c.id)) errors.push(`DUPLICATE_ID: ${c.id}`);
    ids.add(c.id);
    if (c.kind === 'normal') {
      if (!speciesStage.has(c.speciesId)) speciesStage.set(c.speciesId, new Set());
      speciesStage.get(c.speciesId)!.add(c.stage);
    }
  }

  for (const c of cards) {
    // 进化完整性:有 evolvesTo 的普通卡,其目标物种须存在且阶为 stage+1
    if (c.kind === 'normal' && c.evolvesToSpeciesId) {
      if (!c.evolveCost) errors.push(`MISSING_EVOLVE_COST: ${c.id}`);
      const targetStages = speciesStage.get(c.evolvesToSpeciesId);
      if (!targetStages || !targetStages.has(c.stage + 1)) {
        errors.push(`DANGLING_EVOLUTION: ${c.id} → ${c.evolvesToSpeciesId}(应为 stage${c.stage + 1})`);
      }
    }
    if (c.kind === 'normal' && c.stage >= 3 && c.evolvesToSpeciesId) {
      errors.push(`STAGE3_EVOLVES: ${c.id} 三阶不应有进化目标`);
    }
    // 稀有/传说:成本含 master、bonus ×2、不进化
    if (c.kind === 'rare' || c.kind === 'legendary') {
      if ((c.cost.master ?? 0) < 1) errors.push(`SPECIAL_NO_MASTER: ${c.id} 稀有/传说成本须含大师球`);
      if (c.bonusAmount !== 2) warnings.push(`SPECIAL_BONUS_AMT: ${c.id} 加成应为 2`);
      if (c.evolvesToSpeciesId) errors.push(`SPECIAL_EVOLVES: ${c.id} 稀有/传说不应进化`);
      if (c.kind === 'rare' && c.points !== 0) warnings.push(`RARE_POINTS: ${c.id} 稀有应 0 分`);
      if (c.kind === 'legendary' && c.points !== 2) warnings.push(`LEGENDARY_POINTS: ${c.id} 传说应 2 分`);
    } else {
      if (c.bonusAmount !== 1) warnings.push(`NORMAL_BONUS_AMT: ${c.id} 普通卡加成应为 1`);
      if ((c.cost.master ?? 0) > 0) warnings.push(`NORMAL_HAS_MASTER: ${c.id} 普通卡成本不应含大师球`);
    }
    // dexId
    if (!c.dexId) warnings.push(`NO_DEX: ${c.name}`);
  }

  // 分布(warning)
  const dist: Record<string, number> = {};
  for (const c of cards) {
    const k = c.kind === 'normal' ? `stage${c.stage}` : c.kind;
    dist[k] = (dist[k] ?? 0) + 1;
  }
  const expect: Record<string, number> = { stage1: 35, stage2: 30, stage3: 15, rare: 5, legendary: 5 };
  for (const k of Object.keys(expect)) {
    if (dist[k] !== expect[k]) warnings.push(`DIST: ${k} = ${dist[k] ?? 0}(期望 ${expect[k]})`);
  }

  void COLOR_ORDER;
  return { ok: errors.length === 0, errors, warnings };
}
