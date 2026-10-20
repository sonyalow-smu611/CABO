import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Update } from '../src/rooms.ts';
import { close, table } from './clients.ts';
import type { Player } from './clients.ts';

test('result: at game over every player is sent the game summary with names; only the owner can deal the next game', { timeout: 10000 }, async () => {
  const t = await table(3);
  try {
    for (const p of t.ps) p.auto = true;
    await t.ps[0]!.call('start');
    const ends = await Promise.all(t.ps.map((p) => p.until((u) => u.summary)));
    for (const u of ends) {
      const s = u.summary!;
      assert.equal(s.game, 1);
      assert.equal(s.players.length, 3);
      assert.deepEqual(s.players.map((x) => x.name).sort(), ['p0', 'p1', 'p2']);
      assert.ok(s.players.some((x) => x.winner));
      assert.equal(Object.keys(s.hands).length, 3);
    }
    assert.match((await t.ps[1]!.call('next')).error, /owner/);
    if (ends[0]!.summary!.sessionOver) return; // a 100+ first game is possible in principle; nothing more to deal
    assert.deepEqual(await t.ps[0]!.call('next'), { ok: true });
    const dealt = await t.ps[1]!.until((u) => u.session.gameNo === 2);
    assert.equal(dealt.summary, null); // the summary is only shown between games
  } finally { await close(t); }
});

test('new session: after the final results only the owner can start again; seats stay, scores and games won reset', { timeout: 20000 }, async () => {
  const t = await table(3, { botDelayMs: 0 });
  try {
    const [owner, other] = t.ps as [Player, Player, Player];
    for (const p of t.ps) p.auto = true;
    // the owner deals every next game until the session ends
    owner.c.on('update', (u: Update) => { if (u.summary && !u.summary.sessionOver) setImmediate(() => owner.call('next')); });
    await owner.call('addBot', { bot: 'steady' }); // bots keep their seat into the new session too
    await owner.call('start');
    const final = await other.until((u) => u.summary?.sessionOver);
    assert.ok(final.summary!.players.some((x) => x.sessionWinner));
    const seats = final.seats;
    assert.match((await other.call('newSession')).error, /owner/);
    assert.deepEqual(await owner.call('newSession'), { ok: true });
    const fresh = await other.until((u) => u.view && !u.session.over && u.session.gameNo === 1);
    assert.deepEqual(fresh.seats, seats);
    assert.equal(fresh.summary, null);
    assert.ok(Object.values(fresh.session.totals).every((n) => n === 0));
    const first = await other.until((u) => u.summary?.game === 1);
    for (const x of first.summary!.players) {
      assert.equal(x.total, x.gained); // nothing carried over from the last session
      assert.equal(x.gamesWon, x.winner ? 1 : 0);
    }
  } finally { await close(t); }
});

const canCabo = (u: Update) => u.legal.some((a) => a.type === 'callCabo');

test('cabo: offered only to the active player before they draw, and to nobody once someone has called', { timeout: 10000 }, async () => {
  const t = await table(3);
  try {
    const [a, b, c] = t.ps as [Player, Player, Player];
    await a.call('start');
    const start = await a.until((u) => u.view);
    assert.equal(start.view!.active, a.seat);
    assert.ok(canCabo(start));
    assert.ok(!canCabo(await b.until((u) => u.view)));
    await a.call('act', { type: 'drawPile' });
    assert.ok(!canCabo(await a.until((u) => u.view!.phase === 'drawn')));
    await a.call('act', { type: 'discardDrawn' });
    const bTurn = await b.until((u) => u.view!.active === b.seat);
    assert.ok(canCabo(bTurn));
    await b.call('act', { type: 'callCabo' });
    assert.ok(!canCabo(await c.until((u) => u.view!.caller === b.seat && u.view!.active === c.seat)));
  } finally { await close(t); }
});

test('end game: only the owner can end the session mid-game; everyone gets the final results with totals as they stood', { timeout: 10000 }, async () => {
  const t = await table(3, { botDelayMs: 0 });
  try {
    const [owner, other] = t.ps as [Player, Player, Player];
    for (const p of t.ps) p.auto = true;
    owner.c.on('update', (u: Update) => { if (u.summary?.game === 1 && !u.summary.sessionOver) setImmediate(() => owner.call('next')); });
    await owner.call('start');
    const game2 = await other.until((u) => u.session.gameNo === 2 && u.view);
    for (const p of t.ps) p.auto = false; // keep game 2 running until the owner ends it
    const totals = game2.session.totals;
    assert.match((await other.call('endGame')).error, /owner/);
    assert.deepEqual(await owner.call('endGame'), { ok: true });
    for (const p of t.ps) {
      const end = await p.until((u) => u.summary?.sessionOver);
      assert.equal(end.view, null);
      assert.deepEqual(Object.fromEntries(end.summary!.players.map((x) => [x.seat, x.total])), totals);
      const best = Math.min(...Object.values(totals));
      for (const x of end.summary!.players) assert.equal(x.sessionWinner, x.total === best);
    }
    assert.match((await owner.call('act', { type: 'drawPile' })).error, /no game/);
    assert.deepEqual(await owner.call('newSession'), { ok: true }); // the final results lead on to a new session as usual
  } finally { await close(t); }
});

const vacant = (u: Update) => u.seats.filter((x) => x.status === 'vacant').map((x) => x.id);

