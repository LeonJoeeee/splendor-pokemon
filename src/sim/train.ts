// 训练启发式 AI 权重:自对弈坐标上升法,适应度 = heuristic(w) 对 greedy 基线的胜率。
// 运行:npx tsx src/sim/train.ts [每候选对局数]
import { applyAction, createGame, legalMoves, passTurn, type GameState } from '../engine';
import { makeRng } from '../engine/rng';
import { greedyPolicy, type Policy } from '../ai/policies';
import { heuristicPolicy, DEFAULT_WEIGHTS, type Weights } from '../ai/heuristic';
import { CARDS } from '../data/cards';

function play2p(seed: number, p0: Policy, p1: Policy): 0 | 1 | null {
  let s: GameState = createGame({ players: [{ id: 'P0', name: 'A', isAI: true }, { id: 'P1', name: 'B', isAI: true }], cards: CARDS, seed });
  const rng = makeRng((seed ^ 0x1234) >>> 0);
  let it = 0;
  while (!s.isGameOver) {
    if (it++ > 2000) break;
    const m = legalMoves(s);
    if (!m.length) { s = passTurn(s); continue; }
    s = applyAction(s, (s.currentPlayerIndex === 0 ? p0 : p1)(m, s, rng));
  }
  if (!s.winnerId) return null;
  return s.winnerId === 'P0' ? 0 : 1;
}

const SEED0 = 7;
function fitness(w: Weights, n: number): number {
  const h = heuristicPolicy(w);
  let wins = 0, games = 0;
  for (let i = 0; i < n; i++) {
    const seed = SEED0 + i;
    const r = i % 2 === 0 ? play2p(seed, h, greedyPolicy) : play2p(seed, greedyPolicy, h);
    if (r === null) continue;
    games++;
    if ((i % 2 === 0 && r === 0) || (i % 2 === 1 && r === 1)) wins++;
  }
  return games ? wins / games : 0;
}

const KEYS = Object.keys(DEFAULT_WEIGHTS) as (keyof Weights)[];
const N = Number(process.argv[2] ?? 40);
let best: Weights = { ...DEFAULT_WEIGHTS };
let bestFit = fitness(best, N);
console.log(`init fitness vs greedy (n=${N}): ${bestFit.toFixed(3)}`);

for (let pass = 0; pass < 3; pass++) {
  for (const k of KEYS) {
    for (const delta of [1.6, 1 / 1.6]) {
      const cand: Weights = { ...best, [k]: Math.max(0, best[k] * delta) };
      const f = fitness(cand, N);
      if (f > bestFit + 0.001) {
        bestFit = f; best = cand;
        console.log(`  + ${k} *${delta.toFixed(2)} -> ${f.toFixed(3)}`);
      }
    }
  }
  console.log(`pass ${pass}: ${bestFit.toFixed(3)} ${JSON.stringify(best)}`);
}
console.log('FINAL_FITNESS', bestFit.toFixed(3));
console.log('FINAL_WEIGHTS', JSON.stringify(best));
