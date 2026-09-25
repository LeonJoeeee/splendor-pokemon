import { totalTokens, type PlayerState } from '../engine';
import { COLOR_ORDER } from '../engine/types';
import { BALL_META } from './theme';

interface Props {
  player: PlayerState;
  isCurrent: boolean;
  mine?: boolean;
}

export function PlayerPanel({ player, isCurrent, mine }: Props) {
  return (
    <div className={`player-panel ${isCurrent ? 'current' : ''} ${mine ? 'is-me' : 'is-opp'}`}>
      <div className="player-head">
        <span className="player-name">{mine && <small className="mine-label">你</small>}{player.name}{player.isAI && <small className="ai-label">电脑</small>}{isCurrent && <small className="turn-label">行动中</small>}</span>
        <span className="player-points" title="名望分数">{player.points}<small> 分</small></span>
      </div>

      <div className="row-label">宝可梦球 {totalTokens(player.tokens)}/10 · 进化 {player.evolved.length} · 预订 {player.reserved.length}/3</div>
      <div className="combo-row">
        {COLOR_ORDER.map((c) => {
          const hand = player.tokens[c], bonus = player.bonuses[c];
          return (
            <span key={c} className="combo-cell" title={`${BALL_META[c].zh}:购买力 ${hand + bonus}(手牌 ${hand} + 折扣 ${bonus})`}>
              <span className="combo-color"><i className="combo-dot" style={{ background: BALL_META[c].hex }} />{BALL_META[c].zh.replace('球', '')}</span>
              <b className="combo-power">{hand + bonus}</b>
              <span className="combo-breakdown">球 {hand} · 加成 {bonus}</span>
            </span>
          );
        })}
        <span className="combo-cell" title={`大师球(百搭):手牌 ${player.tokens.master}`}>
          <span className="combo-color"><i className="combo-dot" style={{ background: BALL_META.master.hex }} />大师</span>
          <b className="combo-power">{player.tokens.master}</b>
          <span className="combo-breakdown">百搭球</span>
        </span>
      </div>

      {player.purchased.length > 0 && (
        <details className="owned-details">
          <summary>{player.name} 的队伍 · {player.purchased.length} 只</summary>
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
        </details>
      )}
    </div>
  );
}
