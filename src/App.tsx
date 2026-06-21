import { useEffect, useMemo, useRef, useState } from 'react';
import {
  applyAction,
  buildBuyAction,
  colorVectorMeets,
  createGame,
  legalEvolutions,
  legalMoves,
  totalTokens,
  type Action,
  type Card,
  type Color,
  type EvolveAction,
  type GameState,
  type PlayerSeed,
  type Stage,
} from './engine';
import { ALL_PILES, COLOR_ORDER, PAYABLE_ORDER, TIER_PILES, type PayableToken, type PileKey } from './engine/types';
import { makeRng } from './engine/rng';
import { greedyPolicy } from './ai/policies';
import { CARDS } from './data/cards';
import { CardView } from './ui/CardView';
import { PlayerPanel } from './ui/PlayerPanel';
import { TokenBank } from './ui/TokenBank';
import { BALL_META, textOn } from './ui/theme';

const TIER_ROWS: Stage[] = [3, 2, 1];
const zeroSel = (): Record<Color, number> => ({ red: 0, blue: 0, black: 0, pink: 0, yellow: 0 });
const zeroPool = (): Record<PayableToken, number> => ({ red: 0, blue: 0, black: 0, pink: 0, yellow: 0, master: 0 });

interface SetupPlayer { name: string; isAI: boolean; }
const NAMES = ['小智', '小茂', '小霞', '小刚'];
const DEFAULT_SETUP: SetupPlayer[] = NAMES.map((name, i) => ({ name, isAI: i !== 0 })); // 默认 4 人:1 人 + 3 电脑
let gameCounter = 0;

function findAnywhere(game: GameState, cardId: string): Card | null {
  for (const p of game.players) {
    for (const c of [...p.purchased, ...p.reserved]) if (c.id === cardId) return c;
  }
  for (const pile of ALL_PILES) {
    const c = game.decks[pile].faceUp.find((x) => x?.id === cardId);
    if (c) return c;
  }
  return null;
}

