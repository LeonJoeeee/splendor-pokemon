// 引擎公共入口。
export * from './types';
export { makeRng, shuffleInPlace, type Rng } from './rng';
export {
  emptyVector,
  emptyPool,
  costToVector,
  vectorToCost,
  totalTokens,
  totalEnergyTokens,
  sumCost,
  maxNeedColor,
} from './util';
export {
  computeBonuses,
  computeOwnedSpecies,
  computePrestige,
  refreshPlayerDerived,
} from './derive';
export {
  hasEvolutionPrereq,
  dominantType,
  resolveBuyCost,
  computePayment,
  canAfford,
  buildBuyAction,
} from './buy';
export {
  createGame,
  DEFAULT_CONFIG,
  type NewGameOptions,
  type PlayerSeed,
} from './setup';
export { legalMoves, canonicalDiscard, hasNoMoves } from './moves';
export { applyAction, passTurn } from './apply';
export { validateDeck } from './validate';
