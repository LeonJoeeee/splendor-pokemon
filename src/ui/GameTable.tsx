// Shared game table. Control mode separates local hot-seat play from online viewing.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildBuyAction,
  colorVectorMeets,
  gameWinners,
  legalEvolutions,
  totalTokens,
  type Action,
  type Card,
  type Color,
  type EvolveAction,
  type GameState,
  type Stage,
} from '../engine';
import { ALL_PILES, COLOR_ORDER, PAYABLE_ORDER, type PayableToken, type PileKey } from '../engine/types';
import { CardDetails, CardView } from './CardView';
import { PlayerPanel } from './PlayerPanel';
import { TokenBank } from './TokenBank';
import { BALL_META } from './theme';

const TIER_ROWS: Stage[] = [3, 2, 1];
const zeroSel = (): Record<Color, number> => ({ red: 0, blue: 0, black: 0, pink: 0, yellow: 0 });
const zeroPool = (): Record<PayableToken, number> => ({ red: 0, blue: 0, black: 0, pink: 0, yellow: 0, master: 0 });
type Selection = { cardId: string; source: 'board' | 'reserved'; slot: string };

function findAnywhere(game: GameState, cardId: string): Card | null {
  for (const p of game.players) for (const c of [...p.purchased, ...p.reserved]) if (c.id === cardId) return c;
  for (const pile of ALL_PILES) {
    const c = game.decks[pile].faceUp.find((x) => x?.id === cardId);
    if (c) return c;
  }
  return null;
}

