# Desktop solo tabletop redesign

Status: accepted

This document is for the independent pre-code design challenge. Implementation starts only after the accepted blob is recorded on issue #14 and the same lane is continued. Change the status to `committed` in the implementation PR.

## Purpose and scope

Make the solo PC game feel like a readable collectible tabletop game. At 1280–1920 px wide and 720–1080 px high, a player should quickly recognize whose turn it is, what action is available, which cards are affordable, and how their resources and Pokémon team affect the next move. Natural page scrolling is acceptable and preferable to shrinking essential text or controls. The existing engine, card data, AI progression, save format, static server, and online game logic remain unchanged. Product copy stays in Chinese, with visible “非官方同人” attribution.

The current `App.tsx` starts a fixed four-player game and writes it over the solo save with one click. The in-game setup also replaces the save immediately. `GameTable.tsx` contains all phase actions but spreads them among a compressed board and sidebar. Later CSS layers force the desktop board into one screen, reducing Pokémon art and card labels; mobile layers hide or move controls. This redesign changes presentation and solo entry flow while retaining the action dispatch contract.

## Options and decision

| Option | Strength | Cost |
| --- | --- | --- |
| A. Dark dashboard with compact cards and fixed viewport | Keeps much of the current geometry | Repeats the dense, small-text problem |
| B. Ink tabletop with paper cards, a prominent action tray, and natural scrolling **(chosen)** | Gives sprites and card facts room while keeping actions and status clear | The full board extends below short viewports |
| C. Horizontal carousel by tier | Gives one card row maximal space | Hides legal cards and makes comparison and keyboard navigation harder |

Choose B. Use a deep ink/navy page and matte navy panels, warm ivory card faces, restrained gold rules and highlights, and the existing ball colors for game meaning. Use system Chinese-capable fonts, CSS texture and borders, and Pokémon sprites; no UI framework, remote font, or generated artwork. Gold marks score, phase and chosen actions, not every outline. Distinct text labels and shape/border states carry meaning when ball colors are hard to distinguish.

## Page composition

### Landing and solo setup

- A spacious landing card presents the game title, solo mode description, visible fan-game attribution, and the saved game's round/player summary when a valid save exists. “继续对局” is the primary action when there is a save; “开始新对局” opens setup. With no save, new game is primary.
- The desktop setup is a separate visible form: player name (trimmed, nonempty, at most eight characters), total player count 2–4 (one human and the rest AI), and optional seed. An empty seed chooses a random seed; a supplied seed must be a decimal unsigned 32-bit integer, including zero. Inline validation explains invalid entries, and the start button remains disabled until valid. The form shows a back/cancel route without touching storage.
- If a save exists, submitting valid setup presents an in-page replacement confirmation summarizing that the current saved game will be replaced. “取消” returns to setup with its entered values; setup’s back/cancel returns to landing. “继续现有对局” returns directly to the active game using the saved state. Only an explicit “替换并开始” creates a new game, writes it with `saveSoloGame`, and opens that game. The existing save key/schema and resume behavior remain intact.
- The active solo header offers the existing return-to-landing route as the **only** route toward New. Its handler synchronously cancels any pending AI timer, then exits and unmounts `LocalGame`; effect cleanup is a backstop. Setup and confirmation live outside `LocalGame`, do not mount it, and never write storage. Continuing a save must not re-save on the initial `LocalGame` mount; its save effect runs only after an actual game-state transition. This keeps the stored bytes unchanged through return, setup, confirmation cancel, and an idle Continue. After a legal human or AI state transition, normal autosave resumes. There is no direct in-game New button that could overlap an active save effect with replacement.
- New setup no longer sits beside the game title. The hidden online entry points and `OnlineGame` logic remain functionally intact; shared styles must not break that screen.

### Game screen

