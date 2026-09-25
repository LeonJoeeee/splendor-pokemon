import { TAKE_TWO_MIN_PILE, type Color, type TokenPool } from '../engine/types';
import { COLORS, BALL_META, textOn } from './theme';

interface Props {
  pool: TokenPool;
  active: boolean;
  selected: Record<Color, number>;
  selectedCount: number;
  onToggle: (c: Color) => void;
  onTakeTwo: (c: Color) => void;
  onConfirmTake: () => void;
  onClear: () => void;
  canConfirm: boolean;
  showActions?: boolean;
}

export function TokenBank({ pool, active, selected, selectedCount, onToggle, onTakeTwo, onConfirmTake, onClear, canConfirm, showActions = true }: Props) {
  return (
    <div className="token-bank">
      <div className="bank-tokens">
        {COLORS.map((c) => {
          const n = pool[c];
          const sel = selected[c] > 0;
          return (
            <div key={c} className="bank-col">
              <button
                className={`token-big ${sel ? 'selected' : ''}`}
                style={{ background: BALL_META[c].hex, color: textOn(c) }}
                disabled={!active || (n === 0 && !sel)}
                onClick={() => onToggle(c)}
                title={`${BALL_META[c].zh}`}
                aria-label={`选择${BALL_META[c].zh}，剩余 ${n} 个`}
                aria-pressed={sel}
              >
                <span className="token-name">{BALL_META[c].zh}</span>
                <span className="token-count">{n}</span>
                {sel && <span className="token-sel-dot" />}
              </button>
              {showActions && <button className="btn tiny" disabled={!active || n < TAKE_TWO_MIN_PILE} title={n < TAKE_TWO_MIN_PILE ? '此球堆不足 4 个' : !active ? '当前不可取球' : undefined} onClick={() => onTakeTwo(c)} aria-label={`取 2 个${BALL_META[c].zh}`}>取 2 个</button>}
            </div>
          );
        })}
        <div className="bank-col">
          <div className="token-big master" style={{ background: BALL_META.master.hex, color: '#fff' }} title="大师球(百搭):仅通过预订获得">
            <span className="token-name">大师</span>
            <span className="token-count">{pool.master}</span>
          </div>
          <span className="master-note">预订获得</span>
        </div>
      </div>
      {showActions && <div className="bank-actions">
        <span className="selection-summary" aria-live="polite">已选 {selectedCount} 种颜色</span>
        <button className="btn primary" disabled={!active || !canConfirm} onClick={onConfirmTake}>确认取 {selectedCount} 种</button>
        <button className="btn" disabled={selectedCount === 0} onClick={onClear}>清空</button>
        <span className="hint">取 2 个同色球需该堆至少剩余 4 个。大师球只能通过预订获得。</span>
      </div>}
    </div>
  );
}