export function GameTable({ game, youIndex, mode = 'local', dispatch }: { game: GameState; youIndex: number | null; mode?: 'local' | 'online'; dispatch: (a: Action) => void }) {
  const [selected, setSelected] = useState<Record<Color, number>>(zeroSel);
  const [discardSel, setDiscardSel] = useState<Record<PayableToken, number>>(zeroPool);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [evolveChoice, setEvolveChoice] = useState('');
  const slotRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const boardHeadingRef = useRef<HTMLHeadingElement>(null);
  const reserveHeadingRef = useRef<HTMLHeadingElement>(null);

  const current = game.players[game.currentPlayerIndex];
  const viewer = mode === 'online' && youIndex === null;
  const me = youIndex != null ? game.players[youIndex] : mode === 'local' ? current : game.players[0];
  const visibleReservations = viewer ? [] : me.reserved;
  const isMyTurn = !game.isGameOver && !current.isAI && (mode === 'online' ? youIndex !== null && game.currentPlayerIndex === youIndex : youIndex === null || game.currentPlayerIndex === youIndex);
  const isHumanTurn = isMyTurn && !game.awaitingDiscard && !game.awaitingEvolve;
  const buyDisabledReason = game.isGameOver ? '对局已结束' : viewer ? '观战模式不可操作' : !isMyTurn ? '等待你的回合' : !isHumanTurn ? '请先完成当前阶段' : undefined;
  const humanDiscarding = isMyTurn && game.awaitingDiscard;
  const humanEvolving = isMyTurn && game.awaitingEvolve;
  const evolveOptions = useMemo<EvolveAction[]>(() => legalEvolutions(game, me), [game, me]);
  const choiceKey = (action: EvolveAction) => `${action.fromCardId}|${action.toCardId}`;
  const chosenEvolution = evolveOptions.find((action) => choiceKey(action) === evolveChoice) ?? evolveOptions[0];
  const selectedCard = selection?.source === 'reserved'
    ? visibleReservations.find((card) => card.id === selection.cardId)
    : selection ? ALL_PILES.flatMap((pile) => game.decks[pile].faceUp).find((card) => card?.id === selection.cardId) : null;

  useEffect(() => {
    if (selection && !selectedCard) {
      const slot = selection.slot;
      setSelection(null);
      requestAnimationFrame(() => (slotRefs.current[slot] ?? (selection.source === 'reserved' ? reserveHeadingRef.current : boardHeadingRef.current))?.focus());
    }
  }, [game, selection, selectedCard]);

  const clearSelection = () => {
    const slot = selection?.slot;
    setSelection(null);
    if (slot) requestAnimationFrame(() => (slotRefs.current[slot] ?? (selection?.source === 'reserved' ? reserveHeadingRef.current : boardHeadingRef.current))?.focus());
  };

  const act = (a: Action) => { if (!isMyTurn) return; dispatch(a); setSelected(zeroSel()); setDiscardSel(zeroPool()); };

  // 取币
  const selectedCount = COLOR_ORDER.reduce((n, c) => n + (selected[c] > 0 ? 1 : 0), 0);
  const availColors = COLOR_ORDER.filter((c) => game.tokenPool[c] > 0).length;
  const canConfirmTake = isHumanTurn && selectedCount >= 1 && selectedCount <= Math.min(3, availColors);
  const toggleSelect = (c: Color) => setSelected((s) => {
    const next = { ...s };
    if (next[c] > 0) next[c] = 0;
    else if (selectedCount < 3 && game.tokenPool[c] > 0) next[c] = 1;
    return next;
  });

  // 弃牌
  const discardNeeded = Math.max(0, totalTokens(me.tokens) - 10);
  const discardChosen = PAYABLE_ORDER.reduce((n, t) => n + discardSel[t], 0);
  const stepDiscard = (t: PayableToken, d: number) => setDiscardSel((s) => {
    const v = s[t] + d;
    if (v < 0 || v > me.tokens[t]) return s;
    if (d > 0 && discardChosen >= discardNeeded) return s;
    return { ...s, [t]: v };
  });

  // 购买/预订(视角=me;仅 isHumanTurn 时可操作)
  const affordBoard = (cardId: string): boolean => {
    if (!isHumanTurn) return false;
    const card = findAnywhere(game, cardId);
    return !!card && buildBuyAction(me, card, { kind: 'board', cardId }) !== null;
  };
  const reservedAfford = (): Set<string> => {
    const s = new Set<string>();
    if (!isHumanTurn) return s;
    for (const c of me.reserved) if (buildBuyAction(me, c, { kind: 'reserved', cardId: c.id })) s.add(c.id);
    return s;
  };
  const canReserve = isHumanTurn && me.reserved.length < 3;
  const reservedSet = reservedAfford();

  // 进化(视角=me)
  const targetAvailable = (speciesId: string): boolean => {
    for (const pile of ALL_PILES) if (game.decks[pile].faceUp.some((c) => c && c.kind === 'normal' && c.speciesId === speciesId)) return true;
    return me.reserved.some((c) => c.kind === 'normal' && c.speciesId === speciesId);
  };
  const evoStateOfBoard = (card: Card): 'can' | 'target' | null => {
    if (card.kind !== 'normal' || card.stage <= 1) return null;
    const pre = me.purchased.find((x) => x.kind === 'normal' && x.stage === card.stage - 1 && x.evolvesToSpeciesId === card.speciesId && x.evolveCost);
    if (!pre) return null;
    return colorVectorMeets(me.bonuses, pre.evolveCost!) ? 'can' : 'target';
  };
  const ownedEvo = (card: Card): { cls: string; label: string } | null => {
    if (card.kind !== 'normal' || card.stage >= 3 || !card.evolvesToSpeciesId || !card.evolveCost) return null;
    const meet = colorVectorMeets(me.bonuses, card.evolveCost);
    const avail = targetAvailable(card.evolvesToSpeciesId);
    if (meet && avail) return { cls: 'can', label: '✦可进化' };
    if (meet && !avail) return { cls: 'ready', label: '就绪·待目标' };
    const short = COLOR_ORDER.filter((c) => (card.evolveCost![c] ?? 0) > me.bonuses[c])
      .map((c) => `${BALL_META[c].zh.replace('球', '')}${(card.evolveCost![c] ?? 0) - me.bonuses[c]}`).join(' ');
    return { cls: 'need', label: `还需 ${short}` };
  };

  const renderRow = (pile: PileKey, label: string, canDeckReserve: boolean) => (
    <section className="tier-row" key={String(pile)}>
      <div className={`deck-pile ${typeof pile === 'string' ? pile : ''}`}>
        <div className="deck-label">{label}</div>
        <div className="deck-count">{game.decks[pile].drawPile.length} 张</div>
        {canDeckReserve && (
          <button className="btn tiny" disabled={!canReserve || game.decks[pile].drawPile.length === 0} title={!isHumanTurn ? buyDisabledReason : me.reserved.length >= 3 ? '预订已满' : game.decks[pile].drawPile.length === 0 ? '牌堆已空' : undefined} onClick={() => act({ type: 'RESERVE', source: { kind: 'deck', pile: pile as Stage } })}>盲抽预订</button>
        )}
      </div>
      <div className="cards-row">
        {game.decks[pile].faceUp.map((card, i) => card ? (
          <CardView key={card.id} card={card} affordable={affordBoard(card.id)} evoState={evoStateOfBoard(card)}
            selected={selection?.cardId === card.id && selection.source === 'board'} label={`${label}第 ${i + 1} 张`}
            onSelect={() => setSelection({ cardId: card.id, source: 'board', slot: `${pile}-${i}` })}
            buttonRef={(element) => { slotRefs.current[`${pile}-${i}`] = element; }} />
        ) : <div key={`e-${String(pile)}-${i}`} className="card empty">空</div>)}
      </div>
    </section>
  );

  const renderSpecial = (pile: 'rare' | 'legendary', label: string) => {
    const card = game.decks[pile].faceUp[0];
    return (
      <div className={`special-cell ${pile}`} key={pile}>
        <div className="special-head"><span className="special-label">{label}</span><span className="deck-count">{game.decks[pile].drawPile.length}张</span></div>
        {card ? <CardView card={card} affordable={affordBoard(card.id)} selected={selection?.cardId === card.id && selection.source === 'board'} label={`${label}卡`}
          onSelect={() => setSelection({ cardId: card.id, source: 'board', slot: `${pile}-0` })}
          buttonRef={(element) => { slotRefs.current[`${pile}-0`] = element; }} /> : <div className="card empty">空</div>}
      </div>
    );
  };

  const winners = game.isGameOver ? gameWinners(game) : [];
  const winnerLabel = winners.length > 1
    ? `${winners.map((p) => p.name).join('、')} 共享胜利`
    : winners.length === 1 ? `${winners[0].name} 获胜!` : '对局结束';
  const phase = game.isGameOver ? '对局结束'
    : viewer ? '观战模式'
    : !isMyTurn ? (current.isAI ? '电脑行动中' : '等待对手行动')
      : game.awaitingDiscard ? '弃球'
        : game.awaitingEvolve ? '进化或结束'
          : '选择主动作';
  const buyChoice = selectedCard && selection && isHumanTurn ? buildBuyAction(me, selectedCard,
    selection.source === 'board' ? { kind: 'board', cardId: selectedCard.id } : { kind: 'reserved', cardId: selectedCard.id }) : null;
  const buyReason = buyDisabledReason ?? (selectedCard ? '宝可梦球不足' : '请先选择卡牌');
  const reserveReason = buyDisabledReason ?? (selectedCard?.kind !== 'normal' ? '特殊卡不可预订' : me.reserved.length >= 3 ? '预订已满' : '请先选择卡牌');
  const canReserveChoice = !!selectedCard && selection?.source === 'board' && selectedCard.kind === 'normal' && canReserve;
  const readiness = viewer ? '观战模式' : evolveOptions.length > 0
    ? `可进化 ${evolveOptions.length} 组 · 回合末选择`
    : me.purchased.find((card) => ownedEvo(card))
      ? `${me.purchased.find((card) => ownedEvo(card))?.nameZh}：${ownedEvo(me.purchased.find((card) => ownedEvo(card))!)?.label}`
      : '暂无可进化的宝可梦';

  return (
    <>
      <div className="turnbar">
        <span className="phase-label">{phase}</span>
        {game.isGameOver ? (
          <span className="winner-banner">🏆 {winnerLabel}（{Math.max(...game.players.map((p) => p.points))} 分,第 {game.turnNumber} 回合）</span>
        ) : (
          <>
            <span className="turn-info">第 {game.turnNumber} 回合 · 轮到 <b>{current.isAI ? '🤖' : '🧑'} {current.name}</b>{youIndex != null && current.id === me.id && '(你)'}</span>
            {game.awaitingDiscard && <span className="discard-note">{isMyTurn ? '手牌超过 10,请在下方弃牌' : `${current.name} 弃牌中…`}</span>}
            {game.awaitingEvolve && <span className="evolve-note">{isMyTurn ? '回合末:可进化或结束回合' : `${current.name} 进化中…`}</span>}
            {game.endTriggeredByPlayerIndex !== null && <span className="final-note">⚠ 最终回合(有人 ≥18)</span>}
            {!isMyTurn && !game.awaitingDiscard && !game.awaitingEvolve && <span className="thinking">⏳ 等待 {current.name}…</span>}
          </>
        )}
      </div>

      <div className="layout" onKeyDown={(event) => { if (event.key === 'Escape' && selection) { event.preventDefault(); clearSelection(); } }}>
        <main className="board">
          <h2 ref={boardHeadingRef} tabIndex={-1} className="board-heading">宝可梦展示区</h2>
          <div className="table-piles">
            <div className="normal-piles">{TIER_ROWS.map((t) => renderRow(t, `第 ${t} 阶`, true))}</div>
            <section className="special-section" aria-label="稀有与传说宝可梦">
              {renderSpecial('legendary', '传说')}
              {renderSpecial('rare', '稀有')}
            </section>
          </div>
        </main>

        <aside className="sidebar">
          <div className="players">
            {game.players.map((p, i) => (
              <PlayerPanel key={p.id} player={p} isCurrent={i === game.currentPlayerIndex && !game.isGameOver} mine={!viewer && p.id === me.id} compact />
            ))}
          </div>
          <section className="bank-section">
            <h2 className="section-label">宝可梦球供给区</h2>
            <TokenBank pool={game.tokenPool} active={isHumanTurn} showActions={isHumanTurn} selected={selected} selectedCount={selectedCount} canConfirm={canConfirmTake}
              onToggle={toggleSelect} onTakeTwo={(c) => act({ type: 'TAKE_TWO', color: c })}
              onConfirmTake={() => act({ type: 'TAKE_THREE', colors: COLOR_ORDER.filter((c) => selected[c] > 0) })}
              onClear={() => setSelected(zeroSel())} />
            {humanDiscarding && <div className="phase-actions discard-panel">
              <strong>弃球 · 需 {discardNeeded} · 已选 {discardChosen}</strong>
              <div className="discard-row">
                {PAYABLE_ORDER.filter((t) => me.tokens[t] > 0).map((t) => <div key={t} className="discard-col">
                  <span>{BALL_META[t].zh.replace('球', '')} {me.tokens[t] - discardSel[t]}</span>
                  <button className="btn tiny" aria-label={`减少弃置${BALL_META[t].zh}`} disabled={discardSel[t] === 0} onClick={() => stepDiscard(t, -1)}>−</button>
                  <span className="step-val">{discardSel[t]}</span>
                  <button className="btn tiny" aria-label={`增加弃置${BALL_META[t].zh}`} disabled={me.tokens[t] === discardSel[t] || discardChosen >= discardNeeded} onClick={() => stepDiscard(t, 1)}>＋</button>
                </div>)}
              </div>
              <button className="btn primary" disabled={discardChosen !== discardNeeded} onClick={() => act({ type: 'DISCARD', tokens: { ...discardSel } })}>确认弃牌</button>
            </div>}
            {humanEvolving && <div className="phase-actions evolve-panel">
              <label htmlFor="evolution-choice">回合末进化 · {evolveOptions.length} 组可选</label>
              <div className="evolve-row">
                <select id="evolution-choice" value={chosenEvolution ? choiceKey(chosenEvolution) : ''} onChange={(event) => setEvolveChoice(event.target.value)}
                  onKeyDown={(event) => {
                    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || evolveOptions.length === 0) return;
                    event.preventDefault();
                    const index = chosenEvolution ? evolveOptions.findIndex((option) => choiceKey(option) === choiceKey(chosenEvolution)) : 0;
                    const next = event.key === 'Home' ? 0 : event.key === 'End' ? evolveOptions.length - 1
                      : Math.max(0, Math.min(evolveOptions.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
                    setEvolveChoice(choiceKey(evolveOptions[next]));
                  }} disabled={!chosenEvolution}>
                  {evolveOptions.length === 0 && <option value="">无可进化</option>}
                  {evolveOptions.map((ev) => <option key={choiceKey(ev)} value={choiceKey(ev)}>{findAnywhere(game, ev.fromCardId)?.nameZh} → {findAnywhere(game, ev.toCardId)?.nameZh}</option>)}
                </select>
                <button className="btn evolve-btn" disabled={!chosenEvolution} onClick={() => { if (chosenEvolution) act(chosenEvolution); }}>确认进化</button>
                <button className="btn" onClick={() => act({ type: 'END_TURN' })}>结束回合(不进化)</button>
              </div>
            </div>}
          </section>
          <section className="card-inspector" aria-label="卡牌详情">
            <h2 className="section-label">卡牌详情</h2>
            {selectedCard ? <>
              <CardDetails card={selectedCard} evolution={selection?.source === 'board' && evoStateOfBoard(selectedCard) === 'can' ? '可作为进化目标' : selection?.source === 'board' && evoStateOfBoard(selectedCard) === 'target' ? '进化目标尚缺加成' : undefined} />
              <div className="inspector-actions">
                <button className="btn buy" disabled={!buyChoice} title={buyChoice ? '可捕捉' : buyReason} aria-label={buyChoice ? `捕捉 ${selectedCard.nameZh}` : `${selectedCard.nameZh} 暂不可捕捉，${buyReason}`} onClick={() => { if (buyChoice) act(buyChoice.action); }}>捕捉</button>
                {selection?.source === 'board' && <button className="btn reserve" disabled={!canReserveChoice} title={canReserveChoice ? '可预订' : reserveReason} aria-label={`预订 ${selectedCard.nameZh}${canReserveChoice ? '' : `，${reserveReason}`}`} onClick={() => { if (canReserveChoice) act({ type: 'RESERVE', source: { kind: 'board', cardId: selectedCard.id } }); }}>预订</button>}
                <button className="btn" onClick={clearSelection}>返回牌桌</button>
              </div>
              {(!buyChoice || (selection?.source === 'board' && !canReserveChoice)) && <span className="inspector-reason">{!buyChoice && `捕捉：${buyReason}`}{selection?.source === 'board' && !canReserveChoice && ` · 预订：${reserveReason}`}</span>}
            </> : <p className="inspector-empty">选择卡牌查看详情、捕捉或预订</p>}
            <span className="selection-announcement" aria-live="polite">{selectedCard ? `已选择 ${selectedCard.nameZh}` : '未选择卡牌'}</span>
          </section>
          <div className="reserve-area">
            <h2 ref={reserveHeadingRef} tabIndex={-1} className="section-label">{viewer ? '预订' : '我的预订'} <small>{visibleReservations.length}/3</small></h2>
            <div className="reserved-row">
              {visibleReservations.length === 0 && <span className="muted">{viewer ? '观战者无预订' : '无预订'}</span>}
              {visibleReservations.map((c, i) => <button key={c.id} type="button" className={`reserved-slot ${selection?.cardId === c.id && selection.source === 'reserved' ? 'selected' : ''}`}
                ref={(element) => { slotRefs.current[`reserved-${i}`] = element; }} aria-pressed={selection?.cardId === c.id && selection.source === 'reserved'}
                onClick={() => setSelection({ cardId: c.id, source: 'reserved', slot: `reserved-${i}` })}>
                <strong>{c.nameZh}</strong><span>{c.points} 分 · {BALL_META[c.bonus].zh.replace('球', '')}+{c.bonusAmount}</span><small>{reservedSet.has(c.id) ? '可捕捉' : '查看详情'}</small>
              </button>)}
            </div>
          </div>
          <div className="evolution-readiness" aria-live="polite">⤴ {readiness}</div>
          <details className="table-context"><summary>队伍与记录</summary><div className="context-content">
            {game.players.map((player) => <section key={player.id}>
              <h3>{player.name} 的宝可梦 · {player.purchased.length} 只</h3>
              <div className="owned-chips">{player.purchased.length === 0 ? <span className="muted">尚无</span>
                : player.purchased.map((card) => <span key={card.id} className="owned-chip">{card.nameZh} {player.id === me.id && !viewer ? ownedEvo(card)?.label : ''}</span>)}</div>
            </section>)}
            <h3>最近记录</h3><ul>{game.log.slice(-16).reverse().map((line, i) => <li key={game.log.length - i}>{line}</li>)}</ul>
          </div></details>
        </aside>
      </div>
    </>
  );
}