export function App() {
  const [setup, setSetup] = useState<SetupPlayer[]>(DEFAULT_SETUP);
  const [seedText, setSeedText] = useState('');
  const [game, setGame] = useState<GameState>(() => newGameFrom(DEFAULT_SETUP, 1));
  const [selected, setSelected] = useState<Record<Color, number>>(zeroSel);
  const [discardSel, setDiscardSel] = useState<Record<PayableToken, number>>(zeroPool);
  const aiTimer = useRef<number | null>(null);

  function newGameFrom(players: SetupPlayer[], seed: number): GameState {
    const seeds: PlayerSeed[] = players.map((p, i) => ({ id: `P${i}`, name: p.name, isAI: p.isAI }));
    return createGame({ players: seeds, cards: CARDS, seed });
  }
  function startGame() {
    const seed = seedText.trim() ? Number(seedText.trim()) >>> 0 : (gameCounter++ * 2654435761 + 1) >>> 0;
    setSelected(zeroSel());
    setDiscardSel(zeroPool());
    setGame(newGameFrom(setup, seed));
  }

  const current = game.players[game.currentPlayerIndex];
  const isHumanTurn = !game.isGameOver && !current.isAI && !game.awaitingDiscard && !game.awaitingEvolve;
  const humanDiscarding = game.awaitingDiscard && !current.isAI && !game.isGameOver;
  const humanEvolving = game.awaitingEvolve && !current.isAI && !game.isGameOver;
  const evolveOptions = useMemo<EvolveAction[]>(() => (humanEvolving ? legalEvolutions(game, current) : []), [game, humanEvolving, current]);

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

  // 电脑自动行动(含弃牌/进化阶段,greedyPolicy 全覆盖)。
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

  // 取币选择
  const selectedCount = COLOR_ORDER.reduce((n, c) => n + (selected[c] > 0 ? 1 : 0), 0);
  const availColors = COLOR_ORDER.filter((c) => game.tokenPool[c] > 0).length;
  const canConfirmTake = isHumanTurn && selectedCount >= 1 && selectedCount <= Math.min(3, availColors);
  function toggleSelect(c: Color) {
    setSelected((s) => {
      const next = { ...s };
      if (next[c] > 0) next[c] = 0;
      else if (selectedCount < 3 && game.tokenPool[c] > 0) next[c] = 1;
      return next;
    });
  }
  const confirmTake = () => apply({ type: 'TAKE_THREE', colors: COLOR_ORDER.filter((c) => selected[c] > 0) });
  const takeTwo = (c: Color) => apply({ type: 'TAKE_TWO', color: c });

  // 弃牌
  const discardNeeded = Math.max(0, totalTokens(current.tokens) - 10);
  const discardChosen = PAYABLE_ORDER.reduce((n, t) => n + discardSel[t], 0);
  function stepDiscard(t: PayableToken, d: number) {
    setDiscardSel((s) => {
      const v = s[t] + d;
      if (v < 0 || v > current.tokens[t]) return s;
      if (d > 0 && discardChosen >= discardNeeded) return s;
      return { ...s, [t]: v };
    });
  }

  // 购买/预订
  const affordBoard = (cardId: string): boolean => {
    if (!isHumanTurn) return false;
    const card = findAnywhere(game, cardId);
    return !!card && buildBuyAction(current, card, { kind: 'board', cardId }) !== null;
  };
  const affordReservedSet = (): Set<string> => {
    const s = new Set<string>();
    if (!isHumanTurn) return s;
    for (const c of current.reserved) if (buildBuyAction(current, c, { kind: 'reserved', cardId: c.id })) s.add(c.id);
    return s;
  };
  function buyBoard(cardId: string) {
    const card = findAnywhere(game, cardId);
    if (!card) return;
    const built = buildBuyAction(current, card, { kind: 'board', cardId });
    if (built) apply(built.action);
  }
  function buyReserved(cardId: string) {
    const card = current.reserved.find((c) => c.id === cardId);
    if (!card) return;
    const built = buildBuyAction(current, card, { kind: 'reserved', cardId });
    if (built) apply(built.action);
  }
  const canReserve = isHumanTurn && current.reserved.length < 3;
  const reservedAfford = affordReservedSet();
  const winner = game.isGameOver ? game.players.find((p) => p.id === game.winnerId) : undefined;

  // 进化:目标物种当前是否在展示区/预订区可得
  function targetAvailable(speciesId: string): boolean {
    for (const pile of ALL_PILES) {
      if (game.decks[pile].faceUp.some((c) => c && c.kind === 'normal' && c.speciesId === speciesId)) return true;
    }
    return current.reserved.some((c) => c.kind === 'normal' && c.speciesId === speciesId);
  }
  // 展示区/预订区的卡 Y:相对当前玩家的进化关系('can'=拥有前置且加成满足;'target'=拥有前置但未满足)
  function evoStateOfBoard(card: Card): 'can' | 'target' | null {
    if (card.kind !== 'normal' || card.stage <= 1) return null;
    const pre = current.purchased.find(
      (x) => x.kind === 'normal' && x.stage === card.stage - 1 && x.evolvesToSpeciesId === card.speciesId && x.evolveCost,
    );
    if (!pre) return null;
    return colorVectorMeets(current.bonuses, pre.evolveCost!) ? 'can' : 'target';
  }
  // 已购卡的进化状态(用于「我的宝可梦」面板)
  function ownedEvo(card: Card): { cls: string; label: string } | null {
    if (card.kind !== 'normal' || card.stage >= 3 || !card.evolvesToSpeciesId || !card.evolveCost) return null;
    const meet = colorVectorMeets(current.bonuses, card.evolveCost);
    const avail = targetAvailable(card.evolvesToSpeciesId);
    if (meet && avail) return { cls: 'can', label: '✦可进化' };
    if (meet && !avail) return { cls: 'ready', label: '就绪·待目标' };
    const short = COLOR_ORDER.filter((c) => (card.evolveCost![c] ?? 0) > current.bonuses[c])
      .map((c) => `${BALL_META[c].zh.replace('球', '')}${(card.evolveCost![c] ?? 0) - current.bonuses[c]}`)
      .join(' ');
    return { cls: 'need', label: `还需 ${short}` };
  }

  const renderRow = (pile: PileKey, label: string, canDeckReserve: boolean) => (
    <section className="tier-row" key={String(pile)}>
      <div className={`deck-pile ${typeof pile === 'string' ? pile : ''}`}>
        <div className="deck-label">{label}</div>
        <div className="deck-count">{game.decks[pile].drawPile.length} 张</div>
        {canDeckReserve && (
          <button className="btn tiny" disabled={!canReserve || game.decks[pile].drawPile.length === 0} onClick={() => apply({ type: 'RESERVE', source: { kind: 'deck', pile: pile as Stage } })}>盲抽预订</button>
        )}
      </div>
      <div className={`cards-row ${typeof pile === 'string' ? 'special-row' : ''}`}>
        {game.decks[pile].faceUp.map((card, i) =>
          card ? (
            <CardView
              key={card.id}
              card={card}
              viewer={current}
              affordable={affordBoard(card.id)}
              evoState={evoStateOfBoard(card)}
              onBuy={isHumanTurn ? () => buyBoard(card.id) : undefined}
              onReserve={canReserve && card.kind === 'normal' ? () => apply({ type: 'RESERVE', source: { kind: 'board', cardId: card.id } }) : undefined}
            />
          ) : (
            <div key={`e-${String(pile)}-${i}`} className="card empty">空</div>
          ),
        )}
      </div>
    </section>
  );

  const renderSpecial = (pile: 'rare' | 'legendary', label: string) => {
    const card = game.decks[pile].faceUp[0];
    return (
      <div className={`special-cell ${pile}`} key={pile}>
        <div className="special-head">
          <span className="special-label">{label}</span>
          <span className="deck-count">{game.decks[pile].drawPile.length}张</span>
        </div>
        {card ? (
          <CardView card={card} viewer={current} affordable={affordBoard(card.id)} onBuy={isHumanTurn ? () => buyBoard(card.id) : undefined} />
        ) : (
          <div className="card empty">空</div>
        )}
      </div>
    );
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>璀璨宝石：宝可梦 <span className="subtitle">Splendor: Pokémon(非官方同人)</span></h1>
        <div className="setup">
          <label>人数：
            <select value={setup.length} onChange={(e) => setSetup(resizeSetup(setup, Number(e.target.value)))}>
              <option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
            </select>
          </label>
          {setup.map((p, i) => (
            <button key={i} className="btn tiny" onClick={() => setSetup(toggleAI(setup, i))} title="切换 人类/电脑">
              {p.isAI ? '🤖' : '🧑'} {p.name}
            </button>
          ))}
          <label>种子：<input className="seed-input" value={seedText} onChange={(e) => setSeedText(e.target.value)} placeholder="随机" /></label>
          <button className="btn primary" onClick={startGame}>开始新对局</button>
        </div>
      </header>

      <div className="turnbar">
        {game.isGameOver ? (
          <span className="winner-banner">🏆 {winner ? `${winner.name} 获胜!` : '对局结束'}（{Math.max(...game.players.map((p) => p.points))} 分,第 {game.turnNumber} 回合）</span>
        ) : (
          <>
            <span className="turn-info">第 {game.turnNumber} 回合 · 轮到 <b>{current.isAI ? '🤖' : '🧑'} {current.name}</b></span>
            {game.awaitingDiscard && <span className="discard-note">{current.isAI ? '电脑弃牌中…' : '手牌超过 10,请在下方弃牌'}</span>}
            {game.awaitingEvolve && <span className="evolve-note">{current.isAI ? '电脑进化中…' : '回合末:可进化或结束回合'}</span>}
            {game.endTriggeredByPlayerIndex !== null && <span className="final-note">⚠ 最终回合(有人 ≥18)</span>}
            {current.isAI && !game.awaitingDiscard && !game.awaitingEvolve && <span className="thinking">🤖 思考中…</span>}
          </>
        )}
      </div>

      <div className="layout">
        <main className="board">
          {TIER_ROWS.map((t) => renderRow(t, `T${t}`, true))}
          <section className="special-section">
            {renderSpecial('legendary', '传说')}
            {renderSpecial('rare', '稀有')}
          </section>

          <section className="bank-section">
            {humanEvolving ? (
              <div className="evolve-panel">
                <span className="section-label">⤴ 回合末进化(免费,凭永久加成)</span>
                <div className="evolve-row">
                  {evolveOptions.length === 0 && <span className="muted">无可进化</span>}
                  {evolveOptions.map((ev, i) => {
                    const from = findAnywhere(game, ev.fromCardId);
                    const to = findAnywhere(game, ev.toCardId);
                    return (
                      <button key={i} className="btn evolve-btn" onClick={() => apply(ev)}>
                        ⤴ {from?.nameZh} → {to?.nameZh}
                      </button>
                    );
                  })}
                  <button className="btn" onClick={() => apply({ type: 'END_TURN' })}>结束回合(不进化)</button>
                </div>
              </div>
            ) : humanDiscarding ? (
              <div className="discard-panel">
                <span className="section-label">⚠ 需弃掉 {discardNeeded} 个(已选 {discardChosen})</span>
                <div className="discard-row">
                  {PAYABLE_ORDER.filter((t) => current.tokens[t] > 0).map((t) => (
                    <div key={t} className="discard-col">
                      <span className="mini-token" style={{ background: BALL_META[t].hex, color: textOn(t) }}>
                        {BALL_META[t].zh.replace('球', '')} {current.tokens[t] - discardSel[t]}
                      </span>
                      <div className="stepper">
                        <button className="btn tiny" disabled={discardSel[t] === 0} onClick={() => stepDiscard(t, -1)}>−</button>
                        <span className="step-val">{discardSel[t]}</span>
                        <button className="btn tiny" disabled={current.tokens[t] === discardSel[t] || discardChosen >= discardNeeded} onClick={() => stepDiscard(t, 1)}>＋</button>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="btn primary" disabled={discardChosen !== discardNeeded} onClick={() => apply({ type: 'DISCARD', tokens: { ...discardSel } })}>确认弃牌</button>
              </div>
            ) : (
              <>
                <span className="section-label">宝可梦球供给区</span>
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
                affordableReserved={i === game.currentPlayerIndex ? reservedAfford : new Set()}
                onBuyReserved={buyReserved}
              />
            ))}
          </div>
          <div className="owned-team">
            <span className="section-label">{current.name} 的宝可梦（{current.purchased.length}）{current.evolved.length > 0 && `· 已进化 ${current.evolved.length}`}</span>
            <div className="owned-chips">
              {current.purchased.length === 0 && <span className="muted">尚无</span>}
              {[...current.purchased]
                .sort((a, b) => COLOR_ORDER.indexOf(a.bonus) - COLOR_ORDER.indexOf(b.bonus) || a.stage - b.stage)
                .map((c) => {
                  const evo = ownedEvo(c);
                  return (
                    <span key={c.id} className={`owned-chip ${evo ? `e-${evo.cls}` : ''}`} title={c.name}>
                      <i className="odot" style={{ background: BALL_META[c.bonus].hex }} />
                      {c.nameZh}<sup>{c.stage}</sup>
                      {evo && <em className={`oevo ${evo.cls}`}>{evo.label}</em>}
                    </span>
                  );
                })}
            </div>
          </div>
          <div className="log">
            <span className="section-label">对局记录</span>
            <ul>{game.log.slice(-16).reverse().map((l, i) => <li key={game.log.length - i}>{l}</li>)}</ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function resizeSetup(cur: SetupPlayer[], n: number): SetupPlayer[] {
  const out: SetupPlayer[] = [];
  for (let i = 0; i < n; i++) out.push(cur[i] ?? { name: NAMES[i], isAI: i !== 0 });
  return out;
}
function toggleAI(cur: SetupPlayer[], i: number): SetupPlayer[] {
  return cur.map((p, j) => (j === i ? { ...p, isAI: !p.isAI } : p));
}

void TIER_PILES;
