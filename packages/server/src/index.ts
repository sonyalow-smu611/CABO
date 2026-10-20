import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { BOT_DELAY_MS, Room } from './rooms.ts';
import type { BotName } from './rooms.ts';

/** Where rooms are kept between restarts. Without one, rooms live only in this process. */
export interface Store {
  save(roomId: string, json: string): Promise<void>;
  loadAll(): Promise<[string, string][]>;
}

/** Upstash Redis over its REST API (plain fetch, no client library). Rooms expire a day after their last change. */
export function upstash(url: string, token: string): Store {
  const cmd = async (...args: string[]) => {
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(args) });
    if (!res.ok) throw new Error(`upstash ${args[0]} failed: ${res.status}`);
    return ((await res.json()) as { result: unknown }).result;
  };
  return {
    save: async (id, json) => { await cmd('SET', `cabo:room:${id}`, json, 'EX', '86400'); },
    loadAll: async () => {
      // ponytail: KEYS scans everything; fine for a hobby database, switch to SCAN if it ever holds many keys.
      const keys = (await cmd('KEYS', 'cabo:room:*')) as string[];
      if (!keys.length) return [];
      const vals = (await cmd('MGET', ...keys)) as (string | null)[];
      return keys.flatMap((k, i) => (vals[i] ? [[k.slice('cabo:room:'.length), vals[i]!] as [string, string]] : []));
    },
  };
}

const cleanName = (name: unknown, fallback: string) => String(name ?? '').trim().slice(0, 20) || fallback;

/** Start the socket server. Every event takes (body, ack) and acks {ok}, {roomId, seat, token} or {error}. */
export async function serve(port: number, store?: Store, opts: { botDelayMs?: number } = {}): Promise<HttpServer> {
  // ponytail: rooms are never removed from memory (only expired in Redis); add an idle sweep if a server runs for weeks.
  const rooms = new Map<string, Room>();
  /** Secret per seat, kept by the browser, so a refresh or a new connection can take the seat back. */
  const tokens = new Map<string, { roomId: string; seat: string }>();
  /** The one connection currently holding each `roomId:seat`; only its leaving or dropping empties the seat. */
  const holders = new Map<string, string>();
  const revoke = (roomId: string, seat: string) => {
    for (const [tok, t] of tokens) if (t.roomId === roomId && t.seat === seat) tokens.delete(tok);
  };
  const http = createServer((_req, res) => res.end('ok')); // health check
  const io = new Server(http, { cors: { origin: process.env.WEB_ORIGIN ?? '*' } });

  // Every room change reaches its humans through send(); batch those into one save per room per tick.
  const dirty = new Set<string>();
  const save = (roomId: string) => {
    if (!store || dirty.has(roomId)) return;
    dirty.add(roomId);
    queueMicrotask(() => {
      dirty.delete(roomId);
      const r = rooms.get(roomId)!;
      const seatTokens = [...tokens].filter(([, t]) => t.roomId === roomId).map(([tok, t]) => [tok, t.seat]);
      store.save(roomId, JSON.stringify({ room: r.toJSON(), tokens: seatTokens }))
        .catch((e) => console.error('save failed', roomId, e)); // keep playing; the next change retries
    });
  };
  const sender = (roomId: string) => (to: string, u: unknown) => { io.to(`${roomId}:${to}`).emit('update', u); save(roomId); };

  for (const [roomId, json] of (await store?.loadAll()) ?? []) {
    const { room, tokens: seatTokens } = JSON.parse(json) as { room: ReturnType<Room['toJSON']>; tokens: [string, string][] };
    const r = Room.restore(room, sender(roomId));
    rooms.set(roomId, r);
    for (const [tok, seat] of seatTokens) tokens.set(tok, { roomId, seat });
    r.sync(); // nobody is connected yet, but this restarts a pending bot turn
  }

  const newCode = () => {
    let code: string;
    do code = Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
    while (rooms.has(code));
    return code;
  };

  io.on('connection', (socket) => {
    let room: Room | null = null, roomId = '', seat = '';
    const bind = (r: Room, id: string, s: string, token: string) => {
      room = r; roomId = id; seat = s;
      socket.join(`${roomId}:${seat}`);
      holders.set(`${roomId}:${seat}`, socket.id);
      r.sync(); // join() broadcast before this socket was subscribed; a resumed seat needs the current state
      return { roomId, seat, token };
    };
    const sit = (r: Room, roomId: string, name: string) => {
      const token = randomUUID();
      const s = r.join(name);
      revoke(roomId, s); // a newcomer in a vacant seat: whoever had it before can no longer take it back
      tokens.set(token, { roomId, seat: s });
      return bind(r, roomId, s, token);
    };
    /** Give up this connection's seat (Leave) or let it go vacant (a drop). */
    const unbind = (remove: boolean) => {
      if (!room || holders.get(`${roomId}:${seat}`) !== socket.id) return;
      holders.delete(`${roomId}:${seat}`);
      socket.leave(`${roomId}:${seat}`);
      const r = room;
      room = null;
      if (remove && !r.session) revoke(roomId, seat); // a lobby seat given up is gone
      r.leave(seat, { remove });
    };
    const owner = () => {
      if (!room) throw new Error('not in a room');
      if (seat !== room.owner) throw new Error('only the room owner can do that');
      return room;
    };
    const on = (ev: string, fn: (body: any) => object | void) =>
      socket.on(ev, (body: any, ack?: (r: object) => void) => {
        try { ack?.(fn(body ?? {}) ?? { ok: true }); } catch (e) { ack?.({ error: (e as Error).message }); }
      });

    on('create', ({ name }) => {
      const roomId = newCode();
      const r = new Room(sender(roomId), { botDelayMs: opts.botDelayMs ?? BOT_DELAY_MS, seed: Date.now() });
      rooms.set(roomId, r);
      return sit(r, roomId, cleanName(name, 'host'));
    });
    on('join', ({ roomId, name }) => {
      const id = String(roomId).toUpperCase(), r = rooms.get(id);
      if (!r) throw new Error('no such room');
      return sit(r, id, cleanName(name, 'player'));
    });
    on('resume', ({ token }) => {
      const t = tokens.get(String(token)), r = t && rooms.get(t.roomId);
      if (!t || !r) throw new Error('unknown or expired seat');
      r.occupy(t.seat);
      return bind(r, t.roomId, t.seat, String(token));
    });
    on('addBot', ({ bot }) => { const r = owner(); r.join(`${String(bot)} bot ${r.seats.length}`, bot as BotName); });
    on('start', () => owner().start());
    on('next', () => owner().next());
    on('newSession', () => owner().newSession());
    on('endGame', () => owner().end());
    on('replaceWithBot', ({ seat: s, bot }) => {
      const r = owner();
      r.replaceWithBot(String(s), bot as BotName);
      revoke(roomId, String(s)); // the bot keeps the seat until the session ends
    });
    on('leave', () => unbind(true));
    socket.on('disconnect', () => unbind(false));
    on('act', (action) => {
      if (!room) throw new Error('not in a room');
      room.act(seat, action); // the player is always the connection's seat
    });
  });

  return new Promise((res) => http.listen(port, () => res(http)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3001);
  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = process.env;
  serve(port, url && token ? upstash(url, token) : undefined)
    .then(() => console.log(`cabo server on :${port}${url ? ' (rooms kept in Upstash)' : ' (rooms in memory only)'}`));
}
