import { io as connect } from 'socket.io-client';
import { makeRng } from '@cabo/engine';
import { steady } from '@cabo/bots';
import { serve } from '../src/index.ts';
import type { Update } from '../src/rooms.ts';

// Scripted players over a real server connection, shared by the socket tests.
/** A scripted player: a real socket, the last update it was sent, and a way to wait for a matching one. */
export function player(url: string) {
  const c = connect(url, { transports: ['websocket'], reconnection: false });
  const p = {
    c, last: null as Update | null, seat: '', token: '', auto: false,
    call: (ev: string, body: unknown = {}) => new Promise<any>((res) => c.emit(ev, body, res)),
    /** Resolves with the first update (the current one included) that passes the check. */
    until: (ok: (u: Update) => unknown) => new Promise<Update>((res) => {
      if (p.last && ok(p.last)) return res(p.last);
      const on = (u: Update) => { if (ok(u)) { c.off('update', on); res(u); } };
      c.on('update', on);
    }),
  };
  const rng = makeRng(1);
  c.on('update', (u: Update) => {
    p.last = u;
    // auto: play every turn this seat is given, the way a bot would.
    if (p.auto && u.legal.length && !u.paused) setImmediate(() => p.call('act', steady.choose(u.view!, u.legal, rng)));
  });
  return p;
}
export type Player = ReturnType<typeof player>;

/** A server and `n` humans seated in order; the first one created the room and owns it. */
export async function table(n: number, opts?: Parameters<typeof serve>[2]) {
  const server = await serve(0, undefined, opts);
  const url = `http://localhost:${(server.address() as { port: number }).port}`;
  const ps = Array.from({ length: n }, () => player(url));
  const made = await ps[0]!.call('create', { name: 'p0' });
  Object.assign(ps[0]!, { seat: made.seat, token: made.token });
  for (let i = 1; i < n; i++) {
    const j = await ps[i]!.call('join', { roomId: made.roomId, name: `p${i}` });
    Object.assign(ps[i]!, { seat: j.seat, token: j.token });
  }
  const close = async () => { for (const p of ps) p.c.close(); await new Promise((r) => server.close(r)); };
  return { server, url, roomId: made.roomId as string, ps, close, newPlayer: () => player(url) };
}
export const close = async (t: { close(): Promise<void> }, extra: Player[] = []) => { extra.forEach((p) => p.c.close()); await t.close(); };

