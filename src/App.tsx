import { useEffect, useMemo, useRef, useState } from 'react';
import {
  applyAction,
  buildBuyAction,
  canonicalDiscard,
  createGame,
  legalMoves,
  totalTokens,
  type Action,
  type EnergyType,
  type GameState,
  type PlayerSeed,
  type Tier,
} from './engine';
import { ENERGY_ORDER, PAYABLE_ORDER, type PayableToken } from './engine/types';
import { makeRng } from './engine/rng';
import { greedyPolicy } from './ai/policies';
import { CARDS } from './data/cards';
import { BADGES } from './data/badges';
import { CardView } from './ui/CardView';
import { PlayerPanel } from './ui/PlayerPanel';
import { TokenBank } from './ui/TokenBank';
import { ENERGY_META } from './ui/theme';

const TIERS: Tier[] = [3, 2, 1]; // 顶部高 tier
const zeroSel = (): Record<EnergyType, number> => ({ grass: 0, fire: 0, water: 0, electric: 0, psychic: 0 });
const zeroPool = (): Record<PayableToken, number> => ({ grass: 0, fire: 0, water: 0, electric: 0, psychic: 0, rainbow: 0 });

interface SetupPlayer {
  name: string;
  isAI: boolean;
}

const DEFAULT_SETUP: SetupPlayer[] = [
  { name: '小智', isAI: false },
  { name: '小茂', isAI: true },
];

let gameCounter = 0;

