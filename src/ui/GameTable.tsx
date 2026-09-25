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
import { TakeBallActions, TokenBank } from './TokenBank';
import { BALL_META } from './theme';

const TIER_ROWS: Stage[] = [3, 2, 1];
const zeroSel = (): Record<Color, number> => ({ red: 0, blue: 0, black: 0, pink: 0, yellow: 0 });
const zeroPool = (): Record<PayableToken, number> => ({ red: 0, blue: 0, black: 0, pink: 0, yellow: 0, master: 0 });
type Selection = { cardId: string; source: 'board' | 'reserved'; slot: string } | { source: 'deck'; pile: Stage; slot: string };

function findAnywhere(game: GameState, cardId: string): Card | null {
  for (const p of game.players) for (const c of [...p.purchased, ...p.reserved]) if (c.id === cardId) return c;
  for (const pile of ALL_PILES) {
    const c = game.decks[pile].faceUp.find((x) => x?.id === cardId);
    if (c) return c;
  }
  return null;
}

function evolutionTargetLocation(game: GameState, reserved: Card[], cardId: string): string {
  for (const pile of ALL_PILES) {
    const slot = game.decks[pile].faceUp.findIndex((card) => card?.id === cardId);
    if (slot >= 0) return `展示区·第 ${pile} 阶·第 ${slot + 1} 格`;
  }
  const reservedSlot = reserved.findIndex((card) => card.id === cardId);
  return reservedSlot >= 0 ? `我的预订·第 ${reservedSlot + 1} 格` : '目标已不可用';
}

