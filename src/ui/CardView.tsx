import { useEffect, useState, type Ref } from 'react';
import type { Card } from '../engine';
import { COLOR_ORDER } from '../engine/types';
import { BALL_META, pokeArt, pokeArtFallback, textOn } from './theme';

const KIND_LABEL: Record<string, string> = { rare: '稀有', legendary: '传说' };
const STAGE_LABEL: Record<number, string> = { 1: '基础', 2: '一阶', 3: '最终' };

function CardArt({ card }: { card: Card }) {
  const [source, setSource] = useState<'local' | 'cdn' | 'text'>('local');
  const [ready, setReady] = useState(false);
  useEffect(() => { setSource('local'); setReady(false); }, [card.dexId]);
  return <span className="card-art">
    {!ready && <span className="art-fallback" role="img" aria-label={`${card.nameZh} 插画${source === 'text' ? '不可用' : '加载中'}`}><span>#{String(card.dexId).padStart(3, '0')}</span><strong>{card.nameZh}</strong></span>}
    {source !== 'text' && <img src={source === 'local' ? pokeArt(card.dexId) : pokeArtFallback(card.dexId)} alt={card.nameZh}
      style={{ visibility: ready ? 'visible' : 'hidden' }} onLoad={() => setReady(true)}
      onError={() => { setReady(false); setSource(source === 'local' ? 'cdn' : 'text'); }} />}
  </span>;
}

function CostMarks({ card }: { card: Card }) {
  const costs = COLOR_ORDER.filter((c) => (card.cost[c] ?? 0) > 0)
    .sort((a, b) => (card.cost[b] ?? 0) - (card.cost[a] ?? 0));
  return <span className="card-cost" aria-label="捕捉成本">
    {costs.length === 0 && !card.cost.master && <span className="cost-free">免费</span>}
    {costs.map((c) => <span key={c} className="cost-chip" style={{ background: BALL_META[c].hex, color: textOn(c) }}>{BALL_META[c].zh.replace('球', '')} {card.cost[c]}</span>)}
    {(card.cost.master ?? 0) > 0 && <span className="cost-chip master" style={{ background: BALL_META.master.hex, color: '#fff' }}>大师 {card.cost.master}</span>}
  </span>;
}

function EvolveMarks({ card }: { card: Card }) {
  if (!card.evolvesToSpeciesId || !card.evolveCost) return null;
  return <span className="evo-need-tag" title="进化需求：永久加成，不花代币">⤴ {COLOR_ORDER.filter((c) => (card.evolveCost![c] ?? 0) > 0).map((c) =>
    <span key={c} className="evo-mark" style={{ color: BALL_META[c].hex }}>{BALL_META[c].zh.replace('球', '')}{card.evolveCost![c]}</span>)}</span>;
}

export function CardView({ card, selected, affordable, evoState, onSelect, label, buttonRef }: {
  card: Card;
  selected: boolean;
  affordable: boolean;
  evoState?: 'can' | 'target' | null;
  onSelect: () => void;
  label: string;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const bonusMeta = BALL_META[card.bonus];
  const costText = COLOR_ORDER.filter((c) => card.cost[c]).map((c) => `${BALL_META[c].zh}${card.cost[c]}`).join('、');
  const evoText = card.evolveCost ? `，进化需求 ${COLOR_ORDER.filter((c) => card.evolveCost?.[c]).map((c) => `${BALL_META[c].zh}${card.evolveCost?.[c]}`).join('、')}` : '';
  return <button ref={buttonRef} type="button" className={`card card-select ${card.kind !== 'normal' ? `special ${card.kind}` : `tier-${card.stage}`} ${affordable ? 'affordable' : ''} ${selected ? 'selected' : ''} ${evoState ? `evo-${evoState}` : ''}`}
    style={{ borderTopColor: bonusMeta.hex }} onClick={onSelect} aria-pressed={selected}
    aria-label={`${label}，${card.nameZh}，${card.points}分，${bonusMeta.zh}加成${card.bonusAmount}，成本${costText}${card.cost.master ? `、大师球${card.cost.master}` : ''}${evoText}`}>
    <span className="card-head"><span className="card-points">{card.points}<small>分</small></span><span className="card-bonus" style={{ background: bonusMeta.hex, color: textOn(card.bonus) }}>{bonusMeta.zh.replace('球', '')}+{card.bonusAmount}</span></span>
    <span className="card-evo-line"><EvolveMarks card={card} />{evoState === 'can' && <b>可进化</b>}{evoState === 'target' && <b>进化目标</b>}</span>
    <CardArt card={card} />
    <span className="card-name">{card.nameZh}</span>
    <span className="card-kind">{card.kind === 'normal' ? STAGE_LABEL[card.stage] : KIND_LABEL[card.kind]}</span>
    <CostMarks card={card} />
  </button>;
}

export function CardDetails({ card, evolution }: { card: Card; evolution?: string | null }) {
  return <div className="inspector-details">
    <CardArt card={card} />
    <div className="inspector-facts">
      <strong className="inspector-name">{card.nameZh}</strong>
      <span>{card.kind === 'normal' ? STAGE_LABEL[card.stage] : KIND_LABEL[card.kind]} · {card.points} 分 · {BALL_META[card.bonus].zh}加成 +{card.bonusAmount}</span>
      <EvolveMarks card={card} />
      {evolution && <span className="inspector-evolution">{evolution}</span>}
      <CostMarks card={card} />
    </div>
  </div>;
}
