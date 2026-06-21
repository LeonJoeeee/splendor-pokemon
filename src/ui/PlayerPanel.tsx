import { totalTokens, type PlayerState } from '../engine';
import { COLOR_ORDER, PAYABLE_ORDER, type PayableToken } from '../engine/types';
import { BALL_META, textOn } from './theme';
import { CardView } from './CardView';

interface Props {
  player: PlayerState;
  isCurrent: boolean;
  isActiveHuman: boolean;
  affordableReserved: Set<string>;
  onBuyReserved: (cardId: string) => void;
}

export function PlayerPanel({ player, isCurrent, isActiveHuman, affordableReserved, onBuyReserved }: Props) {
  const tokenList = PAYABLE_ORDER.filter((t) => player.tokens[t] > 0);
  return (
    <div className={`player-panel ${isCurrent ? 'current' : ''}`}>
      <div className="player-head">
        <span className="player-name">{player.isAI ? '🤖 ' : '🧑 '}{player.name}</span>
        <span className="player-points" title="分数">🏆 {player.points}</span>
      </div>

      <div className="row-label">手牌球({totalTokens(player.tokens)}/10)</div>
      <div className="token-row">
        {tokenList.length === 0 && <span className="muted">—</span>}
        {tokenList.map((t: PayableToken) => (
          <span key={t} className="mini-token" style={{ background: BALL_META[t].hex, color: textOn(t) }}>
            {BALL_META[t].zh.replace('球', '')} {player.tokens[t]}
          </span>
        ))}
      </div>

      <div className="row-label">永久加成(减免成本)</div>
      <div className="token-row">
        {COLOR_ORDER.map((c) => (
          <span key={c} className={`mini-bonus ${player.bonuses[c] === 0 ? 'zero' : ''}`} style={{ borderColor: BALL_META[c].hex, color: BALL_META[c].hex }}>
            {BALL_META[c].zh.replace('球', '')} {player.bonuses[c]}
          </span>
        ))}
      </div>

      <div className="row-label">
        已进化 {player.evolved.length}　·　预订 {player.reserved.length}/3
      </div>
      <div className="reserved-row">
        {player.reserved.length === 0 && <span className="muted">—</span>}
        {player.reserved.map((c) => (
          <CardView
            key={c.id}
            card={c}
            viewer={isActiveHuman ? player : undefined}
            reservedTag
            affordable={affordableReserved.has(c.id)}
            onBuy={isActiveHuman ? () => onBuyReserved(c.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
