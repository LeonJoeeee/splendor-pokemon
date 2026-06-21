import { resolveBuyCost, type Card, type GameConfig, type PlayerState } from '../engine';
import { ENERGIES, ENERGY_META } from './theme';

interface Props {
  card: Card;
  viewer?: PlayerState; // 当前玩家，用于成本/折扣预览
  config: GameConfig;
  opponents?: PlayerState[];
  affordable?: boolean;
  reservedTag?: boolean;
  onBuy?: () => void;
  onReserve?: () => void;
}

const STAGE_LABEL: Record<number, string> = { 1: '基础', 2: '一阶', 3: '最终' };

export function CardView({ card, viewer, config, opponents = [], affordable, reservedTag, onBuy, onReserve }: Props) {
  const bonusMeta = ENERGY_META[card.bonus];
  const res = viewer ? resolveBuyCost(viewer, card, config, opponents) : null;

  return (
    <div className={`card tier-${card.tier} ${affordable ? 'affordable' : ''}`} style={{ borderTopColor: bonusMeta.hex }}>
      <div className="card-head">
        <span className="card-prestige">{card.prestige > 0 ? card.prestige : ''}</span>
        <span className="card-bonus" style={{ background: bonusMeta.hex }}>{bonusMeta.icon}</span>
      </div>
      <div className="card-name">
        {card.nameZh}
        <span className="card-name-en">{card.name}</span>
      </div>
      <div className="card-tags">
        <span className="tag tier-tag">T{card.tier}·{STAGE_LABEL[card.stage]}</span>
        {card.stage > 1 && <span className="tag evo-tag">⤴进化</span>}
        {card.ability?.type === 'extraBonus' && <span className="tag ability-tag">特性 {ENERGY_META[card.ability.energy].icon}×2</span>}
        {res && res.totalDiscount > 0 && <span className="tag discount-tag">进化折扣 -{res.totalDiscount}</span>}
      </div>
      <div className="card-cost">
        {ENERGIES.filter((e) => (card.cost[e] ?? 0) > 0).map((e) => {
          const base = card.cost[e] ?? 0;
          const need = res ? res.finalCost[e] ?? 0 : base;
          const paid = base !== need;
          return (
            <span key={e} className="cost-chip" style={{ background: ENERGY_META[e].hex, color: e === 'electric' ? '#1a1a1a' : '#fff' }} title={`原价 ${base}${paid ? `，实付 ${need}` : ''}`}>
              {res ? need : base}
              {paid && <s className="cost-base">{base}</s>}
            </span>
          );
        })}
      </div>
      {(onBuy || onReserve) && (
        <div className="card-actions">
          {onBuy && (
            <button className="btn buy" disabled={!affordable} onClick={onBuy}>捕捉</button>
          )}
          {onReserve && !reservedTag && (
            <button className="btn reserve" onClick={onReserve}>预定</button>
          )}
        </div>
      )}
    </div>
  );
}