export function GameTable({ game, youIndex, mode = 'local', dispatch }: { game: GameState; youIndex: number | null; mode?: 'local' | 'online'; dispatch: (a: Action) => void }) {
  const [selected, setSelected] = useState<Record<Color, number>>(zeroSel);
  const [discardSel, setDiscardSel] = useState<Record<PayableToken, number>>(zeroPool);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [evolveChoice, setEvolveChoice] = useState('');
  const slotRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const boardHeadingRef = useRef<HTMLHeadingElement>(null);
  const reserveHeadingRef = useRef<HTMLHeadingElement>(null);
  const actionHeadingRef = useRef<HTMLHeadingElement>(null);
  const actionAreaRef = useRef<HTMLElement>(null);
  const takeFirstRef = useRef<HTMLButtonElement>(null);

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
    : selection?.source === 'board' ? ALL_PILES.flatMap((pile) => game.decks[pile].faceUp).find((card) => card?.id === selection.cardId) : null;
  const selectedDeck = selection?.source === 'deck' ? selection.pile : null;

  useEffect(() => {
    if (selection && selection.source !== 'deck' && !selectedCard) {
      const slot = selection.slot;
      setSelection(null);
      requestAnimationFrame(() => (slotRefs.current[slot] ?? (selection.source === 'reserved' ? reserveHeadingRef.current : boardHeadingRef.current))?.focus());
    }
  }, [game, selection, selectedCard]);

  const clearSelection = () => {
    const slot = selection?.slot;
    setSelection(null);
    if (slot) {
      const target = slotRefs.current[slot];
      (target && !target.disabled ? target : selection?.source === 'reserved' ? reserveHeadingRef.current : boardHeadingRef.current)?.focus();
    }
  };

  const backToBalls = () => {
    setSelection(null);
    requestAnimationFrame(() => takeFirstRef.current?.focus());
  };

  const act = (a: Action) => {
    if (!isMyTurn) return;
    const slot = selection?.slot;
    const focusWasInActions = !!actionAreaRef.current?.contains(document.activeElement);
    dispatch(a);
    setSelection(null);
    setSelected(zeroSel());
    setDiscardSel(zeroPool());
    if (slot && (a.type === 'BUY' || a.type === 'RESERVE')) {
      requestAnimationFrame(() => {
        const target = slotRefs.current[slot];
        (target && !target.disabled ? target : actionHeadingRef.current)?.focus();
      });
    } else if (focusWasInActions) {
      requestAnimationFrame(() => actionHeadingRef.current?.focus());
    }
  };

  // 取币
  const selectedCount = COLOR_ORDER.reduce((n, c) => n + (selected[c] > 0 ? 1 : 0), 0);
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
    return game.config.evolveFromReserved && me.reserved.some((c) => c.kind === 'normal' && c.speciesId === speciesId);
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
        {canDeckReserve && <button className="btn tiny deck-select" type="button"
          ref={(element) => { slotRefs.current[`deck-${pile}`] = element; }}
          aria-pressed={selection?.source === 'deck' && selection.pile === pile} disabled={!isHumanTurn}
          title={!isHumanTurn ? buyDisabledReason : undefined}
          aria-label={`选择第 ${pile} 阶牌堆，剩余 ${game.decks[pile].drawPile.length} 张，查看盲抽预订`}
          onClick={() => setSelection({ source: 'deck', pile: pile as Stage, slot: `deck-${pile}` })}>选择牌堆</button>}
      </div>
      <div className="cards-row">
        {game.decks[pile].faceUp.map((card, i) => card ? (
          <CardView key={card.id} card={card} affordable={affordBoard(card.id)} evoState={evoStateOfBoard(card)} disabled={humanDiscarding || humanEvolving}
            selected={selection?.source === 'board' && selection.cardId === card.id} label={`${label}第 ${i + 1} 张`}
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
        {card ? <CardView card={card} affordable={affordBoard(card.id)} disabled={humanDiscarding || humanEvolving} selected={selection?.source === 'board' && selection.cardId === card.id} label={`${label}卡`}
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
  const actionMode = !isMyTurn ? 'readonly' : humanDiscarding ? 'discard' : humanEvolving ? 'evolve'
    : selectedDeck !== null ? 'deck' : selectedCard ? 'card' : 'take';
  const actionHeading = actionMode === 'discard' ? '弃球' : actionMode === 'evolve' ? '回合末进化'
    : actionMode === 'deck' ? '盲抽预订' : actionMode === 'card' ? '卡牌操作'
      : actionMode === 'readonly' ? '查看牌桌' : '取宝可梦球';
  const evolutionLabel = (action: EvolveAction) => `${findAnywhere(game, action.fromCardId)?.nameZh} → ${findAnywhere(game, action.toCardId)?.nameZh} · ${evolutionTargetLocation(game, me.reserved, action.toCardId)}`;
  const evolutionFrom = chosenEvolution ? findAnywhere(game, chosenEvolution.fromCardId) : null;
  const evolutionCondition = evolutionFrom?.evolveCost
    ? COLOR_ORDER.filter((color) => (evolutionFrom.evolveCost?.[color] ?? 0) > 0)
      .map((color) => `${BALL_META[color].zh.replace('球', '')} ${me.bonuses[color]}/${evolutionFrom.evolveCost?.[color]}`).join(' · ') : '';

  const lastModeRef = useRef(actionMode);
  useEffect(() => {
    if (lastModeRef.current === actionMode) return;
    const focusWasInActions = !!actionAreaRef.current?.contains(document.activeElement);
    lastModeRef.current = actionMode;
    if (actionMode === 'discard' || actionMode === 'evolve') setSelection(null);
    if (focusWasInActions) requestAnimationFrame(() => actionHeadingRef.current?.focus());
  }, [actionMode]);

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
              <PlayerPanel key={p.id} player={p} isCurrent={i === game.currentPlayerIndex && !game.isGameOver} gameOver={game.isGameOver}
                mine={!viewer && p.id === me.id} compact readiness={!viewer && p.id === me.id ? readiness : undefined} />
            ))}
          </div>
          <section className="bank-section">
            <h2 className="section-label">宝可梦球供给区</h2>
            <TokenBank pool={game.tokenPool} />
          </section>
          <section ref={actionAreaRef} className={`action-area mode-${actionMode}`} aria-labelledby="action-heading">
            <h2 ref={actionHeadingRef} id="action-heading" tabIndex={-1} className="section-label">{actionHeading}</h2>
            {humanDiscarding ? <div className="phase-actions discard-panel">
              <strong>弃球 · 需 {discardNeeded} · 已选 {discardChosen}</strong>
              <div className="discard-row">
                {PAYABLE_ORDER.map((t) => <div key={t} className="discard-col">
                  <span>{BALL_META[t].zh.replace('球', '')} {me.tokens[t] - discardSel[t]}</span>
                  <button className="btn tiny" aria-label={`减少弃置${BALL_META[t].zh}`} disabled={discardSel[t] === 0} onClick={() => stepDiscard(t, -1)}>−</button>
                  <span className="step-val">{discardSel[t]}</span>
                  <button className="btn tiny" aria-label={`增加弃置${BALL_META[t].zh}`} disabled={me.tokens[t] === discardSel[t] || discardChosen >= discardNeeded} onClick={() => stepDiscard(t, 1)}>＋</button>
                </div>)}
              </div>
              <button className="btn primary" disabled={discardChosen !== discardNeeded} onClick={() => act({ type: 'DISCARD', tokens: { ...discardSel } })}>确认弃牌</button>
            </div> : humanEvolving ? <div className="phase-actions evolve-panel">
              <label htmlFor="evolution-choice">选择进化 · {evolveOptions.length} 组可选</label>
              <div className="evolve-row">
                <select id="evolution-choice" value={chosenEvolution ? choiceKey(chosenEvolution) : ''} onChange={(event) => setEvolveChoice(event.target.value)}
                  onKeyDown={(event) => {
                    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || evolveOptions.length === 0) return;
                    event.preventDefault();
                    const index = chosenEvolution ? evolveOptions.findIndex((option) => choiceKey(option) === choiceKey(chosenEvolution)) : 0;
                    const next = event.key === 'Home' ? 0 : event.key === 'End' ? evolveOptions.length - 1
                      : Math.max(0, Math.min(evolveOptions.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
                    setEvolveChoice(choiceKey(evolveOptions[next]));
                  }}
                  disabled={!chosenEvolution}>
                  {evolveOptions.length === 0 && <option value="">无可进化</option>}
                  {evolveOptions.map((ev) => <option key={choiceKey(ev)} value={choiceKey(ev)}>{evolutionLabel(ev)}</option>)}
                </select>
              </div>
              {chosenEvolution && <div className="evolution-choice-details">
                <strong>{evolutionLabel(chosenEvolution)}</strong>
                <span>进化条件：永久加成 {evolutionCondition} · 已满足，不消耗球</span>
              </div>}
              <div className="evolve-buttons">
                <button className="btn primary evolve-btn" disabled={!chosenEvolution} onClick={() => { if (chosenEvolution) act(chosenEvolution); }}>确认进化</button>
                <button className="btn" onClick={() => act({ type: 'END_TURN' })}>结束回合(不进化)</button>
              </div>
            </div> : actionMode === 'readonly' ? <div className="read-only-actions">
              <p>{phase} · 可选择展示区卡牌查看详情</p>
              {selectedCard && <CardDetails card={selectedCard} showArt={false} />}
            </div> : selectedDeck !== null ? <div className="deck-actions">
              <p>第 {selectedDeck} 阶牌堆 · 剩余 {game.decks[selectedDeck].drawPile.length} 张</p>
              <div className="inspector-actions">
                <button className="btn primary" disabled={!canReserve || game.decks[selectedDeck].drawPile.length === 0}
                  onClick={() => act({ type: 'RESERVE', source: { kind: 'deck', pile: selectedDeck } })}>确认盲抽预订</button>
                <button className="btn" onClick={backToBalls}>返回取球</button>
              </div>
              {(!canReserve || game.decks[selectedDeck].drawPile.length === 0) && <p className="action-reason">{!canReserve ? '预订已满 3 张' : '牌堆已空'}</p>}
            </div> : selectedCard ? <div className="card-actions-context">
              <CardDetails card={selectedCard} showArt={false} evolution={selection?.source === 'board' && evoStateOfBoard(selectedCard) === 'can' ? '可作为进化目标' : selection?.source === 'board' && evoStateOfBoard(selectedCard) === 'target' ? '进化目标尚缺加成' : undefined} />
              <div className="inspector-actions">
                <button className="btn buy" disabled={!buyChoice} title={buyChoice ? '可捕捉' : buyReason} aria-label={buyChoice ? `捕捉 ${selectedCard.nameZh}` : `${selectedCard.nameZh} 暂不可捕捉，${buyReason}`} onClick={() => { if (buyChoice) act(buyChoice.action); }}>捕捉</button>
                {selection?.source === 'board' && <button className="btn reserve" disabled={!canReserveChoice} title={canReserveChoice ? '可预订' : reserveReason} aria-label={`预订 ${selectedCard.nameZh}${canReserveChoice ? '' : `，${reserveReason}`}`} onClick={() => { if (canReserveChoice) act({ type: 'RESERVE', source: { kind: 'board', cardId: selectedCard.id } }); }}>预订</button>}
                <button className="btn" onClick={backToBalls}>返回取球</button>
              </div>
              {(!buyChoice || (selection?.source === 'board' && !canReserveChoice)) && <span className="inspector-reason">{!buyChoice && `捕捉：${buyReason}`}{selection?.source === 'board' && !canReserveChoice && ` · 预订：${reserveReason}`}</span>}
            </div> : <TakeBallActions pool={game.tokenPool} selected={selected} firstButtonRef={takeFirstRef}
              onToggle={toggleSelect} onTakeTwo={(color) => act({ type: 'TAKE_TWO', color })}
              onConfirmTake={() => act({ type: 'TAKE_THREE', colors: COLOR_ORDER.filter((color) => selected[color] > 0) })}
              onClear={() => setSelected(zeroSel())} />}
            <span className="selection-announcement" aria-live="polite">{selectedCard ? `已选择 ${selectedCard.nameZh}` : selectedDeck !== null ? `已选择第 ${selectedDeck} 阶牌堆` : phase}</span>
          </section>
          <div className="reserve-area">
            <h2 ref={reserveHeadingRef} tabIndex={-1} className="section-label">{viewer ? '预订' : '我的预订'} <small>{visibleReservations.length}/3</small></h2>
            <div className="reserved-row">
              {Array.from({ length: 3 }, (_, i) => {
                const card = visibleReservations[i];
                return card ? <button key={card.id} type="button" disabled={humanDiscarding || humanEvolving} className={`reserved-slot ${selection?.source === 'reserved' && selection.cardId === card.id ? 'selected' : ''}`}
                  ref={(element) => { slotRefs.current[`reserved-${i}`] = element; }} aria-pressed={selection?.source === 'reserved' && selection.cardId === card.id}
                  onClick={() => setSelection({ cardId: card.id, source: 'reserved', slot: `reserved-${i}` })}>
                  <strong>{card.nameZh}</strong><span>{card.points} 分 · {BALL_META[card.bonus].zh.replace('球', '')}+{card.bonusAmount}</span><small>{reservedSet.has(card.id) ? '可捕捉' : '查看详情'}</small>
                </button> : <span key={`empty-${i}`} className="reserved-slot empty">{viewer ? '无预订' : `空位 ${i + 1}`}</span>;
              })}
            </div>
          </div>
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
