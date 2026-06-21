// 合法动作枚举:购买 / 取2 / 取1~3异色 / 预订(仅普通阶) / 进化 / 结束回合 / (子阶段)弃牌。
import {
  COLOR_ORDER,
  HAND_LIMIT,
  MAX_RESERVED,
  PAYABLE_ORDER,
  TAKE_TWO_MIN_PILE,
  TIER_PILES,
  ALL_PILES,
  type Action,
  type Color,
  type DiscardAction,
  type EvolveAction,
  type GameState,
  type PayableToken,
  type PlayerState,
  type Stage,
  type TokenPool,
} from './types';
import { buildBuyAction } from './buy';
import { colorVectorMeets, emptyPool, totalTokens } from './util';

/** 取「不同色」动作:1~3 个互异色的全部非空子集。 */
function takeDifferentCombos(available: Color[]): Color[][] {
  const out: Color[][] = [];
  const n = available.length;
  for (let i = 0; i < n; i++) {
    out.push([available[i]]);
    for (let j = i + 1; j < n; j++) {
      out.push([available[i], available[j]]);
      for (let k = j + 1; k < n; k++) out.push([available[i], available[j], available[k]]);
    }
  }
  return out;
}

/** 规范弃牌:从最大堆起弃至 10,大师球优先级最低。 */
export function canonicalDiscard(player: PlayerState): DiscardAction {
  let excess = totalTokens(player.tokens) - HAND_LIMIT;
  const discard = emptyPool();
  while (excess > 0) {
    let pick: PayableToken = 'master';
    let pickN = -1;
    for (const c of COLOR_ORDER) {
      const avail = player.tokens[c] - discard[c];
      if (avail > pickN) {
        pickN = avail;
        pick = c;
      }
    }
    if (pickN <= 0) pick = 'master';
    discard[pick] += 1;
    excess -= 1;
  }
  return { type: 'DISCARD', tokens: discard };
}

/** 当前玩家本回合可执行的进化动作(回合末免费动作)。 */
export function legalEvolutions(state: GameState, player: PlayerState): EvolveAction[] {
  const out: EvolveAction[] = [];
  for (const x of player.purchased) {
    if (x.kind !== 'normal' || x.stage >= 3 || !x.evolvesToSpeciesId || !x.evolveCost) continue;
    if (!colorVectorMeets(player.bonuses, x.evolveCost)) continue;
    const target = x.evolvesToSpeciesId;
    // 展示区目标
    for (const pile of ALL_PILES) {
      for (const c of state.decks[pile].faceUp) {
        if (c && c.kind === 'normal' && c.speciesId === target) {
          out.push({ type: 'EVOLVE', fromCardId: x.id, toCardId: c.id });
        }
      }
    }
    // 预订手牌目标(可配置)
    if (state.config.evolveFromReserved) {
      for (const c of player.reserved) {
        if (c.kind === 'normal' && c.speciesId === target) {
          out.push({ type: 'EVOLVE', fromCardId: x.id, toCardId: c.id });
        }
      }
    }
  }
  return out;
}

export function legalMoves(state: GameState): Action[] {
  if (state.isGameOver) return [];
  const me = state.players[state.currentPlayerIndex];

  if (state.awaitingDiscard) return [canonicalDiscard(me)];
  if (state.awaitingEvolve) return [...legalEvolutions(state, me), { type: 'END_TURN' }];

  const moves: Action[] = [];

  // (D) 购买:所有展示区(含稀有/传说)+ 预订区
  for (const pile of ALL_PILES) {
    for (const card of state.decks[pile].faceUp) {
      if (!card) continue;
      const built = buildBuyAction(me, card, { kind: 'board', cardId: card.id });
      if (built) moves.push(built.action);
    }
  }
  for (const card of me.reserved) {
    const built = buildBuyAction(me, card, { kind: 'reserved', cardId: card.id });
    if (built) moves.push(built.action);
  }

  // (B) 取同色 2 个(该堆 ≥4)
  for (const c of COLOR_ORDER) {
    if (state.tokenPool[c] >= TAKE_TWO_MIN_PILE) moves.push({ type: 'TAKE_TWO', color: c });
  }

  // (A) 取 1~3 异色
  const available = COLOR_ORDER.filter((c) => state.tokenPool[c] > 0);
  for (const combo of takeDifferentCombos([...available])) moves.push({ type: 'TAKE_THREE', colors: combo });

  // (C) 预订:仅普通阶(稀有/传说不可预订),预订区 <3
  if (me.reserved.length < MAX_RESERVED) {
    for (const pile of TIER_PILES) {
      for (const card of state.decks[pile].faceUp) {
        if (card) moves.push({ type: 'RESERVE', source: { kind: 'board', cardId: card.id } });
      }
      if (state.decks[pile].drawPile.length > 0) {
        moves.push({ type: 'RESERVE', source: { kind: 'deck', pile: pile as Stage } });
      }
    }
  }

  return moves;
}

export function hasNoMoves(state: GameState): boolean {
  return !state.awaitingDiscard && !state.awaitingEvolve && legalMoves(state).length === 0;
}

export { PAYABLE_ORDER };
export type { TokenPool };
