// 自对弈 harness:批量种子化对局,断言终止、无非法状态、不变量守恒。
// 供 vitest 调用,也可 `npm run sim` 运行。
import { applyAction, createGame, legalMoves, passTurn, totalTokens, type GameState } from '../engine';
import { ALL_PILES, PAYABLE_ORDER } from '../engine/types';
import { makeRng } from '../engine/rng';
import { greedyPolicy, randomPolicy, type Policy } from '../ai/policies';
import { CARDS } from '../data/cards';

export { greedyPolicy, randomPolicy, type Policy } from '../ai/policies';

const TURN_CAP = 2000;

export function totalTokensInPlay(state: GameState): number {
  let n = 0;
  for (const t of PAYABLE_ORDER) n += state.tokenPool[t];
  for (const p of state.players) n += totalTokens(p.tokens);
  return n;
}

export function totalCardsInPlay(state: GameState): number {
  let n = 0;
  for (const pile of ALL_PILES) {
    n += state.decks[pile].drawPile.length;
    n += state.decks[pile].faceUp.filter(Boolean).length;
  }
  for (const p of state.players) n += p.purchased.length + p.reserved.length + p.evolved.length;
  return n;
}

export interface GameResult {
  seed: number;
  numPlayers: number;
  turns: number;
  winnerId?: string;
  maxPoints: number;
  evolutions: number;
  stalemate: boolean;
  tokenInvariantOk: boolean;
  cardInvariantOk: boolean;
}

export function playGame(seed: number, numPlayers: number, policy: Policy): GameResult {
  const players = Array.from({ length: numPlayers }, (_, i) => ({ id: `P${i}`, name: `玩家${i + 1}`, isAI: true }));
  let state = createGame({ players, cards: CARDS, seed });
  const initialTokens = totalTokensInPlay(state);
  const initialCards = totalCardsInPlay(state);
  const rng = makeRng(seed ^ 0x9e3779b9);

  let iter = 0;
  let tokenInvariantOk = true;
  let cardInvariantOk = true;

  while (!state.isGameOver) {
    if (iter++ > TURN_CAP) throw new Error('超过回合上限,疑似死循环');
    const moves = legalMoves(state);
    if (moves.length === 0) state = passTurn(state);
    else state = applyAction(state, policy(moves, state, rng));
    if (totalTokensInPlay(state) !== initialTokens) tokenInvariantOk = false;
    if (totalCardsInPlay(state) !== initialCards) cardInvariantOk = false;
  }

  return {
    seed,
    numPlayers,
    turns: state.turnNumber,
    winnerId: state.winnerId,
    maxPoints: Math.max(...state.players.map((p) => p.points)),
    evolutions: state.players.reduce((s, p) => s + p.evolved.length, 0),
    stalemate: state.log.some((l) => l.startsWith('僵局')),
    tokenInvariantOk,
    cardInvariantOk,
  };
}

export function playGreedyGame(seed: number, numPlayers: number): GameResult {
  return playGame(seed, numPlayers, greedyPolicy);
}

export interface BatchReport {
  games: number;
  policy: string;
  allHaveWinner: boolean;
  realWins: number;
  stalemates: number;
  tokenInvariantHeld: boolean;
  cardInvariantHeld: boolean;
  avgTurns: number;
  minTurns: number;
  maxTurns: number;
  avgMaxPoints: number;
  avgEvolutions: number;
  failures: string[];
}

export function runBatch(count: number, startSeed = 1, policy: Policy = randomPolicy, policyName = 'random'): BatchReport {
  const failures: string[] = [];
  let totalTurns = 0, minTurns = Infinity, maxTurns = 0, realWins = 0, stalemates = 0, pts = 0, evos = 0;
  let allHaveWinner = true, tokenInvariantHeld = true, cardInvariantHeld = true;

  for (let i = 0; i < count; i++) {
    const seed = startSeed + i;
    const numPlayers = 2 + (i % 3);
    try {
      const r = playGame(seed, numPlayers, policy);
      totalTurns += r.turns;
      minTurns = Math.min(minTurns, r.turns);
      maxTurns = Math.max(maxTurns, r.turns);
      pts += r.maxPoints;
      evos += r.evolutions;
      if (r.stalemate) stalemates++; else realWins++;
      if (!r.winnerId) { allHaveWinner = false; failures.push(`seed ${seed}: 无获胜者`); }
      if (!r.tokenInvariantOk) { tokenInvariantHeld = false; failures.push(`seed ${seed}: 代币不守恒`); }
      if (!r.cardInvariantOk) { cardInvariantHeld = false; failures.push(`seed ${seed}: 卡牌不守恒`); }
    } catch (e) {
      failures.push(`seed ${seed}: ${(e as Error).message}`);
    }
  }

  return {
    games: count, policy: policyName, allHaveWinner, realWins, stalemates,
    tokenInvariantHeld, cardInvariantHeld,
    avgTurns: totalTurns / count, minTurns, maxTurns,
    avgMaxPoints: pts / count, avgEvolutions: evos / count, failures,
  };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const n = Number(process.argv[2] ?? 500);
  console.log('随机:', JSON.stringify(runBatch(n, 1, randomPolicy, 'random'), null, 2));
  console.log('贪心:', JSON.stringify(runBatch(n, 1, greedyPolicy, 'greedy'), null, 2));
}
