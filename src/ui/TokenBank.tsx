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
}

export function TokenBank({ pool, active, selected, selectedCount, onToggle, onTakeTwo, onConfirmTake, onClear, canConfirm }: Props) {
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
              >
                <span className="token-name">{BALL_META[c].zh.replace('球', '')}</span>
                <span className="token-count">{n}</span>
                {sel && <span className="token-sel-dot" />}
              </button>
              <button className="btn tiny" disabled={!active || n < TAKE_TWO_MIN_PILE} onClick={() => onTakeTwo(c)}>取2</button>
            </div>
          );
        })}
        <div className="bank-col">
          <div className="token-big master" style={{ background: BALL_META.master.hex, color: '#fff' }} title="大师球(百搭):仅通过预订获得">
            <span className="token-name">大师</span>
            <span className="token-count">{pool.master}</span>
          </div>
          <span className="btn tiny ghost">预订得</span>
        </div>
      </div>
      <div className="bank-actions">
        <button className="btn primary" disabled={!active || !canConfirm} onClick={onConfirmTake}>确认取 {selectedCount} 种</button>
        <button className="btn" disabled={selectedCount === 0} onClick={onClear}>清空</button>
        <span className="hint">点球选 1~3 种不同色 → 确认;或点「取2」拿同色 2 个(该堆≥4)。大师球只能靠预订获得。</span>
      </div>
    </div>
  );
}
