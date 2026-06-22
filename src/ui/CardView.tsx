import type { Card } from '../engine';
import { COLOR_ORDER } from '../engine/types';
import { BALL_META, pokeArt, pokeArtFallback, textOn } from './theme';

interface Props {
  card: Card;
  affordable?: boolean;
  reservedTag?: boolean;
  /** 'can'=你拥有前置且加成满足→回合末可免费进化获得;'target'=拥有前置但加成未满足 */
  evoState?: 'can' | 'target' | null;
  onBuy?: () => void;
  onReserve?: () => void;
}

const KIND_LABEL: Record<string, string> = { rare: '稀有', legendary: '传说' };
const STAGE_LABEL: Record<number, string> = { 1: '基础', 2: '一阶', 3: '最终' };

export function CardView({ card, affordable, reservedTag, evoState, onBuy, onReserve }: Props) {
  const bonusMeta = BALL_META[card.bonus];
  const special = card.kind !== 'normal';

  return (
    <div className={`card ${special ? `special ${card.kind}` : `tier-${card.stage}`} ${affordable ? 'affordable' : ''} ${evoState ? `evo-${evoState}` : ''}`} style={{ borderTopColor: bonusMeta.hex }}>
      <div className="card-head">
        <span className="card-points">{card.points > 0 ? card.points : ''}</span>
        <span className="card-bonus" style={{ background: bonusMeta.hex, color: textOn(card.bonus) }}>
          {card.bonusAmount > 1 ? `×${card.bonusAmount}` : ''}
        </span>
      </div>

      <div className="card-art">
        <img
          src={pokeArt(card.dexId)}
          alt={card.nameZh}
          loading="lazy"
          onError={(e) => {
            const img = e.currentTarget;
            if (!img.dataset.fb) { img.dataset.fb = '1'; img.src = pokeArtFallback(card.dexId); }
          }}
        />
      </div>

      <div className="card-name">{card.nameZh}</div>

      <div className="card-tags">
        {evoState === 'can' && <span className="tag evo-can-tag">✦可进化</span>}
        {evoState === 'target' && <span className="tag evo-tgt-tag">⤴目标</span>}
        {special ? <span className={`tag ${card.kind}-tag`}>{KIND_LABEL[card.kind]}</span>
          : <span className="tag tier-tag">{STAGE_LABEL[card.stage]}</span>}
        {card.evolvesToSpeciesId && card.evolveCost && (
          <span className="tag evo-need-tag" title="进化需求(永久加成,不花代币)">
            ⤴{COLOR_ORDER.filter((c) => (card.evolveCost![c] ?? 0) > 0).map((c) => (
              <i key={c} className="dot" style={{ background: BALL_META[c].hex }}>{card.evolveCost![c]}</i>
            ))}
          </span>
        )}
      </div>

      <div className="card-cost">
        {COLOR_ORDER.filter((c) => (card.cost[c] ?? 0) > 0)
          .sort((a, b) => (card.cost[b] ?? 0) - (card.cost[a] ?? 0))
          .map((c) => (
            <span key={c} className="cost-chip" style={{ background: BALL_META[c].hex, color: textOn(c) }}>{card.cost[c]}</span>
          ))}
        {(card.cost.master ?? 0) > 0 && (
          <span className="cost-chip master" style={{ background: BALL_META.master.hex, color: '#fff' }} title="须用大师球支付">{card.cost.master}</span>
        )}
      </div>

      {(onBuy || onReserve) && (
        <div className="card-actions">
          {onBuy && <button className="btn buy" disabled={!affordable} onClick={onBuy}>捕捉</button>}
          {onReserve && !reservedTag && <button className="btn reserve" onClick={onReserve}>预订</button>}
        </div>
      )}
    </div>
  );
}
