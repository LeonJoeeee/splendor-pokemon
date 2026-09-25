import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createGame, legalEvolutions, refreshPlayerDerived, type GameState } from '../src/engine';
import { CARDS } from '../src/data/cards';
import { serializeState } from '../src/net/serialize';
import { SOLO_SAVE_KEY } from '../src/solo/save';

function gameFixture(aiTurn = false) {
  const game = createGame({
    players: [{ id: 'P0', name: '存档者', isAI: false }, { id: 'P1', name: '电脑1', isAI: true }],
    cards: CARDS,
    seed: 42,
  });
  if (aiTurn) game.currentPlayerIndex = 1;
  return game;
}

function encode(game: GameState) {
  return JSON.stringify({ version: 1, state: serializeState(game) });
}

function savedFixture(aiTurn = false) {
  return encode(gameFixture(aiTurn));
}

function discardFixture() {
  const game = gameFixture();
  game.players[0].tokens.red = 6;
  game.players[0].tokens.blue = 5;
  game.awaitingDiscard = true;
  return encode(game);
}

function evolveFixture() {
  const game = gameFixture();
  const from = CARDS.find((card) => card.kind === 'normal' && card.stage === 1 && card.evolvesToSpeciesId && card.evolveCost);
  assert.ok(from?.evolvesToSpeciesId && from.evolveCost);
  const target = CARDS.find((card) => card.kind === 'normal' && card.stage === 2 && card.speciesId === from.evolvesToSpeciesId);
  assert.ok(target);
  const purchased = [from];
  for (const color of ['red', 'blue', 'black', 'pink', 'yellow'] as const) {
    const need = Math.max(0, (from.evolveCost[color] ?? 0) - (from.bonus === color ? 1 : 0));
    purchased.push(...CARDS.filter((card) => card.bonus === color && card.id !== from.id && card.id !== target.id).slice(0, need));
  }
  game.players[0].purchased = purchased;
  refreshPlayerDerived(game.players[0]);
  game.decks[2].faceUp[0] = target;
  game.awaitingEvolve = true;
  assert.ok(legalEvolutions(game, game.players[0]).length > 0);
  return encode(game);
}

function richFixture(withReservation = false) {
  const game = gameFixture();
  for (const color of ['red', 'blue', 'black', 'pink', 'yellow'] as const) game.players[0].bonuses[color] = 10;
  game.players[0].tokens.master = 2;
  if (withReservation) {
    const visible = new Set(Object.values(game.decks).flatMap((deck) => deck.faceUp.map((card) => card?.id)));
    const reserved = CARDS.find((card) => card.kind === 'normal' && !visible.has(card.id));
    assert.ok(reserved);
    game.players[0].reserved = [reserved];
  }
  return encode(game);
}

async function withSavedPage(browser: Awaited<ReturnType<typeof chromium.launch>>, url: string, raw: string) {
  const context = await browser.newContext();
  await context.addInitScript(({ key, value }) => {
    if (!sessionStorage.getItem('fixture-ready')) {
      localStorage.setItem(key, value);
      sessionStorage.setItem('fixture-ready', '1');
    }
    const original = Storage.prototype.setItem;
    (window as unknown as { saveWrites: number }).saveWrites = 0;
    Storage.prototype.setItem = function (...args) {
      if (this === localStorage && args[0] === key) (window as unknown as { saveWrites: number }).saveWrites++;
      return original.apply(this, args);
    };
  }, { key: SOLO_SAVE_KEY, value: raw });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url);
  return { context, page, errors };
}

async function saveSnapshot(page: Awaited<ReturnType<typeof withSavedPage>>['page']) {
  return page.evaluate((key) => ({
    raw: localStorage.getItem(key),
    writes: (window as unknown as { saveWrites: number }).saveWrites,
  }), SOLO_SAVE_KEY);
}