- A quiet masthead shows title, solo context, fan attribution, and return control. Immediately below, a full-width turn strip names the active player, round, phase (“选择主动作”, “弃球”, “进化或结束”, “电脑行动中”, or “对局结束”), and final-round or result notice. State changes are expressed in text, not just color or emoji. This strip is not trapped by a fixed-height viewport.
- The desktop content is a two-column grid at 1280–1920 px: a flexible main table and a roughly 320–380 px side rail. The main column needs at least about 780 px at 1280 px viewport width after outer padding and gap. Set a broad max width (about 1760 px) rather than the current 1360 px cap. Allow normal document scroll; no `100vh` game container or hidden page overflow. At narrower widths, graceful reflow may occur, but a separate mobile redesign is outside this task.
- Place the action tray before the card rows in reading/tab order. During a main action it shows five selectable ball colors, their supply counts, separate “取 2” controls when legal, a clear selected-count summary, confirm/clear controls, and an explanation of the master ball. During discard it switches to per-color steppers, required/selected counts, and a disabled-until-exact confirm button. During evolve it lists every legal `from → to` pair plus “结束回合”; when no evolution is available, the end-turn control remains obvious. The tray never disappears behind a tab or sheet.
- The board follows as three explicitly titled ordinary tiers (T3, T2, T1), each with a labeled deck, remaining count, visible blind-reserve control, and four face-up slots. Empty slots remain visible. A separate rare/legendary section presents one face-up card and deck count for each; their buy action remains available and no reserve control appears. The order and labels should make scanning tiers and special cards easy without changing the engine's piles.
- Every card uses a paper-like face with its Pokémon sprite as the largest element; score and permanent bonus at top, Chinese name and stage/kind text, evolution requirement, cost with color names or accessible names, and full-sized action buttons at bottom. Buy shows a clear affordable state; unavailable buy is present but disabled with an explanatory label or title. Reserve appears only for ordinary board cards when legal. Art loads from local `/sprites/` first, then the existing CDN fallback, then a styled text placeholder with the Pokémon name if both images fail. The card and actions remain visible at every stage.
- The side rail starts with the player scoreboard: each player’s name, current-turn marker, points, ball total, per-color hand and permanent bonus, master balls, evolution and reservation counts. “Mine” is explicit. Below it, the human's reservations (up to three, with buy controls), owned team with visible evolution readiness/needs, and recent log are always accessible in the page flow. Stack reserved cards vertically or use a comparably readable layout within the 320–380 px rail; do not squeeze three full cards into narrow columns. Opponent team detail should be available by keyboard as well as pointer, rather than hover only.
- On 720–800 px heights, card rows and lower side-rail sections may sit below the fold. All required controls remain reachable by scrolling, without clipped regions or independent mini-scroll areas for core actions. At 1440×900, the board retains readable type and art instead of shrinking to fit one screen.

## Component and interaction map

| Component / file | Responsibility in the design | Existing contract retained |
| --- | --- | --- |
| `src/App.tsx` | Landing, setup form, save replacement confirmation, solo header and return flow; a solo root wrapper | `buildSoloGame`, `loadSoloGame`, `saveSoloGame`, `nextSoloTurn`, and `OnlineGame` behavior |
| `src/ui/GameTable.tsx` | Phase strip, action tray placement, tier/special board, side rail and visible team/log | `dispatch(Action)`, `youIndex`, legal move and evolution helpers |
| `src/ui/TokenBank.tsx` | Ball selection, take-two buttons, summary and master-ball explanation | `TAKE_THREE` and `TAKE_TWO` callbacks and supply rules |
| `src/ui/CardView.tsx` | Paper card hierarchy, art fallback, readable costs/states, buy/reserve buttons | Card data and existing buy/reserve callbacks |
| `src/ui/PlayerPanel.tsx` | Readable per-player score and resources with keyboard-accessible detail | `PlayerState` and derived bonus values |
| `src/styles.css` / `src/ui/theme.ts` | Consolidated desktop visual tokens and layout, focus/disabled treatments, semantic ball labels | Existing color keys and sprite URL helpers |

`GameTable` is shared with online play. Keep its props and action semantics, and avoid a solo-only assumption inside card/phase controls. Give the solo page a wrapper such as `.solo-shell` in `App.tsx`; scope the new tabletop geometry, solo masthead, landing, and solo-only CSS overrides to that wrapper instead of global `.app`/`.layout` selectors. Shared card, bank, player, and phase styling may be improved where both modes remain usable. Do not change networking or the online lobby/session state machine. The implementation may remove mobile-only tabs, sheets, and squeeze rules that conflict with the desktop layout; do not replace them with another fixed-screen mechanism.

### Legal-action coverage

