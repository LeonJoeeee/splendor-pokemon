# Desktop solo trainer mat and contextual actions

Status: draft

## Problem and context

[Issue #18](https://github.com/LeonJoeeee/splendor-pokemon/issues/18) follows the single-screen tabletop in issue #16. The left board fits at 1280×800, but four equal 2×2 player tiles squeeze names and resources, repeated take-two buttons consume space, and an often empty inspector takes height. The captured evolution phase uses a narrow selector and small buttons. The rail must make resources, supply, reservations, and the next action readable within one desktop viewport.

`GameTable` owns selection and phases for both solo and online; `PlayerPanel` displays resources, while `TokenBank` combines supply and take controls. `docs/RULES.md` governs the existing rules. Product copy stays Chinese and retains the tabletop/card palette.

## Options

| Approach | Result and cost |
| --- | --- |
| Keep small player tiles; collapse lower panels | Least code movement, but essential numbers or reservations disappear. |
| Full-width personal mat, compact opponent rows, supply strip, contextual actions **(chosen)** | Keeps decisions and all player numbers visible; requires explicit phase/focus handling. |
| Rail tabs for players, bank, and actions | Each tab is spacious but hides information needed during decisions. |

## Chosen design

### Geometry and information hierarchy

Keep the issue #16 left board: three four-card tiers and the adjacent rare/legendary stack. At 1280×800 and 1440×900, use a two-column `.solo-shell.solo-game` grid, a table near its current 740 px width, and the remaining roughly 500 px for the rail at 1280. Avoid stacking it under the board at nominal desktop widths. The rail follows this order:

1. **Trainer mat:** one full-width personal row with name, turn marker, score, hand total/10, five `balls / discount` pairs, master count, and a visible legend. Up to three opponent rows show those same pairs/master plus score, turn state, hand total, and reservation count. Label colors by name and dot. Names wrap in their own area without overlapping numbers. Put own evolution readiness in the mat; keep team detail secondary.
2. **Supply strip:** six labeled bank counts, including master, visible in every phase and for waiting/viewer states. The strip is status; it does not contain repeated take-two buttons.
3. **Contextual action surface:** one region with a stable heading. Default to taking balls; selection changes it to public-card, reserved-card, or deck actions. Discard and evolution replace these actions. During waiting, viewing, and results, public-card selection still opens read-only details in this region, with no action controls.
4. **My reservations:** three always-visible compact slots, including empty states. Occupied slots show full names, points/bonus, and buy readiness; selection opens buy details. Team and history stay in the keyboard-accessible secondary disclosure.

Budget roughly 250–270 px for the four-player mat, 55–65 px for supply, about 150 px for actions, and 70–85 px for reservations. These are targets, never fixed heights: enlarge the action region and rebalance spacing if the crowded evolution/discard content needs it. All pair names, conditions, and controls must remain fully readable in the four-player case. Reduce nested borders and duplicate art, not text/control size. At smaller viewports allow natural document scrolling without clipping or a rail scrollbar.

### Action and phase contract

- **Take balls:** offer five selectable ordinary colors, selected-color summary, different-color confirmation, one take-two control enabled only for exactly one selected color with supply ≥4, and clear. Respect the engine's allowed one-to-three different available colors. Master is visible but unselectable. Show disabled reasons in visible text and accessible descriptions.
- **Cards and decks:** selecting a public card shows its name, score, bonus, cost, affordability, buy, and eligible face-up reserve. Own reserved cards offer buy; normal-tier decks offer blind-reserve confirmation and count. The left board selects; the action surface confirms. Each mode has “back to balls”; Escape clears selection. Rare/legendary cards cannot be reserved.
- **Discard:** show excess over ten, six per-color step controls including master, selected count, and exact-count confirmation. Keep supply/resources visible, remove other actions, and clear obsolete selection.
- **Evolution:** show selected owned Pokémon **→** available target by full names, printed permanent-discount condition and current readiness, every legal pair in a chooser, and distinct evolve/skip buttons. Both the chooser label and selected-pair display identify each target's source and one-based location, such as “展示区·第 2 阶·第 3 格” or “我的预订·第 2 格”; stable card IDs remain the option values. This distinguishes same-name public and reserved targets and makes reservation consumption an informed choice. Choice changes update the pair/condition; revalidate against `legalEvolutions` before dispatch. Other phases still show own readiness, including missing discounts or an unavailable target. Evolution follows discard.
- **Waiting, viewer, game over:** leave supply and mat visible. Seated players waiting for their turn and unseated online viewers can select public cards and read their details; a waiting seated player may also inspect their own reservations. Show the phase explanation alongside selected details, omit all dispatch controls, and enforce local/online turn ownership in `GameTable`. Announce phase and selection changes in a live region without duplicate noisy messages.

Native buttons and select preserve Enter/Space semantics; Escape clears item selection and returns focus to its originating card/deck/reservation slot. When an action or refill removes that item, focus returns to the corresponding new slot or a stable section heading. On phase replacement, move focus from a disappearing control to the new action heading or first relevant control; leave focus in place if it remains valid. Keep visible focus treatment and a logical table-then-rail tab order. Long Chinese or online names wrap without covering scores or resources.

### Component boundaries and scope

`GameTable.tsx` owns the selected item (`board`, `reserved`, or `deck`), phase precedence, legal-action derivation, focus restoration, and unchanged `dispatch(Action)` calls. A focused contextual-actions component may be extracted if it makes these modes easier to verify; it receives derived game/player facts and callbacks, not its own copy of game rules. `PlayerPanel.tsx` supplies shared resource facts; `TokenBank.tsx` separates always-visible supply from main-phase selection actions; `CardView.tsx` remains the physical card face. These shared behavior and semantic-label changes intentionally apply to online play. Scope the new desktop geometry and compact trainer-mat styling to `.solo-shell.solo-game` in `styles.css`: `App.tsx` gives online games `.solo-game` without `.solo-shell`. Preserve the online layout and action semantics, verify seated and viewer modes in a browser, and leave `App.tsx` save/AI and online session flows intact.

No mobile redesign, printed-card art, remote UI asset, engine or card-data change, save migration, or deployment is part of this design. Implementation will synchronize `package.json` and `package-lock.json` from 0.3.0 to 0.4.0: a minor release for a substantial compatible UI/interaction change.

## Verification for the implementation stage

1. On its final current-base head, run `npm ci`, `npm test`, `npm run typecheck`, and `npm run build`. Add behavior tests for action-mode precedence, legal take-two eligibility, selected-item invalidation, and dispatch/focus transitions where they catch real regressions; retain rule tests.
2. In a real browser at 100% zoom, capture 1280×800 and 1440×900 for normal, selected board/reserved/deck, discard, evolution, and opponent-turn states. Use an engine-consistent four-player case with three unique own reservations, full public rows, long names, and legal evolution pair(s). Record document `scrollWidth <= innerWidth` and `scrollHeight <= innerHeight`, plus rail `scrollWidth <= clientWidth` and `scrollHeight <= clientHeight`. Bounding boxes must prove the full board, every player's five pairs/master/score/turn/hand/reservation data, all six supply counts, own hand cap/readiness, all reservation slots, and active controls are inside the viewport and unobscured. Inspect screenshots for readable text, not just bounding-box success.
3. Exercise different-color take, take-two threshold, select/buy/reserve public card, blind reserve, buy reserved card, forced discard, evolution and skip, AI progression, and phase changes without stale controls. Build a legal evolution case with a same-name public target and own reserved target: the chooser must distinguish source/slot, and choosing the public target must leave reservations unchanged while choosing the reserved target consumes exactly that reservation. Complete keyboard-only selection, confirmation, Escape, and focus restoration. Verify natural scrolling and action reachability just below the supported desktop size; report the minimum supported no-scroll viewport observed. Smoke-test the actual online root (`.solo-game` without `.solo-shell`): a seated player can dispatch on their turn, while a waiting player and unseated viewer can inspect public-card details without any dispatch control or action.

## Failure and rollback

The visual/action composition is reversible as one UI change; saved games remain compatible. If acceptance or post-integration browser checks fail, the orchestrator can revert the UI release and restore the previously served build under the repository's existing deployment procedure. This draft authorizes no production deployment.