export function App() {
  const [setup, setSetup] = useState<SetupPlayer[]>(DEFAULT_SETUP);
  const [seedText, setSeedText] = useState('');
  const [game, setGame] = useState<GameState>(() => newGameFrom(DEFAULT_SETUP, 1));
  const [selected, setSelected] = useState<Record<EnergyType, number>>(zeroSel);
  const [discardSel, setDiscardSel] = useState<Record<PayableToken, number>>(zeroPool);
  const aiTimer = useRef<number | null>(null);

  function newGameFrom(players: SetupPlayer[], seed: number): GameState {
    const seeds: PlayerSeed[] = players.map((p, i) => ({ id: `P${i}`, name: p.name, isAI: p.isAI }));
    return createGame({ players: seeds, cards: CARDS, badges: BADGES, seed });
  }

  function startGame() {
    const seed = seedText.trim() ? Number(seedText.trim()) >>> 0 : (gameCounter++ * 2654435761 + 1) >>> 0;
    setSelected(zeroSel());
    setGame(newGameFrom(setup, seed));
  }

  const current = game.players[game.currentPlayerIndex];
  const opponents = useMemo(() => game.players.filter((_, i) => i !== game.currentPlayerIndex), [game]);
  const isHumanTurn = !game.isGameOver && !current.isAI && !game.awaitingDiscard;

  function apply(action: Action) {
    try {
      setGame((g) => applyAction(g, action));
      setSelected(zeroSel());
      setDiscardSel(zeroPool());
    } catch (e) {
      console.error(e);
      alert((e as Error).message);
    }
  }

  // 仅电脑自动行动（含其溢出弃牌走规范策略）。人类的取币/购买/弃牌均手动。
  useEffect(() => {
    if (game.isGameOver || !current.isAI) return;
    aiTimer.current = window.setTimeout(() => {
      setGame((g) => {
        if (g.isGameOver) return g;
        const me = g.players[g.currentPlayerIndex];
        if (!me.isAI) return g;
        if (g.awaitingDiscard) return applyAction(g, canonicalDiscard(me));
        const moves = legalMoves(g);
        if (moves.length === 0) return g; // 安全网
        const rng = makeRng((g.turnNumber * 2654435761 + g.rngSeed) >>> 0);
        return applyAction(g, greedyPolicy(moves, g, rng));
      });
    }, game.awaitingDiscard ? 350 : 600);
    return () => {
      if (aiTimer.current !== null) window.clearTimeout(aiTimer.current);
    };
  }, [game, current.isAI]);

  // 取币选择
  const selectedCount = ENERGY_ORDER.reduce((n, e) => n + (selected[e] > 0 ? 1 : 0), 0);
  const availColors = ENERGY_ORDER.filter((e) => game.tokenPool[e] > 0).length;
  const maxTake = Math.min(3, availColors);
  const canConfirmTake = isHumanTurn && selectedCount >= 1 && selectedCount <= maxTake;

  // 溢出弃牌（人类手动）
  const humanDiscarding = game.awaitingDiscard && !current.isAI && !game.isGameOver;
  const discardNeeded = Math.max(0, totalTokens(current.tokens) - 10);
  const discardChosen = PAYABLE_ORDER.reduce((n, t) => n + discardSel[t], 0);
  function stepDiscard(t: PayableToken, delta: number) {
    setDiscardSel((s) => {
      const next = { ...s };
      const v = next[t] + delta;
      if (v < 0 || v > current.tokens[t]) return s;
      if (delta > 0 && discardChosen >= discardNeeded) return s;
      next[t] = v;
      return next;
    });
  }
  function confirmDiscard() {
    apply({ type: 'DISCARD', tokens: { ...discardSel } });
  }

  function toggleSelect(e: EnergyType) {
    setSelected((s) => {
      const next = { ...s };
      if (next[e] > 0) next[e] = 0;
      else if (selectedCount < 3 && game.tokenPool[e] > 0) next[e] = 1;
      return next;
    });
  }
  function confirmTake() {
    const energies = ENERGY_ORDER.filter((e) => selected[e] > 0);
    apply({ type: 'TAKE_THREE', energies });
  }
  function takeTwo(e: EnergyType) {
    apply({ type: 'TAKE_TWO', energy: e });
  }

  // 购买/预定
  function affordableBoard(cardId: string): boolean {
    if (!isHumanTurn) return false;
    const card = findBoard(game, cardId);
    if (!card) return false;
    return buildBuyAction(current, card, game.config, { kind: 'board', cardId }, opponents) !== null;
  }
  function affordableReservedSet(): Set<string> {
    const s = new Set<string>();
    if (!isHumanTurn) return s;
    for (const c of current.reserved) {
      if (buildBuyAction(current, c, game.config, { kind: 'reserved', cardId: c.id }, opponents)) s.add(c.id);
    }
    return s;
  }
  function buyBoard(cardId: string) {
    const card = findBoard(game, cardId);
    if (!card) return;
    const built = buildBuyAction(current, card, game.config, { kind: 'board', cardId }, opponents);
    if (built) apply(built.action);
  }
  function buyReserved(cardId: string) {
    const card = current.reserved.find((c) => c.id === cardId);
    if (!card) return;
    const built = buildBuyAction(current, card, game.config, { kind: 'reserved', cardId }, opponents);
    if (built) apply(built.action);
  }
  const canReserve = isHumanTurn && current.reserved.length < 3;

  const winner = game.isGameOver ? game.players.find((p) => p.id === game.winnerId) : undefined;
  const reservedAfford = affordableReservedSet();

  return (
    <div className="app">
      <header className="topbar">
        <h1>宝可梦：训练家联盟 <span className="subtitle">Pokémon Trainer League</span></h1>
        <div className="setup">
          <label>人数：
            <select value={setup.length} onChange={(e) => setSetup(resizeSetup(setup, Number(e.target.value)))}>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </label>
          {setup.map((p, i) => (
            <button key={i} className="btn tiny" onClick={() => setSetup(toggleAI(setup, i))} title="点击切换 人类/电脑">
              {p.isAI ? '🤖' : '🧑'} {p.name}
            </button>
          ))}
          <label>种子：<input className="seed-input" value={seedText} onChange={(e) => setSeedText(e.target.value)} placeholder="随机" /></label>
          <button className="btn primary" onClick={startGame}>开始新对局</button>
        </div>
      </header>

      <div className="turnbar">
        {game.isGameOver ? (
          <span className="winner-banner">🏆 {winner ? `${winner.name} 获胜！` : '对局结束'}（{Math.max(...game.players.map((p) => p.prestige))} 名望，第 {game.turnNumber} 回合）</span>
        ) : (
          <>
            <span className="turn-info">第 {game.turnNumber} 回合 · 轮到 <b>{current.isAI ? '🤖' : '🧑'} {current.name}</b></span>
            {game.awaitingDiscard && <span className="discard-note">{current.isAI ? '电脑弃牌中…' : '手牌超过 10，请在下方选择弃掉的代币'}</span>}
            {game.endTriggeredByPlayerIndex !== null && <span className="final-note">⚠ 最终回合</span>}
            {!isHumanTurn && !game.awaitingDiscard && <span className="thinking">🤖 思考中…</span>}
          </>
        )}
      </div>

      <div className="layout">
        <main className="board">
          <section className="badges">
            <span className="section-label">道馆徽章</span>
            <div className="badge-row">
              {game.badges.map((b) => (
                <div key={b.id} className="board-badge" title={b.name}>
                  <div className="badge-title">🏅 {b.nameZh}</div>
                  <div className="badge-req">
                    {ENERGY_ORDER.filter((e) => (b.requirement[e] ?? 0) > 0).map((e) => (
                      <span key={e} className="req-chip" style={{ background: ENERGY_META[e].hex, color: e === 'electric' ? '#1a1a1a' : '#fff' }}>{b.requirement[e]}</span>
                    ))}
                  </div>
                  <div className="badge-pts">+3 名望</div>
                </div>
              ))}
            </div>
          </section>

          {TIERS.map((tier) => (
            <section key={tier} className="tier-row">
              <div className="deck-pile">
                <div className="deck-label">T{tier}</div>
                <div className="deck-count">{game.decks[tier].drawPile.length} 张</div>
                <button className="btn tiny" disabled={!canReserve || game.decks[tier].drawPile.length === 0} onClick={() => apply({ type: 'RESERVE', source: { kind: 'deck', tier } })}>盲抽预定</button>
              </div>
              <div className="cards-row">
                {game.decks[tier].faceUp.map((card, i) =>
                  card ? (
                    <CardView
                      key={card.id}
                      card={card}
                      viewer={current}
                      config={game.config}
                      opponents={opponents}
                      affordable={affordableBoard(card.id)}
                      onBuy={isHumanTurn ? () => buyBoard(card.id) : undefined}
                      onReserve={canReserve ? () => buyBoardReserveGuard(card.id, apply) : undefined}
                    />
                  ) : (
                    <div key={`empty-${tier}-${i}`} className="card empty">空</div>
                  ),
                )}
              </div>
            </section>
          ))}

          <section className="bank-section">
            {humanDiscarding ? (
              <div className="discard-panel">
                <span className="section-label">⚠ 手牌超过 10，需弃掉 {discardNeeded} 个（已选 {discardChosen}）</span>
                <div className="discard-row">
                  {PAYABLE_ORDER.filter((t) => current.tokens[t] > 0).map((t) => (
                    <div key={t} className="discard-col">
                      <span className="mini-token" style={{ background: ENERGY_META[t].hex, color: t === 'electric' || t === 'rainbow' ? '#1a1a1a' : '#fff' }}>
                        {ENERGY_META[t].icon} {current.tokens[t] - discardSel[t]}
                      </span>
                      <div className="stepper">
                        <button className="btn tiny" disabled={discardSel[t] === 0} onClick={() => stepDiscard(t, -1)}>−</button>
                        <span className="step-val">{discardSel[t]}</span>
                        <button className="btn tiny" disabled={current.tokens[t] === discardSel[t] || discardChosen >= discardNeeded} onClick={() => stepDiscard(t, 1)}>＋</button>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="btn primary" disabled={discardChosen !== discardNeeded} onClick={confirmDiscard}>确认弃牌</button>
              </div>
            ) : (
              <>
                <span className="section-label">能量供给区</span>
                <TokenBank
                  pool={game.tokenPool}
                  active={isHumanTurn}
                  selected={selected}
                  selectedCount={selectedCount}
                  canConfirm={canConfirmTake}
                  onToggle={toggleSelect}
                  onTakeTwo={takeTwo}
                  onConfirmTake={confirmTake}
                  onClear={() => setSelected(zeroSel())}
                />
              </>
            )}
          </section>
        </main>

        <aside className="sidebar">
          <div className="players">
            {game.players.map((p, i) => (
              <PlayerPanel
                key={p.id}
                player={p}
                isCurrent={i === game.currentPlayerIndex && !game.isGameOver}
                isActiveHuman={i === game.currentPlayerIndex && isHumanTurn}
                config={game.config}
                opponents={game.players.filter((_, j) => j !== i)}
                affordableReserved={i === game.currentPlayerIndex ? reservedAfford : new Set()}
                onBuyReserved={buyReserved}
              />
            ))}
          </div>
          <div className="log">
            <span className="section-label">对局记录</span>
            <ul>
              {game.log.slice(-14).reverse().map((l, i) => (
                <li key={game.log.length - i}>{l}</li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ---- 纯辅助 ----
function findBoard(game: GameState, cardId: string) {
  for (const tier of [1, 2, 3] as Tier[]) {
    const c = game.decks[tier].faceUp.find((x) => x?.id === cardId);
    if (c) return c;
  }
  return null;
}
function buyBoardReserveGuard(cardId: string, apply: (a: Action) => void) {
  apply({ type: 'RESERVE', source: { kind: 'board', cardId } });
}
function resizeSetup(cur: SetupPlayer[], n: number): SetupPlayer[] {
  const names = ['小智', '小茂', '小霞', '小刚'];
  const out: SetupPlayer[] = [];
  for (let i = 0; i < n; i++) out.push(cur[i] ?? { name: names[i], isAI: i !== 0 });
  return out;
}
function toggleAI(cur: SetupPlayer[], i: number): SetupPlayer[] {
  return cur.map((p, j) => (j === i ? { ...p, isAI: !p.isAI } : p));
}
