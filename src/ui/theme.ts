// UI 主题:宝可梦球颜色显示元数据 + 官方插画地址。
import { COLOR_ORDER, type Color, type PayableToken } from '../engine/types';

export interface BallMeta {
  hex: string;
  zh: string; // 球名(颜色解耦:球名↔颜色待用户对实体卡确认,暂用颜色名)
  dark: boolean; // 文字是否用深色
}

export const BALL_META: Record<PayableToken, BallMeta> = {
  red: { hex: '#E3350D', zh: '红球', dark: false },
  blue: { hex: '#2E72D2', zh: '蓝球', dark: false },
  black: { hex: '#4a5160', zh: '黑球', dark: false },
  pink: { hex: '#E86A9A', zh: '粉球', dark: false },
  yellow: { hex: '#F2C94C', zh: '黄球', dark: true },
  master: { hex: '#7B3FA0', zh: '大师球', dark: false },
};

export const COLORS: readonly Color[] = COLOR_ORDER;

export function textOn(t: PayableToken): string {
  return BALL_META[t].dark ? '#1a1a1a' : '#ffffff';
}

/** 本地同源插画(public/sprites/,由 npm run sprites 下载;局域网/国内手机可直接看)。 */
export function pokeArt(dexId: number): string {
  return `/sprites/${dexId}.png`;
}
/** 本地缺图时的 CDN 兜底(jsDelivr 比 raw.githubusercontent 在国内更易访问)。 */
export function pokeArtFallback(dexId: number): string {
  return `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/other/official-artwork/${dexId}.png`;
}
