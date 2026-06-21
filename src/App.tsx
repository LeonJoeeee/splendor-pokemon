import { useEffect, useRef, useState } from 'react';
import { applyAction, createGame, legalMoves, type Action, type GameState } from './engine';
import { makeRng } from './engine/rng';
import { greedyPolicy } from './ai/policies';
import { CARDS } from './data/cards';
import { GameTable } from './ui/GameTable';
import { useOnlineGame } from './net/useOnlineGame';

type Mode = null | 'local' | 'online';

export function App() {
  const [mode, setMode] = useState<Mode>(null);
  if (mode === 'local') return <LocalGame onExit={() => setMode(null)} />;
  if (mode === 'online') return <OnlineGame onExit={() => setMode(null)} />;
  return (
    <div className="app menu">
      <h1>璀璨宝石：宝可梦</h1>
      <p className="menu-sub">Splendor: Pokémon · 非官方同人</p>
      <button className="btn big-btn primary" onClick={() => setMode('local')}>🎮 单机（你 vs 电脑）</button>
      <button className="btn big-btn" onClick={() => setMode('online')}>🌐 联机（和朋友,各用各的设备）</button>
      <p className="menu-foot">联机:房主本机 <code>npm run server</code> 起服务器,再用 cloudflared/ngrok 暴露端口,把地址发给朋友。</p>
    </div>
  );
}

// ----------------------------- 单机(你 vs 电脑) ---------------------------
function LocalGame({ onExit }: { onExit: () => void }) {
  const [count, setCount] = useState(4);
  const [yourName, setYourName] = useState('小智');
  const [seedText, setSeedText] = useState('');
  const [game, setGame] = useState<GameState>(() => build(4, '小智', 1));
  const aiTimer = useRef<number | null>(null);

  function build(n: number, name: string, seed: number): GameState {
    const players = [{ id: 'P0', name: name || '你', isAI: false }];
    for (let i = 1; i < n; i++) players.push({ id: `P${i}`, name: `电脑${i}`, isAI: true });
    return createGame({ players, cards: CARDS, seed });
  }
  function startGame() {
    const seed = seedText.trim() ? Number(seedText.trim()) >>> 0 : Math.floor(Math.random() * 1e9);
    setGame(build(count, yourName, seed));
  }
  const current = game.players[game.currentPlayerIndex];
  useEffect(() => {
    if (game.isGameOver || !current.isAI) return;
    aiTimer.current = window.setTimeout(() => {
      setGame((g) => {
        if (g.isGameOver || !g.players[g.currentPlayerIndex].isAI) return g;
        const moves = legalMoves(g);
        if (moves.length === 0) return g;
        const rng = makeRng((g.turnNumber * 2654435761 + g.rngSeed) >>> 0);
        return applyAction(g, greedyPolicy(moves, g, rng));
      });
    }, game.awaitingDiscard || game.awaitingEvolve ? 350 : 600);
    return () => { if (aiTimer.current !== null) window.clearTimeout(aiTimer.current); };
  }, [game, current.isAI]);

  const dispatch = (a: Action) => setGame((g) => { try { return applyAction(g, a); } catch (e) { alert((e as Error).message); return g; } });

  return (
    <div className="app">
      <header className="topbar">
        <h1>璀璨宝石：宝可梦 <span className="subtitle">单机 · 你 vs 电脑</span></h1>
        <div className="setup">
          <button className="btn tiny" onClick={onExit}>← 模式</button>
          <label>你的名字：<input className="seed-input" style={{ width: 70 }} value={yourName} maxLength={8} onChange={(e) => setYourName(e.target.value)} /></label>
          <label>总人数：
            <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
              <option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
            </select>
          </label>
          <span className="conn-status">你 + {count - 1} 电脑</span>
          <label>种子：<input className="seed-input" value={seedText} onChange={(e) => setSeedText(e.target.value)} placeholder="随机" /></label>
          <button className="btn primary" onClick={startGame}>开始新对局</button>
        </div>
      </header>
      <GameTable game={game} youIndex={0} dispatch={dispatch} />
    </div>
  );
}

