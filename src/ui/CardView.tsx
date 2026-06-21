import { resolveBuyCost, type Card, type PlayerState } from '../engine';
import { COLOR_ORDER } from '../engine/types';
import { BALL_META, pokeArt, textOn } from './theme';

interface Props {
  card: Card;
  viewer?: PlayerState; // 当前玩家,用于成本预览
  affordable?: boolean;
  reservedTag?: boolean;
  onBuy?: () => void;
  onReserve?: () => void;
}

const KIND_LABEL: Record<string, string> = { rare: '稀有', legendary: '传说' };
const STAGE_LABEL: Record<number, string> = { 1: '基础', 2: '一阶', 3: '最终' };

export function CardView({ card, viewer, affordable, reservedTag, onBuy, onReserve }: Props) {
  const bonusMeta = BALL_META[card.bonus];
  const res = viewer ? resolveBuyCost(viewer, card) : null;
  const special = card.kind !== 'normal';

  return (
    <div className={`card ${special ? `special ${card.kind}` : `tier-${card.stage}`} ${affordable ? 'affordable' : ''}`} style={{ borderTopColor: bonusMeta.hex }}>
      <div className="card-head">
        <span className="card-points">{card.points > 0 ? card.points : ''}</span>
        <span className="card-bonus" style={{ background: bonusMeta.hex, color: textOn(card.bonus) }}>
          {card.bonusAmount > 1 ? `×${card.bonusAmount}` : ''}
        </span>
      </div>

      <div className="card-art">
        <img src={pokeArt(card.dexId)} alt={card.name} loading="lazy" />
      </div>

      <div className="card-name">{card.nameZh}<span className="card-name-en">{card.name}</span></div>

      <div className="card-tags">
        {special ? <span className={`tag ${card.kind}-tag`}>{KIND_LABEL[card.kind]}</span>
          : <span className="tag tier-tag">{STAGE_LABEL[card.stage]}</span>}
        {card.evolvesToSpeciesId && card.evolveCost && (
          <span className="tag evo-tag" title="进化需求(永久加成,不花代币)">
            ⤴{COLOR_ORDER.filter((c) => (card.evolveCost![c] ?? 0) > 0).map((c) => `${card.evolveCost![c]}`).join('+')}
            {COLOR_ORDER.filter((c) => (card.evolveCost![c] ?? 0) > 0).map((c) => (
              <i key={c} className="dot" style={{ background: BALL_META[c].hex }} />
            ))}
          </span>
        )}
      </div>

      <div className="card-cost">
        {COLOR_ORDER.filter((c) => (card.cost[c] ?? 0) > 0).map((c) => {
          const base = card.cost[c] ?? 0;
          const need = res ? res.finalColorCost[c] ?? 0 : base;
          return (
            <span key={c} className="cost-chip" style={{ background: BALL_META[c].hex, color: textOn(c) }} title={`原价 ${base}`}>
              {res ? need : base}{base !== need && <s className="cost-base">{base}</s>}
            </span>
          );
        })}
        {(card.cost.master ?? 0) > 0 && (
          <span className="cost-chip master" style={{ background: BALL_META.master.hex, color: '#fff' }} title="须用大师球支付">
            {card.cost.master}
          </span>
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
