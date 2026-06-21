// UI 主题：能量类型的显示元数据。
import { ENERGY_ORDER, type EnergyType, type PayableToken } from '../engine/types';

export interface EnergyMeta {
  hex: string;
  zh: string;
  icon: string;
}

export const ENERGY_META: Record<PayableToken, EnergyMeta> = {
  grass: { hex: '#4FA85B', zh: '草', icon: '🌿' },
  fire: { hex: '#E8463A', zh: '火', icon: '🔥' },
  water: { hex: '#3D9BE9', zh: '水', icon: '💧' },
  electric: { hex: '#F2C94C', zh: '电', icon: '⚡' },
  psychic: { hex: '#A56FB5', zh: '超', icon: '🔮' },
  rainbow: { hex: '#C9C9CF', zh: '彩', icon: '🌈' },
};

export const ENERGIES: readonly EnergyType[] = ENERGY_ORDER;

/** 深色文字 or 浅色文字（电/彩用深色更清晰）。 */
export function textOn(token: PayableToken): string {
  return token === 'electric' || token === 'rainbow' ? '#1a1a1a' : '#ffffff';
}
