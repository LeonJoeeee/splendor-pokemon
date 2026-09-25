import { useEffect, useRef, useState } from 'react';
import { applyAction, createGame, legalMoves, type Action, type GameState } from './engine';
import { CARDS } from './data/cards';
import { GameTable } from './ui/GameTable';
import { useOnlineGame } from './net/useOnlineGame';
import { loadSoloGame, saveSoloGame } from './solo/save';
import { nextSoloTurn } from './solo/turn';

function browserStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

function buildSoloGame(n: number, name: string, seed: number): GameState {
  const players = [{ id: 'P0', name: name || '你', isAI: false }];
  for (let i = 1; i < n; i++) players.push({ id: `P${i}`, name: `电脑${i}`, isAI: true });
  return createGame({ players, cards: CARDS, seed });
}

export function App() {
  const [savedGame, setSavedGame] = useState<GameState | null>(() => loadSoloGame(browserStorage()));
  const [activeGame, setActiveGame] = useState<GameState | null>(null);
  const [screen, setScreen] = useState<'landing' | 'setup' | 'confirm'>('landing');
  const [name, setName] = useState('小智');
  const [count, setCount] = useState(4);
  const [seedText, setSeedText] = useState('');
  const trimmedName = name.trim();
  const seedValue = seedText.trim();
  const seedValid = !seedValue || (/^(0|[1-9]\d*)$/.test(seedValue) && Number(seedValue) <= 0xffffffff);
  const setupValid = trimmedName.length > 0 && trimmedName.length <= 8 && seedValid;

  const openSaved = () => {
    if (savedGame) setActiveGame(savedGame);
  };
  const replaceSaved = () => {
    if (!setupValid) return;
    const seed = seedValue ? Number(seedValue) : Math.floor(Math.random() * 0x100000000);
    const fresh = buildSoloGame(count, trimmedName, seed);
    saveSoloGame(browserStorage(), fresh);
    setSavedGame(fresh);
    setActiveGame(fresh);
    setScreen('landing');
  };
  if (activeGame) return <LocalGame initialGame={activeGame} onExit={() => {
    setSavedGame(loadSoloGame(browserStorage()));
    setActiveGame(null);
    setScreen('landing');
  }} />;
  return (
    <div className="app solo-shell solo-landing">
      <header className="solo-brand">
        <span className="brand-kicker">宝可梦收藏桌游</span>
        <h1>璀璨宝石：宝可梦</h1>
        <p>收集、捕捉与进化，向冠军之路迈进。</p>
        <span className="fan-note">Splendor: Pokémon · 非官方同人作品</span>
      </header>
      {screen === 'landing' && <main className="landing-card">
        <div className="landing-intro">
          <span className="eyebrow">单机对战</span>
          <h2>打开你的训练家桌面</h2>
          <p>每一回合，选择宝可梦球、捕捉卡牌，或预订下一位队员。</p>
        </div>
        <div className="landing-actions">
          {savedGame && <div className="save-summary">
            <span>已有对局</span>
            <strong>{savedGame.players[0].name} · 第 {savedGame.turnNumber} 回合</strong>
            <small>{savedGame.players.length} 位训练家 · 自动保存</small>
          </div>}
          {savedGame && <button className="btn primary" onClick={openSaved}>继续对局</button>}
          <button className={`btn ${savedGame ? '' : 'primary'}`} onClick={() => setScreen('setup')}>开始新对局</button>
        </div>
      </main>}
      {screen === 'setup' && <main className="landing-card setup-card">
        <div className="landing-intro">
          <span className="eyebrow">新对局</span>
          <h2>组建训练家阵容</h2>
          <p>与你的电脑对手展开一场新的收藏之旅。</p>
        </div>
        <form className="solo-form" onSubmit={(event) => {
          event.preventDefault();
          if (!setupValid) return;
          if (savedGame) setScreen('confirm'); else replaceSaved();
        }}>
          <label htmlFor="solo-name">你的名字</label>
          <input id="solo-name" value={name} maxLength={8} onChange={(event) => setName(event.target.value)} autoComplete="off" />
          <label htmlFor="solo-count">总人数</label>
          <select id="solo-count" value={count} onChange={(event) => setCount(Number(event.target.value))}>
            <option value={2}>2 人 · 你与 1 位电脑</option>
            <option value={3}>3 人 · 你与 2 位电脑</option>
            <option value={4}>4 人 · 你与 3 位电脑</option>
          </select>
          <label htmlFor="solo-seed">种子 <span>可选</span></label>
          <input id="solo-seed" value={seedText} onChange={(event) => setSeedText(event.target.value)} inputMode="numeric" placeholder="留空则随机生成" aria-invalid={!seedValid} />
          {!seedValid && <p className="form-error">种子需为 0 至 4294967295 的整数。</p>}
          {!trimmedName && <p className="form-error">请输入你的名字。</p>}
          <div className="form-actions">
            <button className="btn" type="button" onClick={() => setScreen('landing')}>返回</button>
            <button className="btn primary" type="submit" disabled={!setupValid}>开始对局</button>
          </div>
        </form>
      </main>}
      {screen === 'confirm' && <main className="landing-card confirm-card" role="alertdialog" aria-labelledby="replace-heading" aria-describedby="replace-copy">
        <span className="eyebrow">保存保护</span>
        <h2 id="replace-heading">替换现有对局？</h2>
        <p id="replace-copy">{savedGame?.players[0].name} 的第 {savedGame?.turnNumber} 回合对局将被新对局替换。此操作无法撤销。</p>
        <div className="confirm-actions">
          <button className="btn" onClick={() => setScreen('setup')}>取消</button>
          <button className="btn" onClick={openSaved}>继续现有对局</button>
          <button className="btn primary" onClick={replaceSaved}>替换并开始</button>
        </div>
      </main>}
    </div>
  );
}

