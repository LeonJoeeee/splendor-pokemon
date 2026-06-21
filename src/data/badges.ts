// 徽章池（占位）：5 个，模式 4+4 或 3+3+3，覆盖 5 色。
import type { Badge } from '../engine/types';

export const BADGES: Badge[] = [
  { id: 'boulder-badge', name: 'Boulder Badge', nameZh: '灰色徽章', requirement: { fire: 3, grass: 3, electric: 3 }, prestige: 3 },
  { id: 'cascade-badge', name: 'Cascade Badge', nameZh: '蓝色徽章', requirement: { water: 4, psychic: 4 }, prestige: 3 },
  { id: 'thunder-badge', name: 'Thunder Badge', nameZh: '橙色徽章', requirement: { electric: 4, grass: 4 }, prestige: 3 },
  { id: 'volcano-badge', name: 'Volcano Badge', nameZh: '火山徽章', requirement: { fire: 4, water: 4 }, prestige: 3 },
  { id: 'marsh-badge', name: 'Marsh Badge', nameZh: '金色徽章', requirement: { psychic: 3, grass: 3, water: 3 }, prestige: 3 },
];
