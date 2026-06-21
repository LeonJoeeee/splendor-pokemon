// 单桌房间逻辑(权威):座位/大厅/开局/动作/AI 与掉线代打。无 WebSocket 依赖,可单测。
import { applyAction, createGame, legalMoves, type Action, type GameState } from '../engine';
import { makeRng } from '../engine/rng';
import { heuristicPolicy } from '../ai/heuristic';

const AI = heuristicPolicy();
import { CARDS } from '../data/cards';
import { serializeState } from './serialize';
import { MAX_SEATS, type SeatInfo, type SeatKind, type ServerMsg } from './protocol';

interface Seat {
  idx: number;
  name: string;
  kind: SeatKind;
  connId: string | null;
}

export class Room {
  seats: Seat[] = Array.from({ length: MAX_SEATS }, (_, idx) => ({ idx, name: '', kind: 'empty', connId: null }));
  game: GameState | null = null;
  started = false;
  playerSeats: number[] = []; // game player index -> seat idx
  private seedCounter = 1;

  // ---- 大厅 ----
  join(connId: string, name: string): number | null {
    // 重连:同名且断开的人类座位
    const rejoin = this.seats.find((s) => s.kind === 'human' && s.name === name && s.connId === null);
    if (rejoin) { rejoin.connId = connId; return rejoin.idx; }
    if (this.started) return null; // 开局后不接受新人(只允许重连)
    const empty = this.seats.find((s) => s.kind === 'empty');
    if (!empty) return null;
    empty.kind = 'human';
    empty.name = name || `训练家${empty.idx + 1}`;
    empty.connId = connId;
    return empty.idx;
  }

  leave(connId: string): void {
    const s = this.seats.find((x) => x.connId === connId);
    if (s) s.connId = null; // 保留座位以便重连
  }

  setSeat(idx: number, kind: SeatKind): void {
    if (this.started) return;
    const s = this.seats[idx];
    if (!s || s.connId) return; // 不动已连接的人类座位
    if (kind === 'ai') { s.kind = 'ai'; s.name = `电脑${idx + 1}`; s.connId = null; }
    else if (kind === 'empty') { s.kind = 'empty'; s.name = ''; s.connId = null; }
  }

  private activeSeats(): Seat[] {
    return this.seats.filter((s) => s.kind !== 'empty');
  }

  canStart(): boolean {
    const n = this.activeSeats().length;
    return !this.started && n >= 2 && n <= MAX_SEATS;
  }

  start(seed?: number): boolean {
    if (!this.canStart()) return false;
    const active = this.activeSeats();
    const players = active.map((s) => ({ id: `P${s.idx}`, name: s.name, isAI: s.kind === 'ai' }));
    this.game = createGame({ players, cards: CARDS, seed: seed ?? this.seedCounter++ * 2654435761 });
    this.playerSeats = active.map((s) => s.idx);
    this.started = true;
    return true;
  }

  reset(): void {
    this.game = null;
    this.started = false;
    this.playerSeats = [];
    for (const s of this.seats) if (s.kind === 'ai') { s.kind = 'empty'; s.name = ''; }
  }

  // ---- 对局 ----
  seatOfConn(connId: string): Seat | undefined {
    return this.seats.find((s) => s.connId === connId);
  }
  gameIndexOfSeat(idx: number): number {
    return this.playerSeats.indexOf(idx);
  }
  currentSeat(): Seat | null {
    if (!this.game || this.game.isGameOver) return null;
    return this.seats[this.playerSeats[this.game.currentPlayerIndex]] ?? null;
  }
  /** 当前座位是否应由服务器代打:AI 座 或 掉线的人类座。 */
  isCurrentAuto(): boolean {
    const s = this.currentSeat();
    return !!s && (s.kind === 'ai' || (s.kind === 'human' && s.connId === null));
  }

  action(connId: string, action: Action): { ok: boolean; err?: string } {
    if (!this.game || this.game.isGameOver) return { ok: false, err: '对局未进行' };
    const seat = this.seatOfConn(connId);
    if (!seat) return { ok: false, err: '不在座' };
    if (this.gameIndexOfSeat(seat.idx) !== this.game.currentPlayerIndex) return { ok: false, err: '未轮到你' };
    try {
      this.game = applyAction(this.game, action);
      return { ok: true };
    } catch (e) {
      return { ok: false, err: (e as Error).message };
    }
  }

  /** 若当前该服务器代打,执行一步;返回是否执行。ws 层在定时器里反复调用。 */
  stepAuto(): boolean {
    if (!this.game || this.game.isGameOver || !this.isCurrentAuto()) return false;
    const moves = legalMoves(this.game);
    if (moves.length === 0) return false;
    const rng = makeRng(((this.game.turnNumber * 2654435761) ^ this.game.rngSeed) >>> 0);
    this.game = applyAction(this.game, AI(moves, this.game, rng));
    return true;
  }

  // ---- 视图 ----
  seatInfos(): SeatInfo[] {
    return this.seats.map((s) => ({ idx: s.idx, name: s.kind === 'empty' ? '' : s.name, kind: s.kind, connected: s.connId !== null }));
  }
  lobbyMsg(): ServerMsg {
    return { t: 'lobby', seats: this.seatInfos(), canStart: this.canStart() };
  }
  stateMsg(connId: string): ServerMsg {
    const seat = this.seatOfConn(connId);
    const yourSeat = seat ? seat.idx : null;
    const yourPlayerIndex = seat ? this.gameIndexOfSeat(seat.idx) : null;
    return {
      t: 'state',
      state: serializeState(this.game!),
      seats: this.seatInfos(),
      yourSeat,
      yourPlayerIndex: yourPlayerIndex === -1 ? null : yourPlayerIndex,
    };
  }
}