// ----------------------------- 联机 ----------------------------------------
function OnlineGame({ onExit }: { onExit: () => void }) {
  const [url, setUrl] = useState(`ws://${(typeof location !== 'undefined' && location.hostname) || 'localhost'}:8787`);
  const [go, setGo] = useState(false);
  if (!go) {
    return (
      <div className="app menu">
        <h1>联机对战</h1>
        <p className="menu-sub">输入房主分享的服务器地址</p>
        <input className="url-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="ws://… 或 wss://…(隧道)" />
        <button className="btn big-btn primary" onClick={() => setGo(true)}>连接</button>
        <button className="btn big-btn" onClick={onExit}>← 返回</button>
        <p className="menu-foot">同机/局域网用 <code>ws://主机IP:8787</code>;外网用 cloudflared/ngrok 的 <code>wss://…</code> 地址。</p>
      </div>
    );
  }
  return <OnlineSession url={url} onExit={onExit} onBack={() => setGo(false)} />;
}

function OnlineSession({ url, onExit, onBack }: { url: string; onExit: () => void; onBack: () => void }) {
  const net = useOnlineGame(url);
  const [name, setName] = useState('');
  const joined = net.yourSeat != null;
  const active = net.seats.filter((s) => s.kind !== 'empty').length;
  const canStart = active >= 2;

  if (net.started && net.game) {
    return (
      <div className="app">
        <header className="topbar">
          <h1>璀璨宝石：宝可梦 <span className="subtitle">联机 · 你是 {net.seats.find((s) => s.idx === net.yourSeat)?.name ?? '观战'}</span></h1>
          <div className="setup">
            <span className="conn-status">{net.status === 'open' ? '🟢 已连接' : '🔴 断开'}</span>
            <button className="btn tiny" onClick={() => net.reset()}>回到大厅</button>
            <button className="btn tiny" onClick={onExit}>退出</button>
          </div>
        </header>
        {net.error && <div className="turnbar err-toast" onClick={net.clearError}>⚠ {net.error}（点击关闭）</div>}
        <GameTable game={net.game} youIndex={net.yourPlayerIndex} dispatch={net.sendAction} />
      </div>
    );
  }

  return (
    <div className="app menu">
      <h1>等待入座</h1>
      <p className="menu-sub">{net.status === 'open' ? '🟢 已连接' : net.status === 'connecting' ? '连接中…' : '🔴 未连接'} · {url}</p>
      {net.error && <p className="err-toast" onClick={net.clearError}>⚠ {net.error}</p>}

      {!joined && (
        <div className="join-row">
          <input className="url-input" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} placeholder="输入你的名字" onKeyDown={(e) => e.key === 'Enter' && name.trim() && net.join(name.trim())} />
          <button className="btn primary" disabled={!name.trim() || net.status !== 'open'} onClick={() => net.join(name.trim())}>加入</button>
        </div>
      )}

      <div className="lobby-seats">
        {net.seats.map((s) => (
          <div key={s.idx} className="lobby-seat">
            <span>座位 {s.idx + 1}：{s.kind === 'empty' ? <span className="muted">空</span> : <b>{s.kind === 'ai' ? '🤖 ' : (s.connected ? '🧑 ' : '⚪ ')}{s.name}</b>}{s.idx === net.yourSeat && '（你）'}</span>
            {!net.started && (
              <span>
                {s.kind === 'empty' && <button className="btn tiny" onClick={() => net.setSeat(s.idx, 'ai')}>设为电脑</button>}
                {s.kind === 'ai' && <button className="btn tiny" onClick={() => net.setSeat(s.idx, 'empty')}>移除电脑</button>}
              </span>
            )}
          </div>
        ))}
      </div>

      <button className="btn big-btn primary" disabled={!joined || !canStart} onClick={() => net.start()}>开始对局（{active} 人）</button>
      <button className="btn big-btn" onClick={onBack}>← 改地址 / 返回</button>
      <p className="menu-foot">输名字加入占座;空位可设为电脑补满。满 2 人即可开始,默认目标 4 人。</p>
    </div>
  );
}
