import { totalTokens, type PlayerState } from '../engine';
import { COLOR_ORDER } from '../engine/types';
import { BALL_META } from './theme';

interface Props {
  player: PlayerState;
  isCurrent: boolean;
}

export function PlayerPanel({ player, isCurrent }: Props) {
  return (
    <div className={`player-panel ${isCurrent ? 'current' : ''}`}>
      <div className="player-head">
        <span className="player-name">{player.isAI ? '🤖 ' : '🧑 '}{player.name}</span>
        <span className="player-points" title="分数">🏆 {player.points}</span>
      </div>

      <div className="row-label">球 {totalTokens(player.tokens)}/10　(购买力=手牌+折扣)</div>
      <div className="combo-row">
        <div className="combo-head"><span /><span>购买力</span><span>手牌</span><span>折扣</span></div>
        {COLOR_ORDER.map((c) => {
          const hand = player.tokens[c], bonus = player.bonuses[c];
          return (
            <span key={c} className="combo-cell" title={`${BALL_META[c].zh}:购买力 ${hand + bonus}(手牌 ${hand} + 折扣 ${bonus})`}>
              <i className="combo-dot" style={{ background: BALL_META[c].hex }} />
              <b className="combo-power">{hand + bonus}</b>
              <span className="combo-hand">{hand}</span>
              <em className="combo-bonus" style={{ color: BALL_META[c].hex }}>{bonus}</em>
            </span>
          );
        })}
        <span className="combo-cell" title={`大师球(百搭):手牌 ${player.tokens.master}`}>
          <i className="combo-dot" style={{ background: BALL_META.master.hex }} />
          <b className="combo-power">{player.tokens.master}</b>
          <span className="combo-hand">{player.tokens.master}</span>
          <em className="combo-bonus muted">–</em>
        </span>
      </div>

      <div className="row-label">进化 {player.evolved.length}　·　预订 {player.reserved.length}/3</div>

      {player.purchased.length > 0 && (
        <div className="owned-pop">
          <div className="owned-pop-title">{player.name} 拥有 {player.purchased.length} · 已进化 {player.evolved.length}</div>
          <div className="owned-pop-chips">
            {[...player.purchased]
              .sort((a, b) => COLOR_ORDER.indexOf(a.bonus) - COLOR_ORDER.indexOf(b.bonus) || a.stage - b.stage)
              .map((c) => (
                <span key={c.id} className="owned-chip" title={c.name}>
                  <i className="odot" style={{ background: BALL_META[c.bonus].hex }} />
                  {c.nameZh}<sup>{c.stage}</sup>
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
