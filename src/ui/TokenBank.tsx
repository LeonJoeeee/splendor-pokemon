import type { Ref } from 'react';
import { TAKE_TWO_MIN_PILE, COLOR_ORDER, PAYABLE_ORDER, type Color, type TokenPool } from '../engine/types';
import { BALL_META, textOn } from './theme';

export function TokenBank({ pool }: { pool: TokenPool }) {
  return <div className="token-bank" aria-label="宝可梦球供给">
    {PAYABLE_ORDER.map((color) => <div key={color} className="bank-col" aria-label={`${BALL_META[color].zh}剩余 ${pool[color]} 个`}>
      <span className="bank-token" style={{ background: BALL_META[color].hex, color: textOn(color) }}>
        <span className="token-name">{BALL_META[color].zh.replace('球', '')}</span>
        <strong className="token-count">{pool[color]}</strong>
      </span>
    </div>)}
  </div>;
}

interface TakeProps {
  pool: TokenPool;
  selected: Record<Color, number>;
  onToggle: (color: Color) => void;
  onTakeTwo: (color: Color) => void;
  onConfirmTake: () => void;
  onClear: () => void;
  firstButtonRef?: Ref<HTMLButtonElement>;
}

export function TakeBallActions({ pool, selected, onToggle, onTakeTwo, onConfirmTake, onClear, firstButtonRef }: TakeProps) {
  const chosen = COLOR_ORDER.filter((color) => selected[color] > 0);
  const sameColor = chosen.length === 1 ? chosen[0] : null;
  const canTakeTwo = sameColor !== null && pool[sameColor] >= TAKE_TWO_MIN_PILE;
  const reason = sameColor && !canTakeTwo ? `${BALL_META[sameColor].zh}剩余不足 4 个，不能取 2 个` :
    chosen.length === 0 ? '选择 1–3 种有库存的普通球。大师球只能通过预订获得。' :
      chosen.length > 1 ? '取 2 个同色球须只选一种颜色。' : '可取所选颜色的 1 个，或取 2 个同色球。';
  return <div className="take-actions">
    <div className="take-colors" aria-label="选择普通球颜色">
      {COLOR_ORDER.map((color, index) => <button key={color} ref={index === 0 ? firstButtonRef : undefined} type="button"
        className={`take-color ${selected[color] ? 'selected' : ''}`} disabled={pool[color] === 0 && !selected[color]}
        onClick={() => onToggle(color)} aria-pressed={!!selected[color]}
        aria-label={`选择${BALL_META[color].zh}，供给 ${pool[color]} 个`}>
        <i className="combo-dot" style={{ background: BALL_META[color].hex }} />{BALL_META[color].zh.replace('球', '')}
      </button>)}
    </div>
    <div className="take-buttons">
      <span className="selection-summary" aria-live="polite">已选 {chosen.length} 种</span>
      <button className="btn primary" disabled={chosen.length === 0} onClick={onConfirmTake}>确认取 {chosen.length} 种</button>
      <button className="btn" disabled={!canTakeTwo} onClick={() => { if (sameColor) onTakeTwo(sameColor); }}>取 2 个同色</button>
      <button className="btn" disabled={chosen.length === 0} onClick={onClear}>清空</button>
    </div>
    <p className="action-reason">{reason}</p>
  </div>;
}