test('pause: leaving empties the seat and pauses the game; every move is rejected until the player is back with their token', { timeout: 10000 }, async () => {
  const t = await table(3);
  const back = t.newPlayer();
  try {
    const [a, b, c] = t.ps as [Player, Player, Player];
    await a.call('start');
    const before = await b.until((u) => u.view);
    assert.deepEqual(await b.call('leave'), { ok: true });
    for (const p of [a, c]) {
      const u = await p.until((u) => u.paused);
      assert.deepEqual(vacant(u), [b.seat]);
    }
    assert.deepEqual(a.last!.legal, []); // no move is offered while paused, Cabo included
    assert.match((await a.call('act', { type: 'drawPile' })).error, /paused/); // a's turn, but the table is incomplete
    assert.match((await b.call('act', { type: 'drawPile' })).error, /not in a room/); // b has left
    assert.deepEqual(await back.call('resume', { token: b.token }), { roomId: t.roomId, seat: b.seat, token: b.token });
    const resumed = await a.until((u) => !u.paused);
    assert.deepEqual(vacant(resumed), []);
    assert.deepEqual((await back.until((u) => u.view)).view!.hands, before.view!.hands);
    assert.deepEqual(await a.call('act', { type: 'drawPile' }), { ok: true });
  } finally { await close(t, [back]); }
});

test('pause: a dropped connection is treated like Leave', { timeout: 10000 }, async () => {
  const t = await table(3);
  try {
    const [a, , c] = t.ps as [Player, Player, Player];
    await a.call('start');
    await c.until((u) => u.view);
    c.c.close();
    assert.deepEqual(vacant(await a.until((u) => u.paused)), [c.seat]);
  } finally { await close(t); }
});

test('pause: a newcomer joining by code takes the empty seat with its hand and knowledge; the first claim wins', { timeout: 10000 }, async () => {
  const t = await table(3);
  const [x, y, old] = [t.newPlayer(), t.newPlayer(), t.newPlayer()];
  try {
    const [a, b] = t.ps as [Player, Player, Player];
    await a.call('start');
    const before = await b.until((u) => u.view);
    await b.call('leave');
    await a.until((u) => u.paused);
    const tries = await Promise.all([x.call('join', { roomId: t.roomId, name: 'x' }), y.call('join', { roomId: t.roomId, name: 'y' })]);
    // Both asked at once: whoever got in first has the seat, the other finds no seat left.
    const won = tries.findIndex((r) => r.seat);
    assert.equal(tries[won]!.seat, b.seat);
    assert.match(tries[1 - won]!.error, /started/);
    const u = await [x, y][won]!.until((u) => u.view && !u.paused);
    assert.deepEqual(u.view!.hands, before.view!.hands); // what the seat had seen comes with it
    assert.equal(u.seats.find((s) => s.id === b.seat)!.name, ['x', 'y'][won]);
    assert.match((await old.call('resume', { token: b.token })).error, /expired|unknown/); // the seat is someone else's now
  } finally { await close(t, [x, y, old]); }
});

test('owner: when the owner leaves, the next human clockwise (skipping bots) becomes owner', { timeout: 10000 }, async () => {
  const t = await table(2);
  try {
    const [a, b] = t.ps as [Player, Player];
    await a.call('addBot', { bot: 'steady' }); // seat 2 is a bot, seat 1 is b
    await a.call('start');
    assert.equal((await b.until((u) => u.view)).owner, a.seat);
    await a.call('leave');
    const u = await b.until((u) => u.paused);
    assert.equal(u.owner, b.seat);
    assert.deepEqual(await b.call('endGame'), { ok: true }); // b can now decide for the table
  } finally { await close(t); }
});

test('owner choice: replace the empty seat with a bot, which then plays it; the leaver cannot take it back', { timeout: 10000 }, async () => {
  const t = await table(3, { botDelayMs: 0 });
  const old = t.newPlayer();
  try {
    const [a, b, c] = t.ps as [Player, Player, Player];
    await a.call('start');
    await b.until((u) => u.view);
    await b.call('leave');
    await a.until((u) => u.paused);
    assert.match((await c.call('replaceWithBot', { seat: b.seat, bot: 'steady' })).error, /owner/);
    assert.match((await a.call('replaceWithBot', { seat: c.seat, bot: 'steady' })).error, /vacant/); // only an empty seat
    assert.deepEqual(await a.call('replaceWithBot', { seat: b.seat, bot: 'steady' }), { ok: true });
    const u = await c.until((u) => !u.paused);
    assert.equal(u.seats.find((x) => x.id === b.seat)!.bot, 'steady');
    // a plays, then the bot in b's seat takes its turn on its own, and c is up
    await a.call('act', { type: 'drawPile' });
    await a.call('act', { type: 'discardDrawn' });
    assert.equal((await c.until((u) => u.view!.active === c.seat)).view!.turn, 2);
    assert.match((await old.call('resume', { token: b.token })).error, /expired|unknown/);
  } finally { await close(t, [old]); }
});

test('owner choice: End game while paused ends the session for everyone, same as the End game button', { timeout: 10000 }, async () => {
  const t = await table(3);
  try {
    const [a, b, c] = t.ps as [Player, Player, Player];
    await a.call('start');
    await b.until((u) => u.view);
    await b.call('leave');
    await a.until((u) => u.paused);
    assert.match((await c.call('endGame')).error, /owner/);
    assert.deepEqual(await a.call('endGame'), { ok: true });
    for (const p of [a, c]) assert.ok((await p.until((u) => u.summary?.sessionOver)).summary!.players.every((x) => x.total === 0));
  } finally { await close(t); }
});
