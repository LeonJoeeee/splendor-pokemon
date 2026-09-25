import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { applyAction, createGame, legalEvolutions, legalMoves, refreshPlayerDerived, totalTokens, type Card, type GameState } from '../src/engine';
import { ALL_PILES, COLOR_ORDER, COLOR_SUPPLY_BY_PLAYERS, MASTER_SUPPLY, PAYABLE_ORDER } from '../src/engine/types';
import { CARDS } from '../src/data/cards';
import { nextSoloTurn } from '../src/solo/turn';
import { serializeState } from '../src/net/serialize';
import { SOLO_SAVE_KEY } from '../src/solo/save';

function assertConserved(state: GameState) {
  const all = ALL_PILES.flatMap((pile) => [...state.decks[pile].drawPile, ...state.decks[pile].faceUp.filter((card): card is Card => !!card)])
    .concat(state.players.flatMap((player) => [...player.purchased, ...player.reserved, ...player.evolved]));
  assert.equal(all.length, CARDS.length);
  assert.equal(new Set(all.map((card) => card.id)).size, CARDS.length, 'Every card must occupy exactly one zone');
  for (const token of PAYABLE_ORDER) {
    assert.equal(state.tokenPool[token] + state.players.reduce((sum, player) => sum + player.tokens[token], 0),
      token === 'master' ? MASTER_SUPPLY : COLOR_SUPPLY_BY_PLAYERS[4], `${token} supply is conserved`);
  }
  assert.equal(state.decks[1].faceUp.filter(Boolean).length + state.decks[2].faceUp.filter(Boolean).length + state.decks[3].faceUp.filter(Boolean).length + state.decks.rare.faceUp.filter(Boolean).length + state.decks.legendary.faceUp.filter(Boolean).length, 14);
  assert.equal(state.players[0].reserved.length, 3);
  assert.equal(new Set(state.players[0].reserved.map((card) => card.id)).size, 3);
}

function longestVisibleNames(state: GameState) {
  for (const pile of [1, 2, 3] as const) {
    const deck = state.decks[pile];
    const longest = [...deck.drawPile].sort((a, b) => b.nameZh.length - a.nameZh.length)[0];
    if (!longest) continue;
    const index = deck.drawPile.findIndex((card) => card.id === longest.id);
    deck.drawPile[index] = deck.faceUp[0]!;
    deck.faceUp[0] = longest;
  }
}

function baseFixture(): GameState {
  let state = createGame({ players: [
    { id: 'P0', name: '超级训练家', isAI: false },
    { id: 'P1', name: '电脑训练家一', isAI: true },
    { id: 'P2', name: '电脑训练家二', isAI: true },
    { id: 'P3', name: '电脑训练家三', isAI: true },
  ], cards: CARDS, seed: 42 });
  for (const stage of [1, 2, 3] as const) {
    assert.equal(state.currentPlayerIndex, 0);
    state = applyAction(state, { type: 'RESERVE', source: { kind: 'deck', pile: stage } });
    for (let n = 0; state.currentPlayerIndex !== 0 && n < 40; n++) state = nextSoloTurn(state);
    assert.equal(state.currentPlayerIndex, 0);
  }
  longestVisibleNames(state);
  assertConserved(state);
  return state;
}

function removeFromDraw(state: GameState, predicate: (card: Card) => boolean): Card {
  for (const pile of ALL_PILES) {
    const index = state.decks[pile].drawPile.findIndex(predicate);
    if (index >= 0) return state.decks[pile].drawPile.splice(index, 1)[0];
  }
  throw new Error('Required fixture card was unavailable');
}

function evolveFixture(base: GameState): GameState {
  const state = structuredClone(base);
  const me = state.players[0];
  const targets = ALL_PILES.flatMap((pile) => state.decks[pile].faceUp.filter((card): card is Card => !!card));
  const pairs = targets.map((target) => ({ target, from: ALL_PILES.flatMap((pile) => state.decks[pile].drawPile).find((card) => card.evolvesToSpeciesId === target.speciesId) }))
    .filter((pair): pair is { target: Card; from: Card } => pair.target.kind === 'normal' && !!pair.from?.evolveCost)
    .slice(0, 4);
  assert.ok(pairs.length >= 2, 'Fixture exposes multiple evolution pairs');
  for (const pair of pairs) me.purchased.push(removeFromDraw(state, (card) => card.id === pair.from.id));
  refreshPlayerDerived(me);
  for (const color of COLOR_ORDER) {
    const needed = Math.max(...pairs.map((pair) => pair.from.evolveCost?.[color] ?? 0));
    while (me.bonuses[color] < needed) {
      me.purchased.push(removeFromDraw(state, (card) => card.bonus === color && card.kind === 'normal' && card.stage === 1));
      refreshPlayerDerived(me);
    }
  }
  state.awaitingEvolve = true;
  assert.ok(legalEvolutions(state, me).length >= 2);
  assertConserved(state);
  return state;
}

