// 客户端 ⇄ 服务器 消息协议(单桌)。
import type { Action } from '../engine';

export type SeatKind = 'empty' | 'human' | 'ai';
export interface SeatInfo {
  idx: number;
  name: string;
  kind: SeatKind;
  connected: boolean;
}

// 客户端 → 服务器
export type ClientMsg =
  | { t: 'join'; name: string }
  | { t: 'setSeat'; idx: number; kind: SeatKind } // 大厅:把空座设为 ai / 让出
  | { t: 'start' }
  | { t: 'action'; action: Action }
  | { t: 'reset' }; // 回到大厅 / 新开一局

// 服务器 → 客户端
export type ServerMsg =
  | { t: 'welcome'; connId: string; seatIdx: number | null }
  | { t: 'lobby'; seats: SeatInfo[]; canStart: boolean }
  | { t: 'state'; state: string; seats: SeatInfo[]; yourSeat: number | null; yourPlayerIndex: number | null }
  | { t: 'error'; msg: string };

export const DEFAULT_PORT = 8787;
export const MAX_SEATS = 4;