| Phase | Reachable control and rule |
| --- | --- |
| Main action | Select one to three **different available** colors, then confirm; the selected-count summary updates. |
| Main action | “取 2” beside a color, enabled only when its pile has at least four and it is the human's turn. |
| Main action | Buy affordable face-up ordinary, rare, or legendary cards; buy affordable reserved cards in the side rail. |
| Main action | Reserve a face-up ordinary card or blind-reserve from any nonempty ordinary deck, subject to the three-card limit. No special-card reserve. |
| Discard | Select exactly the excess balls, including master balls if held; confirm only at the required count. |
| Evolve | Each legal evolution pair is a named button; “结束回合” is reachable even with zero options. |
| AI turn / game over | Human controls are clearly disabled or absent; turn/result text explains why. AI timer and save-on-state-change continue as before. |

Use semantic buttons and form labels, visible `:focus-visible` outlines, and descriptive accessible names for card actions (for example, “捕捉 皮卡丘”). Ball labels and counts remain visible alongside color. Card images have a Pokémon name text alternative; fallback media must not duplicate inaccessible meaning. Disabled and affordable states get text/border cues beyond color. Avoid overlay controls that conceal actions or interrupt keyboard order.

## Verification and evidence for implementation

1. Before coding, link this accepted spec blob and the independent read-only design challenge on issue #14. Keep the implementation within the accepted design and set this document's status to `committed` in the change PR.
2. Update `package.json` and `package-lock.json` together to `0.2.0`. This is a minor release because it materially redesigns the user-facing solo experience while leaving the game and save contracts compatible.
3. On the final current-base head run `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, and full `npm audit`. Add focused UI tests only for behavior with a real regression risk, particularly save replacement and phase controls; retain existing engine tests.
4. Inspect the solo desktop browser at 1280×800 and 1440×900. Keep screenshots for orchestrator inspection. Record card count/visibility, text and art legibility, action reachability after scroll, horizontal overflow, focus navigation, and console errors. Force both local `/sprites/` and CDN image failure to verify the final text placeholder; local sprites are Git-ignored and absent from this assigned checkout. At a desktop size, also smoke-check the online **game screen** for visible board/action controls, layout overflow, and console errors. Prefer a local test WebSocket service; if unavailable, mount `GameTable` outside `.solo-shell` with a controlled game fixture and online-style `youIndex`/dispatch in a temporary browser harness, without adding a production route or changing online logic.
5. Exercise a new game with selected name/player count/seed, one legal human action, AI progression, refresh and continue, then New with a saved game and both cancel and explicit replace routes. For the save regression, capture the raw `localStorage` value under the existing key, return from an active game to landing, enter setup, reach confirmation, cancel back to setup, return to landing, and Continue. With a human-turn fixture and no intervening state action, assert the raw stored value is byte-for-byte identical after each step and after idle Continue. Then choose New again, explicitly “替换并开始”, and assert the stored value changes to the new state's serialization only at that confirmation. Also assert a pending AI timer cannot write after the active game is unmounted. Use controlled browser fixtures or a deterministic game path to reach discard and evolve, and verify their controls and dispatch. Confirm rare/legendary buy, reserved buy and blind reserve remain reachable through the normal UI when legal.
6. Push a clean branch and open the issue-linked implementation PR with final command/output evidence, screenshot paths and observations. Hosted `test` and exact merged-result CI must be green before integration; the orchestrator handles the independent verdict, integration and deployment.

## Rollback

The change is confined to solo entry and presentation plus the package version. If it fails acceptance, revert the implementation PR before rollout; existing saved states still load because the key and schema do not change.

Production rollout belongs to the orchestrator after guarded integration. Build the accepted commit in a **clean staging checkout**, not in the production service checkout. Copy the production checkout's retained, Git-ignored `public/sprites` into the staging checkout before the build, and verify the resulting staged `dist/sprites` before switching; leave the production copy untouched. Keep a restorable backup of the exact previously served `dist`, then switch the served built assets and restart or reload the service as its existing deployment procedure requires. Detect a failed rollout through HTTP checks of the page, built JS/CSS and sprite URLs, browser load/console checks, and a new/continue game smoke check. On failure, restore the previous `dist`, restart or reload again, and repeat the HTTP/browser checks to verify recovery. Do not reset, clean, or overwrite the production checkout's uncommitted experiments or its retained sprites; preserve the failed-build logs and asset backup for diagnosis until the orchestrator disposes of them. No save migration or production data deletion is part of this design.