async function main() {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('No Vite port');
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const url = `http://127.0.0.1:${address.port}/`;
    const page = await browser.newPage();
    await page.goto(url);
    if (process.env.SOLO_SCREENSHOT_DIR) {
      await mkdir(process.env.SOLO_SCREENSHOT_DIR, { recursive: true });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.screenshot({ path: `${process.env.SOLO_SCREENSHOT_DIR}/landing-1440x900.png` });
    }
    await page.getByRole('button', { name: '开始新对局' }).click();
    if (process.env.SOLO_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SOLO_SCREENSHOT_DIR}/setup-1440x900.png` });
    assert.deepEqual(await page.getByLabel('总人数').locator('option').allTextContents(), [
      '2 人 · 你与 1 位电脑', '3 人 · 你与 2 位电脑', '4 人 · 你与 3 位电脑',
    ]);
    await page.getByLabel('你的名字').fill('小霞');
    await page.getByLabel('总人数').selectOption('2');
    await page.getByLabel('种子').fill('4294967296');
    assert.equal(await page.getByRole('button', { name: '开始对局' }).isDisabled(), true);
    await page.getByLabel('种子').fill('');
    assert.equal(await page.getByRole('button', { name: '开始对局' }).isEnabled(), true, 'Seed may be omitted');
    await page.getByLabel('种子').fill('42');
    assert.equal(await page.getByRole('button', { name: '开始对局' }).isEnabled(), true);
    await page.getByRole('button', { name: '开始对局' }).click();
    assert.equal(await page.locator('.player-name').filter({ hasText: '小霞' }).count(), 1);

    const raw = savedFixture();
    const saved = await withSavedPage(browser, url, raw);
    try {
      await saved.page.getByRole('button', { name: '开始新对局' }).click();
      await saved.page.getByRole('button', { name: '开始对局' }).click();
      assert.equal(await saved.page.getByRole('heading', { name: '替换现有对局？' }).count(), 1);
      assert.deepEqual(await saveSnapshot(saved.page), { raw, writes: 0 });
      await saved.page.getByRole('button', { name: '取消' }).click();
      assert.deepEqual(await saveSnapshot(saved.page), { raw, writes: 0 });
      await saved.page.getByRole('button', { name: '返回' }).click();
      await saved.page.getByRole('button', { name: '继续对局' }).click();
      assert.deepEqual(await saveSnapshot(saved.page), { raw, writes: 0 });
      await saved.page.getByRole('button', { name: '返回首页' }).click();
      await saved.page.getByRole('button', { name: '开始新对局' }).click();
      await saved.page.getByRole('button', { name: '开始对局' }).click();
      await saved.page.getByRole('button', { name: '替换并开始' }).click();
      const replaced = await saveSnapshot(saved.page);
      assert.notEqual(replaced.raw, raw);
      assert.equal(replaced.writes, 1);
    } finally {
      await saved.context.close();
    }

    const aiRaw = savedFixture(true);
    const pending = await withSavedPage(browser, url, aiRaw);
    try {
      await pending.page.getByRole('button', { name: '继续对局' }).click();
      await pending.page.getByRole('button', { name: '返回首页' }).click();
      await pending.page.waitForTimeout(750);
      assert.deepEqual(await saveSnapshot(pending.page), { raw: aiRaw, writes: 0 });
    } finally {
      await pending.context.close();
    }

    const tabletop = await withSavedPage(browser, url, raw);
    try {
      await tabletop.page.getByRole('button', { name: '继续对局' }).click();
      const tray = await tabletop.page.locator('.bank-section').boundingBox();
      const firstTier = await tabletop.page.locator('.tier-row').first().boundingBox();
      assert.ok(tray && firstTier && tray.y < firstTier.y, 'Action tray must precede card tiers');
      assert.equal(await tabletop.page.getByRole('button', { name: /盲抽预订/ }).count(), 3);
      await tabletop.page.keyboard.press('Tab');
      await tabletop.page.getByRole('button', { name: /选择红球/ }).focus();
      const focus = await tabletop.page.getByRole('button', { name: /选择红球/ }).evaluate((button) => {
        const style = getComputedStyle(button);
        return { color: style.outlineColor, style: style.outlineStyle, width: style.outlineWidth };
      });
      assert.deepEqual(focus, { color: 'rgb(244, 210, 132)', style: 'solid', width: '3px' }, 'Gold keyboard focus is visible on the dark action panel');
      await tabletop.page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('.card-art img')].every((img) => img.complete), null, { timeout: 20000 });
      assert.deepEqual(tabletop.errors, []);
      if (process.env.SOLO_SCREENSHOT_DIR) {
        await mkdir(process.env.SOLO_SCREENSHOT_DIR, { recursive: true });
        for (const [width, height] of [[1280, 800], [1440, 900]]) {
          await tabletop.page.setViewportSize({ width, height });
          assert.equal(await tabletop.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px desktop board has no horizontal overflow`);
          assert.equal(await tabletop.page.locator('.tier-row .card').count(), 12, 'Four face-up cards remain visible in each normal tier');
          assert.equal(await tabletop.page.getByRole('button', { name: /盲抽预订/ }).count(), 3);
          await tabletop.page.screenshot({ path: `${process.env.SOLO_SCREENSHOT_DIR}/board-${width}x${height}.png`, fullPage: true });
        }
      }
    } finally {
      await tabletop.context.close();
    }

    const art = await withSavedPage(browser, url, raw);
    try {
      await art.page.route('**/sprites/**', (route) => route.abort());
      await art.page.route('**/cdn.jsdelivr.net/**', (route) => route.abort());
      await art.page.getByRole('button', { name: '继续对局' }).click();
      await art.page.locator('.card-art .art-fallback').first().waitFor();
      assert.equal(await art.page.locator('.card-art .art-fallback').first().isVisible(), true);
    } finally {
      await art.context.close();
    }

    const loadingArt = await withSavedPage(browser, url, raw);
    try {
      await loadingArt.page.route('**/sprites/**', (route) => route.abort());
      await loadingArt.page.route('**/cdn.jsdelivr.net/**', (route) => { setTimeout(() => void route.continue(), 2000); });
      await loadingArt.page.getByRole('button', { name: '继续对局' }).click();
      assert.equal(await loadingArt.page.locator('.card-art .art-fallback').first().isVisible(), true, 'Card name appears while art loads');
    } finally {
      await loadingArt.context.close();
    }

    const discard = await withSavedPage(browser, url, discardFixture());
    try {
      await discard.page.getByRole('button', { name: '继续对局' }).click();
      assert.equal(await discard.page.getByText('弃球', { exact: true }).isVisible(), true);
      const pausedBuy = discard.page.locator('.tier-row .card-actions .buy').first();
      assert.equal(await pausedBuy.isDisabled(), true);
      assert.match(await pausedBuy.getAttribute('aria-label') ?? '', /请先完成当前阶段/);
      await discard.page.getByRole('button', { name: '增加弃置红球' }).click();
      assert.equal(await discard.page.getByRole('button', { name: '确认弃牌' }).isEnabled(), true);
      await discard.page.getByRole('button', { name: '确认弃牌' }).click();
      assert.equal((await saveSnapshot(discard.page)).writes, 1);
    } finally {
      await discard.context.close();
    }

    const evolve = await withSavedPage(browser, url, evolveFixture());
    try {
      await evolve.page.getByRole('button', { name: '继续对局' }).click();
      assert.equal(await evolve.page.getByText('进化或结束', { exact: true }).isVisible(), true);
      assert.equal(await evolve.page.getByRole('button', { name: /→/ }).count() > 0, true);
      await evolve.page.getByRole('button', { name: /→/ }).first().click();
      assert.equal((await saveSnapshot(evolve.page)).writes, 1);
    } finally {
      await evolve.context.close();
    }

    const endTurn = await withSavedPage(browser, url, encode(Object.assign(gameFixture(), { awaitingEvolve: true })));
    try {
      await endTurn.page.getByRole('button', { name: '继续对局' }).click();
      await endTurn.page.getByRole('button', { name: '结束回合(不进化)' }).click();
      assert.equal((await saveSnapshot(endTurn.page)).writes, 1);
    } finally {
      await endTurn.context.close();
    }

    const take = await withSavedPage(browser, url, raw);
    try {
      await take.page.getByRole('button', { name: '继续对局' }).click();
      for (const color of ['红球', '蓝球', '黄球']) await take.page.getByRole('button', { name: new RegExp(`选择${color}`) }).click();
      await take.page.getByRole('button', { name: '确认取 3 种' }).click();
      await take.page.getByText('电脑行动中', { exact: true }).waitFor();
      await take.page.locator('.turn-info').filter({ hasText: '存档者' }).waitFor({ timeout: 10000 });
      await take.page.reload();
      await take.page.getByRole('button', { name: '继续对局' }).click();
      assert.equal(await take.page.locator('.player-name').filter({ hasText: '存档者' }).count(), 1);
    } finally {
      await take.context.close();
    }

    const takeTwo = await withSavedPage(browser, url, raw);
    try {
      await takeTwo.page.getByRole('button', { name: '继续对局' }).click();
      await takeTwo.page.getByRole('button', { name: '取 2 个红球' }).click();
      assert.equal((await saveSnapshot(takeTwo.page)).writes, 1);
    } finally {
      await takeTwo.context.close();
    }

    for (const colors of [['红球'], ['红球', '蓝球']]) {
      const partialTake = await withSavedPage(browser, url, raw);
      try {
        await partialTake.page.getByRole('button', { name: '继续对局' }).click();
        for (const color of colors) await partialTake.page.getByRole('button', { name: new RegExp(`选择${color}`) }).click();
        await partialTake.page.getByRole('button', { name: `确认取 ${colors.length} 种` }).click();
        assert.equal((await saveSnapshot(partialTake.page)).writes, 1, `Take ${colors.length} colors`);
      } finally {
        await partialTake.context.close();
      }
    }

    for (const [action, selector] of [
      ['face-up reserve', '.tier-row .card-actions .reserve'],
      ['blind reserve', '.deck-pile .btn'],
    ] as const) {
      const reserve = await withSavedPage(browser, url, raw);
      try {
        await reserve.page.getByRole('button', { name: '继续对局' }).click();
        await reserve.page.locator(selector).first().click();
        assert.equal(await reserve.page.locator('.reserve-area .card').count(), 1, action);
      } finally {
        await reserve.context.close();
      }
    }

    for (const [action, selector, fixture] of [
      ['board buy', '.tier-row .card-actions .buy', richFixture(false)],
      ['rare buy', '.special-cell.rare .card-actions .buy', richFixture(false)],
      ['legendary buy', '.special-cell.legendary .card-actions .buy', richFixture(false)],
      ['reserved buy', '.reserve-area .card-actions .buy', richFixture(true)],
    ] as const) {
      const buy = await withSavedPage(browser, url, fixture);
      try {
        await buy.page.getByRole('button', { name: '继续对局' }).click();
        const button = buy.page.locator(selector).first();
        assert.equal(await button.isEnabled(), true, action);
        await button.click();
        assert.equal((await saveSnapshot(buy.page)).writes, 1, action);
      } finally {
        await buy.context.close();
      }
    }

    const online = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const onlineErrors: string[] = [];
    online.on('pageerror', (error) => onlineErrors.push(error.message));
    online.on('console', (message) => { if (message.type() === 'error') onlineErrors.push(`${message.text()} @ ${message.location().url}`); });
    try {
      await online.goto(`${url}tests/online-harness.html`);
      assert.equal(await online.locator('.turnbar').count(), 1, 'Online-style GameTable renders');
      assert.equal(await online.locator('.tier-row').count(), 3);
      assert.equal(await online.locator('.card-actions .reserve').count() > 0, true);
      assert.equal(await online.locator('.bank-section').isVisible(), true);
      assert.equal(await online.locator('.players .player-panel').count(), 2);
      assert.equal(await online.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await online.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('.card-art img')].every((img) => img.complete), null, { timeout: 20000 });
      assert.deepEqual(onlineErrors, []);
      if (process.env.SOLO_SCREENSHOT_DIR) await online.screenshot({ path: `${process.env.SOLO_SCREENSHOT_DIR}/online-1440x900.png`, fullPage: true });
    } finally {
      await online.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
