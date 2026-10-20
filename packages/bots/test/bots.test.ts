import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apply, legalActions, makeRng, newGame, view } from '@cabo/engine';
import type { GameState } from '@cabo/engine';
import { PRESETS, random, steady } from '../src/index.ts';

test('steady: keeps a low drawn card in place of its worst known card, using only its view', () => {
  const { state } = newGame(['a', 'b', 'c'], 1);
  let s: GameState = state;
  s.hands['a'] = [1, 2, 3, 12].map((card, i) => ({ uid: 100 + i, card, faceUp: false, knownBy: ['a'] }));
  s.pile.push({ uid: 99, card: 4, faceUp: false, knownBy: [] });
  s = apply(s, { type: 'drawPile', player: 'a' }).state;
  const act = steady.choose(view(s, 'a'), legalActions(s, 'a'), makeRng(1));
  assert.deepEqual(act, { type: 'keepDrawn', player: 'a', replace: 103 });
});

test('presets measurably differ: a perfect memory ends games with lower hands than a forgetful one, and both beat random', () => {
  const seats = { s: PRESETS.steady, f: PRESETS.forgetful, r1: random, r2: random };
  const sum: Record<string, number> = { s: 0, f: 0, r1: 0, r2: 0 };
  const rng = makeRng(42);
  for (let g = 0; g < 400; g++) {
    let s = newGame(Object.keys(seats), g, g % 4).state;
    while (s.phase !== 'over') {
      const p = s.active as keyof typeof seats;
      const legal = legalActions(s, p);
      const a = seats[p].choose(view(s, p), legal, rng);
      try { s = apply(s, a).state; } catch { s = apply(s, legal[0]!).state; } // random's blind matches can be illegal
    }
    for (const p of Object.keys(sum)) sum[p]! += s.result!.totals[p]!;
  }
  assert.ok(sum.s! < sum.f!, `steady ${sum.s} vs forgetful ${sum.f}`);
  assert.ok(sum.f! < Math.min(sum.r1!, sum.r2!), `forgetful ${sum.f} vs random ${sum.r1}/${sum.r2}`);
  assert.deepEqual(Object.keys(PRESETS).sort(), ['bold', 'cautious', 'forgetful', 'steady']);
});
