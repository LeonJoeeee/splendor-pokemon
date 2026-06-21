import { totalTokens, type GameConfig, type PlayerState } from '../engine';
import { PAYABLE_ORDER, type PayableToken } from '../engine/types';
import { ENERGIES, ENERGY_META } from './theme';
import { CardView } from './CardView';

interface Props {
  player: PlayerState;
  isCurrent: boolean;
  isActiveHuman: boolean;
  config: GameConfig;
  opponents: PlayerState[];
  affordableReserved: Set<string>;
  onBuyReserved: (cardId: string) => void;
}

export function PlayerPanel({ player, isCurrent, isActiveHuman, config, opponents, affordableReserved, onBuyReserved }: Props) {
  const tokenList = PAYABLE_ORDER.filter((t) => player.tokens[t] > 0);
  return (
    <div className={`player-panel ${isCurrent ? 'current' : ''}`}>
      <div className="player-head">
        <span className="player-name">{player.isAI ? '🤖 ' : '🧑 '}{player.name}</span>
        <span className="player-prestige" title="名望">⭐ {player.prestige}</span>
      </div>

      <div className="row-label">手牌代币（{totalTokens(player.tokens)}/10）</div>
      <div className="token-row">
        {tokenList.length === 0 && <span className="muted">—</span>}
        {tokenList.map((t: PayableToken) => (
          <span key={t} className="mini-token" style={{ background: ENERGY_META[t].hex, color: t === 'electric' || t === 'rainbow' ? '#1a1a1a' : '#fff' }}>
            {ENERGY_META[t].icon} {player.tokens[t]}
          </span>
        ))}
      </div>

      <div className="row-label">永久属性产出（折扣/徽章）</div>
      <div className="token-row">
        {ENERGIES.map((e) => (
          <span key={e} className={`mini-bonus ${player.bonuses[e] === 0 ? 'zero' : ''}`} style={{ borderColor: ENERGY_META[e].hex, color: ENERGY_META[e].hex }}>
            {ENERGY_META[e].icon} {player.bonuses[e]}
          </span>
        ))}
      </div>

      <div className="row-label">徽章 {player.badges.length > 0 && `（${player.badges.length}）`}</div>
      <div className="token-row">
        {player.badges.length === 0 && <span className="muted">—</span>}
        {player.badges.map((b) => (
          <span key={b.id} className="badge-chip" title={b.name}>🏅 {b.nameZh}</span>
        ))}
      </div>

      <div className="row-label">预定区 {player.reserved.length > 0 && `（${player.reserved.length}/3）`}</div>
      <div className="reserved-row">
        {player.reserved.length === 0 && <span className="muted">—</span>}
        {player.reserved.map((c) => (
          <CardView
            key={c.id}
            card={c}
            viewer={isActiveHuman ? player : undefined}
            config={config}
            opponents={opponents}
            reservedTag
            affordable={affordableReserved.has(c.id)}
            onBuy={isActiveHuman ? () => onBuyReserved(c.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
