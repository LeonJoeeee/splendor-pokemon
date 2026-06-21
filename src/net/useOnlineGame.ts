import { useCallback, useEffect, useRef, useState } from 'react';
import { deserializeState } from './serialize';
import type { Action, GameState } from '../engine';
import type { ClientMsg, SeatInfo, SeatKind, ServerMsg } from './protocol';

export interface OnlineState {
  status: 'connecting' | 'open' | 'closed';
  connId: string | null;
  yourSeat: number | null;
  yourPlayerIndex: number | null;
  seats: SeatInfo[];
  game: GameState | null;
  started: boolean;
  error: string | null;
}

export interface OnlineApi extends OnlineState {
  join: (name: string) => void;
  setSeat: (idx: number, kind: SeatKind) => void;
  start: () => void;
  sendAction: (action: Action) => void;
  reset: () => void;
  clearError: () => void;
}

export function useOnlineGame(url: string): OnlineApi {
  const wsRef = useRef<WebSocket | null>(null);
  const [st, setSt] = useState<OnlineState>({
    status: 'connecting', connId: null, yourSeat: null, yourPlayerIndex: null,
    seats: [], game: null, started: false, error: null,
  });

  useEffect(() => {
    let closed = false;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => setSt((s) => ({ ...s, status: 'open' }));
    ws.onclose = () => { if (!closed) setSt((s) => ({ ...s, status: 'closed' })); };
    ws.onerror = () => setSt((s) => ({ ...s, error: '连接失败,确认服务器地址正确且已启动' }));
    ws.onmessage = (ev) => {
      let m: ServerMsg;
      try { m = JSON.parse(String(ev.data)); } catch { return; }
      setSt((s) => {
        if (m.t === 'welcome') return { ...s, connId: m.connId, yourSeat: m.seatIdx ?? s.yourSeat };
        if (m.t === 'lobby') return { ...s, seats: m.seats, started: false, game: null };
        if (m.t === 'state') return { ...s, seats: m.seats, game: deserializeState(m.state), yourSeat: m.yourSeat, yourPlayerIndex: m.yourPlayerIndex, started: true };
        if (m.t === 'error') return { ...s, error: m.msg };
        return s;
      });
    };
    return () => { closed = true; ws.close(); };
  }, [url]);

  const sendMsg = useCallback((m: ClientMsg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  }, []);

  return {
    ...st,
    join: (name) => sendMsg({ t: 'join', name }),
    setSeat: (idx, kind) => sendMsg({ t: 'setSeat', idx, kind }),
    start: () => sendMsg({ t: 'start' }),
    sendAction: (action) => sendMsg({ t: 'action', action }),
    reset: () => sendMsg({ t: 'reset' }),
    clearError: () => setSt((s) => ({ ...s, error: null })),
  };
}