function discardFixture(base: GameState): GameState {
  const state = structuredClone(base);
  const me = state.players[0];
  while (totalTokens(me.tokens) <= 10) {
    const color = COLOR_ORDER.find((key) => state.tokenPool[key] > 0);
    assert.ok(color);
    state.tokenPool[color]--;
    me.tokens[color]++;
  }
  state.awaitingDiscard = true;
  assert.ok(legalMoves(state).some((action) => action.type === 'DISCARD'));
  assertConserved(state);
  return state;
}

function waitingFixture(base: GameState): GameState {
  const move = legalMoves(base).find((action) => action.type === 'TAKE_THREE' && action.colors.length === 1);
  assert.ok(move);
  const state = applyAction(base, move);
  assert.equal(state.players[state.currentPlayerIndex].isAI, true);
  assertConserved(state);
  return state;
}

function encoded(state: GameState) { return JSON.stringify({ version: 1, state: serializeState(state) }); }

async function main() {
  const base = baseFixture();
  const fixtures = { main: base, discard: discardFixture(base), evolve: evolveFixture(base), waiting: waitingFixture(base) };
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/`;
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const output = process.env.TABLETOP_EVIDENCE_DIR;
  if (output) await mkdir(output, { recursive: true });
  try {
    for (const [width, height] of [[1280, 800], [1440, 900]] as const) {
      for (const [phase, state] of Object.entries(fixtures)) {
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
        await context.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: SOLO_SAVE_KEY, value: encoded(state) });
        const page = await context.newPage();
        await page.goto(url);
        await page.getByRole('button', { name: '继续对局' }).click();
        await page.locator('.tier-row .card-select').first().click();
        assert.equal(await page.locator('.inspector-details').count(), 1);
        const dimensions = await page.evaluate(() => {
          const selectors = ['.turnbar', '.table-piles', '.bank-section', '.card-inspector', '.players', '.reserve-area', '.evolution-readiness', '.tier-row .card-select', '.special-cell .card-select', '.deck-count', '.compact-resource', '.reserved-slot', '.inspector-details', '.inspector-actions'];
          const boxes = Object.fromEntries(selectors.map((selector) => [selector, [...document.querySelectorAll(selector)].map((element) => {
            const rect = element.getBoundingClientRect();
            return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
          })]));
          return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, boxes,
            font: { cardCost: Number.parseFloat(getComputedStyle(document.querySelector('.tier-row .cost-chip')!).fontSize),
              resourceCount: Number.parseFloat(getComputedStyle(document.querySelector('.compact-resource b')!).fontSize),
              bankCount: Number.parseFloat(getComputedStyle(document.querySelector('.token-count')!).fontSize),
              bankTake: document.querySelector('.bank-col .btn.tiny') ? Number.parseFloat(getComputedStyle(document.querySelector('.bank-col .btn.tiny')!).fontSize) : null,
              resourceLabel: Number.parseFloat(getComputedStyle(document.querySelector('.compact-resource')!).fontSize) } };
        });
        console.log(JSON.stringify({ phase, dimensions }));
        assert.equal(dimensions.scrollWidth <= width, true, `${phase} ${width}: horizontal overflow`);
        assert.equal(dimensions.scrollHeight <= height, true, `${phase} ${width}: vertical overflow`);
        assert.equal(dimensions.boxes['.tier-row .card-select'].length, 12);
        assert.equal(dimensions.boxes['.special-cell .card-select'].length, 2);
        assert.equal(dimensions.boxes['.compact-resource'].length, 24);
        assert.equal(dimensions.boxes['.reserved-slot'].length, 3);
        if (phase === 'evolve') {
          assert.ok(await page.locator('#evolution-choice option').count() >= 2, 'All legal evolution pairs appear in the bounded chooser');
          const second = await page.locator('#evolution-choice option').nth(1).getAttribute('value');
          assert.ok(second);
          await page.locator('#evolution-choice').selectOption(second);
          assert.equal(await page.locator('#evolution-choice').inputValue(), second);
        }
        assert.ok(dimensions.font.cardCost >= 11 && dimensions.font.resourceCount >= 12 && dimensions.font.bankCount >= 13
          && (dimensions.font.bankTake === null || dimensions.font.bankTake >= 11) && dimensions.font.resourceLabel >= 11,
          `${phase} ${width}: strategic numbers are too small`);
        for (const [selector, boxes] of Object.entries(dimensions.boxes)) for (const box of boxes) {
          assert.ok(box.x >= 0 && box.y >= 0 && box.right <= width && box.bottom <= height, `${phase} ${width}: ${selector} outside viewport`);
        }
        const clipped = await page.evaluate(() => [...document.querySelectorAll('.card-select')].flatMap((card) =>
          [...card.querySelectorAll('.card-name, .card-cost, .card-evo-line, .card-art')]
            .filter((part) => part.getBoundingClientRect().bottom > card.getBoundingClientRect().bottom + 1)
            .map((part) => `${card.getAttribute('aria-label')} / ${part.className}`)));
        assert.deepEqual(clipped, [], `${phase} ${width}: card content crosses its face`);
        if (output) await page.screenshot({ path: `${output}/${phase}-${width}x${height}.png` });
        await context.close();
      }
    }
    const keyboardState = createGame({ players: [
      { id: 'P0', name: '键盘玩家', isAI: false }, { id: 'P1', name: '电脑一', isAI: true },
      { id: 'P2', name: '电脑二', isAI: true }, { id: 'P3', name: '电脑三', isAI: true },
    ], cards: CARDS, seed: 42 });
    const keyboardContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await keyboardContext.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: SOLO_SAVE_KEY, value: encoded(keyboardState) });
    const keyboard = await keyboardContext.newPage();
    await keyboard.goto(url);
    await keyboard.getByRole('button', { name: '继续对局' }).click();
    const firstCard = keyboard.locator('.tier-row .card-select').first();
    const firstId = await firstCard.getAttribute('aria-label');
    await firstCard.focus();
    await keyboard.keyboard.press('Enter');
    assert.equal(await firstCard.getAttribute('aria-pressed'), 'true', 'Enter selects without acting');
    assert.equal(await keyboard.locator('.reserved-slot').count(), 0);
    await keyboard.keyboard.press('Escape');
    assert.equal(await keyboard.locator('.inspector-details').count(), 0);
    assert.equal(await firstCard.evaluate((element) => document.activeElement === element), true, 'Escape returns focus to the card');
    await keyboard.keyboard.press('Space');
    assert.equal(await firstCard.getAttribute('aria-pressed'), 'true', 'Space selects without acting');
    await keyboard.getByRole('button', { name: /^预订 / }).focus();
    await keyboard.keyboard.press('Enter');
    await keyboard.waitForFunction(() => document.activeElement?.classList.contains('card-select'));
    assert.equal(await keyboard.locator('.reserved-slot').count(), 1);
    assert.equal(await keyboard.locator('.inspector-details').count(), 0, 'Refill invalidates the selected card');
    assert.notEqual(await keyboard.locator('.tier-row .card-select').first().getAttribute('aria-label'), firstId);
    assert.equal(await keyboard.locator('.tier-row .card-select').first().evaluate((element) => document.activeElement === element), true, 'Refill focuses the same slot');
    await keyboard.locator('.reserved-slot').focus();
    await keyboard.keyboard.press('Enter');
    assert.equal(await keyboard.locator('.inspector-details').count(), 1, 'Own reservation can be inspected by keyboard');
    await keyboard.locator('.table-context summary').focus();
    await keyboard.keyboard.press('Enter');
    assert.equal(await keyboard.locator('.table-context[open] .context-content section').count(), 4, 'Every player roster is available by keyboard');
    await keyboardContext.close();

    const buyState = structuredClone(base);
    const affordable = buyState.decks[1].faceUp.map((card, index) => ({ card, index }))
      .filter((entry): entry is { card: Card; index: number } => !!entry.card)
      .filter(({ card }) => !card.cost.master && COLOR_ORDER.every((color) => (card.cost[color] ?? 0) <= buyState.tokenPool[color]))
      .sort((a, b) => COLOR_ORDER.reduce((sum, color) => sum + (a.card.cost[color] ?? 0) - (b.card.cost[color] ?? 0), 0))[0];
    assert.ok(affordable);
    for (const color of COLOR_ORDER) {
      const n = affordable.card.cost[color] ?? 0;
      buyState.tokenPool[color] -= n;
      buyState.players[0].tokens[color] += n;
    }
    assertConserved(buyState);
    const buyContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await buyContext.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: SOLO_SAVE_KEY, value: encoded(buyState) });
    const buyPage = await buyContext.newPage();
    await buyPage.goto(url);
    await buyPage.getByRole('button', { name: '继续对局' }).click();
    await buyPage.locator('.tier-row').last().locator('.card-select').nth(affordable.index).focus();
    await buyPage.keyboard.press('Enter');
    assert.equal(await buyPage.locator('.inspector-actions .buy').isEnabled(), true);
    await buyPage.locator('.inspector-actions .buy').focus();
    await buyPage.keyboard.press('Enter');
    assert.equal(await buyPage.locator('.inspector-details').count(), 0, 'Keyboard purchase invalidates the selected card');
    await buyContext.close();

    const takeContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await takeContext.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: SOLO_SAVE_KEY, value: encoded(keyboardState) });
    const takePage = await takeContext.newPage();
    await takePage.goto(url);
    await takePage.getByRole('button', { name: '继续对局' }).click();
    await takePage.locator('.tier-row .card-select').first().focus();
    await takePage.keyboard.press('Enter');
    const heldName = await takePage.locator('.inspector-name').textContent();
    for (const color of ['红球', '蓝球', '黄球']) {
      await takePage.getByRole('button', { name: new RegExp(`选择${color}`) }).focus();
      await takePage.keyboard.press('Enter');
    }
    await takePage.getByRole('button', { name: '确认取 3 种' }).focus();
    await takePage.keyboard.press('Enter');
    assert.equal(await takePage.locator('.inspector-name').textContent(), heldName, 'Harmless token update preserves selection');
    await takeContext.close();

    const evolveContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await evolveContext.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: SOLO_SAVE_KEY, value: encoded(fixtures.evolve) });
    const evolvePage = await evolveContext.newPage();
    await evolvePage.goto(url);
    await evolvePage.getByRole('button', { name: '继续对局' }).click();
    const firstChoice = await evolvePage.locator('#evolution-choice').inputValue();
    await evolvePage.locator('#evolution-choice').focus();
    await evolvePage.keyboard.press('ArrowDown');
    assert.notEqual(await evolvePage.locator('#evolution-choice').inputValue(), firstChoice, 'Keyboard reaches another legal evolution');
    const previousSave = await evolvePage.evaluate((key) => localStorage.getItem(key), SOLO_SAVE_KEY);
    await evolvePage.getByRole('button', { name: '确认进化' }).focus();
    await evolvePage.keyboard.press('Enter');
    await evolvePage.waitForFunction(({ key, previous }) => localStorage.getItem(key) !== previous, { key: SOLO_SAVE_KEY, previous: previousSave });
    await evolveContext.close();

    for (const width of [1280, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: width === 1280 ? 800 : 900 } });
      await context.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: SOLO_SAVE_KEY, value: encoded(base) });
      const page = await context.newPage();
      await page.route('**/sprites/**', (route) => route.abort());
      await page.route('**/cdn.jsdelivr.net/**', (route) => route.abort());
      await page.goto(url);
      await page.getByRole('button', { name: '继续对局' }).click();
      await page.locator('.tier-row .art-fallback').first().waitFor();
      assert.equal(await page.locator('.tier-row .art-fallback').first().isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), true, `${width}: fallback art fits`);
      if (output) await page.screenshot({ path: `${output}/fallback-${width}x${width === 1280 ? 800 : 900}.png` });
      await context.close();
    }
    for (const width of [900, 640]) {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      await context.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: SOLO_SAVE_KEY, value: encoded(base) });
      const page = await context.newPage();
      await page.goto(url);
      await page.getByRole('button', { name: '继续对局' }).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}: no horizontal overflow`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), true, `${width}: page scrolls naturally`);
      await page.locator('.tier-row .card-select').first().click();
      await page.locator('.inspector-actions .reserve').scrollIntoViewIfNeeded();
      assert.equal(await page.locator('.inspector-actions .reserve').isVisible(), true);
      if (output) await page.screenshot({ path: `${output}/reflow-${width}x800.png`, fullPage: true });
      await context.close();
    }
    const online = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await online.goto(`${url}tests/online-harness.html`);
    await online.locator('.tier-row .card-select').first().click();
    await online.getByRole('button', { name: /^预订 / }).click();
    assert.equal(await online.locator('.reserved-slot').count(), 1, 'Seated online dispatch applies a reserve and rerenders');
    await online.close();

    const viewer = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await viewer.goto(`${url}tests/online-harness.html?viewer=1`);
    await viewer.locator('.tier-row .card-select').first().click();
    assert.equal(await viewer.locator('.inspector-details').count(), 1, 'Viewer can inspect public cards');
    assert.equal(await viewer.locator('.inspector-actions .buy').isDisabled(), true);
    assert.equal(await viewer.locator('.inspector-actions .reserve').isDisabled(), true);
    assert.equal(await viewer.locator('.reserved-slot').count(), 0);
    await viewer.close();
  } finally { await browser.close(); await server.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
