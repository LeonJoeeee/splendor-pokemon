// 引擎公共入口。
export * from './types';
export { makeRng, shuffleInPlace, type Rng } from './rng';
export {
  emptyColorVector,
  emptyPool,
  colorCostToVector,
  vectorToColorCost,
  totalTokens,
  sumCost,
  colorVectorMeets,
  clonePool,
} from './util';
export {
  computeBonuses,
  computeOwnedSpecies,
  computePoints,
  refreshPlayerDerived,
} from './derive';
export { resolveBuyCost, computePayment, canAfford, buildBuyAction } from './buy';
export { createGame, DEFAULT_CONFIG, type NewGameOptions, type PlayerSeed } from './setup';
export { legalMoves, legalEvolutions, canonicalDiscard, hasNoMoves } from './moves';
export { applyAction, passTurn } from './apply';
export { validateDeck } from './validate';
