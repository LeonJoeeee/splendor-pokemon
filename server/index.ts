// 极小权威 WebSocket 服务器:单桌,复用纯引擎(src/net/room.ts)。本地起 + 隧道分享。
// 运行:npm run server   (端口 PORT 或 8787)
import { WebSocketServer, WebSocket } from 'ws';
import { Room } from '../src/net/room';
import { DEFAULT_PORT, type ClientMsg, type ServerMsg } from '../src/net/protocol';

const port = Number(process.env.PORT ?? DEFAULT_PORT);
const wss = new WebSocketServer({ port });
const room = new Room();
const conns = new Map<string, WebSocket>();
let nextId = 1;
let aiTimer: ReturnType<typeof setTimeout> | null = null;

const send = (ws: WebSocket, msg: ServerMsg) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));

function broadcast() {
  for (const [id, ws] of conns) {
    send(ws, room.started && room.game ? room.stateMsg(id) : room.lobbyMsg());
  }
}

function scheduleAuto() {
  if (aiTimer) return;
  if (!(room.started && room.game && !room.game.isGameOver && room.isCurrentAuto())) return;
  aiTimer = setTimeout(function tick() {
    aiTimer = null;
    if (room.stepAuto()) {
      broadcast();
      if (room.game && !room.game.isGameOver && room.isCurrentAuto()) aiTimer = setTimeout(tick, 700);
    }
  }, 700);
}

function handle(id: string, ws: WebSocket, msg: ClientMsg) {
  switch (msg.t) {
    case 'join': {
      const seat = room.join(id, (msg.name || '').slice(0, 16));
      send(ws, { t: 'welcome', connId: id, seatIdx: seat });
      broadcast();
      break;
    }
    case 'setSeat': room.setSeat(msg.idx, msg.kind); broadcast(); break;
    case 'start': if (room.start()) { broadcast(); scheduleAuto(); } break;
    case 'action': {
      const r = room.action(id, msg.action);
      if (!r.ok) send(ws, { t: 'error', msg: r.err || '非法动作' });
      broadcast();
      scheduleAuto();
      break;
    }
    case 'reset': room.reset(); broadcast(); break;
  }
}

wss.on('connection', (ws) => {
  const id = `c${nextId++}`;
  conns.set(id, ws);
  send(ws, { t: 'welcome', connId: id, seatIdx: null });
  send(ws, room.started && room.game ? room.stateMsg(id) : room.lobbyMsg());
  ws.on('message', (data) => {
    let msg: ClientMsg;
    try { msg = JSON.parse(String(data)); } catch { return; }
    try { handle(id, ws, msg); } catch (e) { send(ws, { t: 'error', msg: (e as Error).message }); }
  });
  ws.on('close', () => { conns.delete(id); room.leave(id); broadcast(); scheduleAuto(); });
});

console.log(`[server] 璀璨宝石：宝可梦 联机服务器 ws://localhost:${port}`);
console.log(`[server] 分享给朋友:用 cloudflared/ngrok 把该端口暴露为公网地址。`);
