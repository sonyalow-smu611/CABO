import assert from 'node:assert/strict';
import { test } from 'node:test';
import { io as connect } from 'socket.io-client';
import { serve } from '../src/index.ts';
import type { Update } from '../src/rooms.ts';

test('socket: create a room, add bots, start, and get your own view with your legal moves', { timeout: 5000 }, async () => {
  const server = await serve(0);
  const port = (server.address() as { port: number }).port;
  const c = connect(`http://localhost:${port}`, { transports: ['websocket'] });
  const call = (ev: string, body: unknown) => new Promise<any>((res) => c.emit(ev, body, res));
  try {
    const lobby = new Promise<Update>((res) => c.once('update', res));
    const { roomId, seat } = await call('create', { name: 'me' });
    assert.equal((await lobby).seats[0]!.id, seat); // the creator sees the lobby straight away
    assert.match(roomId, /^[A-Z]{4}$/);
    assert.deepEqual(await call('addBot', { bot: 'steady' }), { ok: true });
    await call('addBot', { bot: 'random' });
    const first = new Promise<Update>((res) => c.on('update', (u: Update) => u.view && res(u)));
    assert.deepEqual(await call('start', {}), { ok: true });
    const u = await first;
    assert.equal(u.view!.me, seat);
    assert.equal(u.seats.length, 3);
    // Acting as someone else is impossible: the player comes from the connection.
    const other = await call('act', { type: 'callCabo', player: 's1' });
    assert.ok(u.view!.active === seat ? other.ok : /turn/.test(other.error));
    assert.match((await call('join', { roomId: 'ZZZZ', name: 'x' })).error, /no such room/);
  } finally {
    c.close();
    await new Promise((r) => server.close(r));
  }
});

test('socket: a friend joins by code, drops, and a new connection resumes their seat with the token', { timeout: 5000 }, async () => {
  const server = await serve(0);
  const url = `http://localhost:${(server.address() as { port: number }).port}`;
  const clients = [0, 1, 2].map(() => connect(url, { transports: ['websocket'] }));
  const [host, friend, again] = clients as [ReturnType<typeof connect>, ReturnType<typeof connect>, ReturnType<typeof connect>];
  const call = (c: typeof host, ev: string, body: unknown) => new Promise<any>((res) => c.emit(ev, body, res));
  try {
    const { roomId } = await call(host, 'create', { name: 'host' });
    const joined = await call(friend, 'join', { roomId: roomId.toLowerCase(), name: 'friend' });
    assert.ok(joined.token);
    friend.close();
    assert.match((await call(again, 'resume', { token: 'nope' })).error, /expired|unknown/);
    const back = new Promise<Update>((res) => again.once('update', res));
    assert.deepEqual(await call(again, 'resume', { token: joined.token }), { roomId, seat: joined.seat, token: joined.token });
    assert.equal((await back).seats[1]!.name, 'friend');
  } finally {
    clients.forEach((c) => c.close());
    await new Promise((r) => server.close(r));
  }
});

test('restart: a new server on the same store restores the room, and the player resumes mid-game', { timeout: 5000 }, async () => {
  const data = new Map<string, string>();
  const store = { save: async (id: string, json: string) => { data.set(id, json); }, loadAll: async () => [...data] as [string, string][] };
  const url = (s: Awaited<ReturnType<typeof serve>>) => `http://localhost:${(s.address() as { port: number }).port}`;
  const call = (c: ReturnType<typeof connect>, ev: string, body: unknown) => new Promise<any>((res) => c.emit(ev, body, res));

  const first = await serve(0, store);
  const a = connect(url(first), { transports: ['websocket'] });
  const { roomId, token, seat } = await call(a, 'create', { name: 'me' });
  await call(a, 'addBot', { bot: 'steady' }); await call(a, 'addBot', { bot: 'random' });
  const dealt = new Promise<Update>((res) => a.on('update', (u: Update) => u.view && res(u)));
  await call(a, 'start', {});
  const before = await dealt; // game 1 starts at seat 0 (us), so no bot move is pending
  await new Promise((r) => setTimeout(r, 20));
  a.close(); await new Promise((r) => first.close(r));

  const second = await serve(0, store);
  const b = connect(url(second), { transports: ['websocket'] });
  try {
    const back = new Promise<Update>((res) => b.on('update', (u: Update) => u.view && res(u)));
    assert.deepEqual(await call(b, 'resume', { token }), { roomId, seat, token });
    const after = await back;
    assert.deepEqual(after.view!.hands, before.view!.hands);
    assert.deepEqual(after.seats, before.seats);
  } finally {
    b.close(); await new Promise((r) => second.close(r));
  }
});
