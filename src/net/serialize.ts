// GameState 网络序列化:ownedSpecies 是 Set(JSON 不支持)→ 序列化时丢弃,反序列化时由 purchased 重建。
import { computeOwnedSpecies, type GameState } from '../engine';

export function serializeState(state: GameState): string {
  return JSON.stringify(state, (_k, v) => (v instanceof Set ? undefined : v));
}

export function deserializeState(json: string): GameState {
  const obj = JSON.parse(json) as GameState;
  for (const p of obj.players) p.ownedSpecies = computeOwnedSpecies(p.purchased);
  return obj;
}

/** 结构化克隆同款重建(用于把对象形态的 state 复原 Set,而非从字符串)。 */
export function reviveState(obj: GameState): GameState {
  for (const p of obj.players) p.ownedSpecies = computeOwnedSpecies(p.purchased);
  return obj;
}