// ----------------------------- 单机(你 vs 电脑) ---------------------------
function LocalGame({ initialGame, onExit }: { initialGame: GameState; onExit: () => void }) {
  const [game, setGame] = useState<GameState>(initialGame);
  const aiTimer = useRef<number | null>(null);
  const lastSaved = useRef(initialGame);
  const exiting = useRef(false);

  useEffect(() => {
    if (game === lastSaved.current) return;
    saveSoloGame(browserStorage(), game);
    lastSaved.current = game;
  }, [game]);

  const current = game.players[game.currentPlayerIndex];
  useEffect(() => {
    if (game.isGameOver || (!current.isAI && legalMoves(game).length > 0)) return;
    aiTimer.current = window.setTimeout(() => {
      if (!exiting.current) setGame(nextSoloTurn);
    }, current.isAI ? (game.awaitingDiscard || game.awaitingEvolve ? 350 : 600) : 0);
    return () => { if (aiTimer.current !== null) window.clearTimeout(aiTimer.current); };
  }, [game, current.isAI]);

  const exit = () => {
    exiting.current = true;
    if (aiTimer.current !== null) window.clearTimeout(aiTimer.current);
    aiTimer.current = null;
    onExit();
  };

  const dispatch = (a: Action) => setGame((g) => { try { return applyAction(g, a); } catch (e) { alert((e as Error).message); return g; } });

  return (
    <div className="app solo-shell solo-game">
      <header className="topbar solo-topbar">
        <div className="game-brand"><span className="brand-kicker">训练家桌面</span><h1>璀璨宝石：宝可梦</h1><span className="fan-note">单机 · 非官方同人作品</span></div>
        <button className="btn" onClick={exit}>返回首页</button>
      </header>
      <GameTable game={game} youIndex={0} mode="local" dispatch={dispatch} />
    </div>
  );
}

// ----------------------------- 联机 ----------------------------------------
export function OnlineGame({ onExit }: { onExit: () => void }) {
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
  const [setupOpen, setSetupOpen] = useState(false); // 手机:设置区折进 ⚙ 弹层
  const joined = net.yourSeat != null;
  const active = net.seats.filter((s) => s.kind !== 'empty').length;
  const canStart = active >= 2;

  if (net.started && net.game) {
    return (
      <div className="app solo-game">
        <header className="topbar">
          <h1>璀璨宝石：宝可梦 <span className="subtitle">联机 · 你是 {net.seats.find((s) => s.idx === net.yourSeat)?.name ?? '观战'}</span></h1>
          <button className="btn tiny setup-gear" onClick={() => setSetupOpen((o) => !o)}>⚙ 设置</button>
          <div className={`setup ${setupOpen ? 'open' : ''}`}>
            <span className="conn-status">{net.status === 'open' ? '🟢 已连接' : '🔴 断开'}</span>
            <button className="btn tiny" onClick={() => net.reset()}>回到大厅</button>
            <button className="btn tiny" onClick={onExit}>退出</button>
          </div>
        </header>
        {net.error && <div className="turnbar err-toast" onClick={net.clearError}>⚠ {net.error}（点击关闭）</div>}
        <GameTable game={net.game} youIndex={net.yourPlayerIndex} mode="online" dispatch={net.sendAction} />
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
