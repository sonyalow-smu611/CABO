import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { createServer } from 'vite';
import { serve } from '../../server/src/index.ts';

/**
 * Browser tests: the real page in headless Chrome against a real game server. Run with `npm run test:web`.
 * Chrome comes from CHROME_PATH or the usual install location; without one these tests skip.
 */
const chrome = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome']
  .find((p) => p && existsSync(p));

async function table() {
  const game = await serve(0, undefined, { botDelayMs: 200 });
  const port = (game.address() as { port: number }).port;
  const web = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    logLevel: 'silent',
    server: { port: 0, proxy: { '/socket.io': { target: `http://localhost:${port}`, ws: true } } },
  });
  await web.listen();
  const browser = await chromium.launch({ executablePath: chrome!, headless: true });
  const close = async () => { await browser.close(); await web.close(); game.closeAllConnections(); game.close(); };
  /** Another player at the table: their own browser profile, so their own seat. */
  const open = async () => {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await p.goto(web.resolvedUrls!.local[0]!);
    return p;
  };
  const page = await open().catch(async (e) => { await close(); throw e; });
  return { page, open, close };
}

/**
 * Cards with any part (the card or its face) still transformed; empty once every card has settled face-on in its
 * place. Pips and badges are positioned with the separate `translate`/`rotate` properties, so they don't count.
 */
const unsettled = (page: Page) => page.$$eval('[data-flip-id]', (cards) => cards.flatMap((card) =>
  [card, ...Array.from(card.querySelectorAll('*'))]
    .map((e) => getComputedStyle(e).transform)
    .filter((t) => t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)')
    .map((transform) => ({ card: (card as HTMLElement).dataset.flipId, transform }))));
/** Give the animations up to `ms` to finish, then report what's still mid-air. */
async function settled(page: Page, ms = 3000) {
  const until = Date.now() + ms;
  let left = await unsettled(page);
  while (left.length && Date.now() < until) { await page.waitForTimeout(100); left = await unsettled(page); }
  return left;
}

test('cards that turn over while they move end up flat: at the reveal and at the next deal', { skip: !chrome && 'no Chrome found', timeout: 60000 }, async () => {
  const { page, close } = await table();
  try {
    await page.fill('#name', 'Ana');
    await page.getByRole('button', { name: 'Create a table' }).click();
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Bot', exact: true }).first().click();
    await page.getByText('3/6').waitFor();
    await page.getByRole('button', { name: 'START GAME' }).click();

    // The creator plays first: calling Cabo ends the game after one lap, and the reveal turns every card over.
    await page.getByText('YOUR TURN').waitFor();
    await page.getByRole('button', { name: 'CABO' }).click();
    await page.getByText('See the summary').waitFor({ timeout: 15000 });
    assert.deepEqual(await settled(page), [], 'after the reveal');

    // The next deal reuses the same cards: the revealed faces turn back down as they fly to their new hands.
    await page.getByRole('button', { name: 'Next game' }).click({ timeout: 10000 });
    await page.getByText('Game 2').waitFor();
    assert.deepEqual(await settled(page), [], 'after the next deal');
  } finally {
    await close();
  }
});

test('calling Cabo puts a 4-second announcement naming the caller in front of everyone', { skip: !chrome && 'no Chrome found', timeout: 60000 }, async () => {
  const { page: ana, open, close } = await table();
  try {
    await ana.fill('#name', 'Ana');
    await ana.getByRole('button', { name: 'Create a table' }).click();
    const code = (await ana.getByLabel('Copy room code').locator('xpath=preceding-sibling::span').textContent())!.trim();
    const ben = await open();
    await ben.fill('#name', 'Ben');
    await ben.getByLabel('Room code').fill(code);
    await ben.getByRole('button', { name: 'Join' }).click();
    await ana.getByRole('button', { name: 'Bot', exact: true }).first().click();
    await ana.getByText('3/6').waitFor();
    await ana.getByRole('button', { name: 'START GAME' }).click();

    await ana.getByText('YOUR TURN').waitFor();
    await ana.getByRole('button', { name: 'CABO' }).click();
    const told = Date.now();
    await ana.getByRole('alert').getByText('You called Cabo').waitFor({ timeout: 2000 });
    await ben.getByRole('alert').getByText('Ana called Cabo').waitFor({ timeout: 2000 });

    // Still up a few seconds later, gone soon after the 4 seconds.
    const benSees = ben.getByRole('alert').getByText('Ana called Cabo');
    await ben.waitForTimeout(3000 - (Date.now() - told));
    assert.ok(await benSees.isVisible(), 'still showing at 3 seconds');
    await benSees.waitFor({ state: 'detached', timeout: 2500 });
    await ana.getByRole('alert').getByText('You called Cabo').waitFor({ state: 'detached', timeout: 1000 });
  } finally {
    await close();
  }
});
