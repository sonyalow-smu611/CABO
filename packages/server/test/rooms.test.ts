import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeRng } from '@cabo/engine';
import { steady } from '@cabo/bots';
import { Room } from '../src/rooms.ts';
import type { Update } from '../src/rooms.ts';

test('room: a human (driven only by what it is sent) and two bots play a whole session', async () => {
  const rng = makeRng(7);
  let me = '', updates = 0, scored = 0;
  let before: Record<string, number> = {};
  const done = new Promise<Update>((resolve, reject) => {
    const room = new Room((to, u) => {
      try {
        if (!u.view) return u.session.over ? resolve(u) : undefined; // lobby update
        if (u.view.phase === 'over') {
          // The game-over update already carries this game's scoring: previous total + points, exactly 100 halves to 50.
          for (const id of u.view.players) {
            const sum: number = (before[id] ?? 0) + u.view.result!.gains[id]!;
            assert.equal(u.session.totals[id], sum === 100 ? 50 : sum);
            assert.equal(u.session.halved.includes(id), sum === 100);
          }
          before = u.session.totals; scored++;
          if (u.session.over) return resolve(u);
        }
        updates++;
        assert.equal(to, me);
        assert.equal(u.view.me, me); // each update is that player's own view (masking itself is engine-tested)
        if (u.view?.phase === 'over') return setImmediate(() => room.next());
        if (u.legal.length) setImmediate(() => room.act(me, steady.choose(u.view!, u.legal, rng)));
      } catch (e) { reject(e); }
    }, { botDelayMs: 0, seed: 3 });
    me = room.join('me');
    room.join('bot1', 'steady');
    room.join('bot2', 'random');
    room.start();
  });
  const end = await done;
  assert.ok(updates > 20);
  assert.ok(end.session.winners.length > 0);
  assert.equal(scored, end.session.gameNo);
});
