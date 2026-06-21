import { TAKE_TWO_MIN_PILE, type EnergyType, type TokenPool } from '../engine/types';
import { ENERGIES, ENERGY_META } from './theme';

interface Props {
  pool: TokenPool;
  active: boolean;
  selected: Record<EnergyType, number>;
  selectedCount: number;
  onToggle: (e: EnergyType) => void;
  onTakeTwo: (e: EnergyType) => void;
  onConfirmTake: () => void;
  onClear: () => void;
  canConfirm: boolean;
}

export function TokenBank({ pool, active, selected, selectedCount, onToggle, onTakeTwo, onConfirmTake, onClear, canConfirm }: Props) {
  return (
    <div className="token-bank">
      <div className="bank-tokens">
        {ENERGIES.map((e) => {
          const n = pool[e];
          const sel = selected[e] > 0;
          return (
            <div key={e} className="bank-col">
              <button
                className={`token-big ${sel ? 'selected' : ''}`}
                style={{ background: ENERGY_META[e].hex, color: e === 'electric' ? '#1a1a1a' : '#fff' }}
                disabled={!active || (n === 0 && !sel)}
                onClick={() => onToggle(e)}
                title={`${ENERGY_META[e].zh}能量`}
              >
                <span className="token-icon">{ENERGY_META[e].icon}</span>
                <span className="token-count">{n}</span>
                {sel && <span className="token-sel-dot" />}
              </button>
              <button className="btn tiny" disabled={!active || n < TAKE_TWO_MIN_PILE} onClick={() => onTakeTwo(e)}>取2</button>
            </div>
          );
        })}
        <div className="bank-col">
          <div className="token-big rainbow" style={{ background: ENERGY_META.rainbow.hex, color: '#1a1a1a' }} title="彩虹能量（万能）：仅通过预定获得">
            <span className="token-icon">{ENERGY_META.rainbow.icon}</span>
            <span className="token-count">{pool.rainbow}</span>
          </div>
          <span className="btn tiny ghost">预定得</span>
        </div>
      </div>
      <div className="bank-actions">
        <button className="btn primary" disabled={!active || !canConfirm} onClick={onConfirmTake}>
          确认取 {selectedCount} 种
        </button>
        <button className="btn" disabled={selectedCount === 0} onClick={onClear}>清空</button>
        <span className="hint">点能量选 1~3 种不同色 → 确认（可只取 1 或 2）；或点「取2」拿同色 2 个（该堆≥4）</span>
      </div>
    </div>
  );
}
