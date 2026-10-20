import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rankOf } from '@cabo/engine';
import type { Action, View } from '@cabo/engine';
import type { Update } from '../src/rooms.ts';
import { close, table } from './clients.ts';
import type { Player } from './clients.ts';

/**
 * The owner plays its own turns by script (draw from the pile, then `afterDraw` decides, or a plain discard/keep),
 * deals each next game, and the others play like bots, until `afterDraw` makes its move.
 */
function drive(owner: Player, afterDraw: (v: View) => Action | null) {
  owner.c.on('update', (u: Update) => {
    if (u.summary) return setImmediate(() => owner.call(u.summary!.sessionOver ? 'newSession' : 'next'));
    if (!u.legal.length) return;
    const v = u.view!, me = v.me, mine = v.hands[me]!;
    let a: Action | null;
    if (v.phase === 'start') a = u.legal.find((x) => x.type === 'drawPile') ?? u.legal.find((x) => x.type === 'takeDiscard')!;
    else {
      a = v.matchFailed ? null : afterDraw(v);
      // Otherwise learn more of the hand: keep the drawn card in place of a card we have not seen, or discard it.
      const unseen = mine.find((c) => c.card === null);
      a ??= unseen ? { type: 'keepDrawn', player: me, replace: unseen.uid }
        : u.legal.find((x) => x.type === 'discardDrawn') ?? u.legal[0]!;
    }
    setImmediate(() => owner.call('act', a));
  });
}

test('match after drawing: pairing off two of your own cards discards both and puts the drawn card in your hand', { timeout: 20000 }, async () => {
  const t = await table(3, { botDelayMs: 0 });
  try {
    const [a, b, c] = t.ps as [Player, Player, Player];
    b.auto = c.auto = true;
    let tried: { pair: number[]; held: number } | null = null;
    drive(a, (v) => {
      const known = v.hands[v.me]!.filter((x) => x.card !== null);
      const pair = known.flatMap((x, i) => known.slice(i + 1).filter((y) => rankOf(y.card!) === rankOf(x.card!)).map((y) => [x, y]))[0];
      if (!pair || tried) return null;
      tried = { pair: pair.map((x) => x.uid), held: v.drawn!.uid };
      return { type: 'match', player: v.me, uids: tried.pair };
    });
    await a.call('start');
    const after = await a.until((u) => tried && u.events.some((e) => e.type === 'match' && e.player === a.seat));
    const { pair, held } = tried!;
    const hand = after.view!.hands[a.seat]!.map((x) => x.uid);
    assert.ok(after.events.some((e) => e.type === 'match' && e.ok));
    assert.ok(pair.every((uid) => !hand.includes(uid)), 'both paired cards left the hand');
    assert.ok(hand.includes(held), 'the drawn card is now in the hand');
    assert.ok(pair.includes(after.view!.discardTopUid!), 'the pair went to the discard pile');
  } finally { await close(t); }
});

test('swap power: a drawn 11 or 12 swaps two cards belonging to two other players', { timeout: 20000 }, async () => {
  const t = await table(3, { botDelayMs: 0 });
  try {
    const [a, b, c] = t.ps as [Player, Player, Player];
    b.auto = c.auto = true;
    let swapped: [number, number] | null = null;
    drive(a, (v) => {
      if (swapped || v.drawn!.from !== 'pile' || (v.drawn!.card !== 11 && v.drawn!.card !== 12)) return null;
      swapped = [v.hands[b.seat]![0]!.uid, v.hands[c.seat]![0]!.uid];
      return { type: 'usePower', player: v.me, uids: swapped };
    });
    await a.call('start');
    const after = await a.until((u) => swapped && u.events.some((e) => e.type === 'swap' && e.player === a.seat));
    const [fromB, fromC] = swapped!;
    assert.equal(after.view!.hands[b.seat]![0]!.uid, fromC);
    assert.equal(after.view!.hands[c.seat]![0]!.uid, fromB);
  } finally { await close(t); }
});
