import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allUids, apply, buildDeck, endGame, eventsFor, legalActions, newGame, newSession, startGame, view } from '../src/index.ts';
import type { Action, GameState, Session } from '../src/index.ts';

const P = ['a', 'b', 'c', 'd'];
const fresh = (): GameState => newGame(P, 1).state;
/** Put `card` on top of the draw pile and have the active player draw it. */
const holding = (s: GameState, card: number): GameState => {
  s.pile.push({ uid: 199, card, faceUp: false, knownBy: [] });
  return apply(s, { type: 'drawPile', player: s.active }).state;
};
/** Replace a player's hand with given card values (uids 100+ so they never clash). */
const setHand = (s: GameState, p: string, cards: number[]) => {
  s.hands[p] = cards.map((card, i) => ({ uid: 100 + P.indexOf(p) * 10 + i, card, faceUp: false, knownBy: [] }));
};

test('deck is 52 cards: 2x0, 2x13, 4x each of 1-12', () => {
  const d = buildDeck();
  assert.equal(d.length, 52);
  const n = (v: number) => d.filter((c) => c === v).length;
  assert.deepEqual([n(0), n(13), ...Array.from({ length: 12 }, (_, i) => n(i + 1))], [2, 2, ...Array(12).fill(4)]);
});

test('a uid says nothing about its card, and every card has its own suit', () => {
  const all = (seed: number) => {
    const s = newGame(P, seed).state;
    return [...P.flatMap((p) => s.hands[p]!), ...s.pile, ...s.discard];
  };
  // The same uid holds different values from game to game (uids were once handed out before the shuffle).
  const at0 = new Set([1, 2, 3, 4, 5, 6].map((seed) => all(seed).find((x) => x.uid === 0)!.card));
  assert.ok(at0.size > 1);
  const faces = all(7).map((x) => `${x.card}${x.suit}`);
  assert.equal(new Set(faces).size, 52);
  assert.ok(['0s', '0c', '13h', '13d'].every((f) => faces.includes(f)));
  // Suits travel only with a visible value.
  const v = view(newGame(P, 7).state, 'a');
  for (const h of Object.values(v.hands)) for (const c of h) assert.equal(c.suit === null, c.card === null);
});

test('deal: 4 cards each, one open discard, 52 unique cards in play', () => {
  const { state } = newGame(P, 7);
  assert.ok(P.every((p) => state.hands[p]!.length === 4));
  assert.equal(state.discard.length, 1);
  assert.equal(state.pile.length, 52 - 16 - 1);
  assert.deepEqual(allUids(state), Array.from({ length: 52 }, (_, i) => i));
});

test('deal: each player already knows two of their own cards, and the starter is to play', () => {
  const { state } = newGame(P, 3, 2);
  assert.equal(state.phase, 'start');
  assert.equal(state.active, 'c');
  for (const p of P) {
    const v = view(state, p);
    assert.equal(v.hands[p]!.filter((c) => c.card !== null).length, 2);
    for (const q of P) if (q !== p) assert.ok(v.hands[q]!.every((c) => c.card === null));
  }
});

test('view hides face-down cards, shows cards taken from the discard pile', () => {
  const s = fresh();
  assert.ok(view(s, 'a').hands['b']!.every((c) => c.card === null));
  const r = apply(s, { type: 'takeDiscard', player: 'a' });
  const taken = r.state.drawn!.uid;
  const r2 = apply(r.state, { type: 'keepDrawn', player: 'a', replace: r.state.hands['a']![0]!.uid });
  assert.equal(view(r2.state, 'b').hands['a']!.find((c) => c.uid === taken)!.card, r.state.drawn!.card);
});

test('calling Cabo is the whole turn; everyone else gets one more turn, caller is frozen', () => {
  let s = fresh();
  s = apply(s, { type: 'callCabo', player: 'a' }).state;
  for (const p of ['b', 'c', 'd']) {
    assert.equal(s.active, p);
    s = apply(s, { type: 'takeDiscard', player: p }).state;
    s = apply(s, { type: 'keepDrawn', player: p, replace: s.hands[p]![0]!.uid }).state;
  }
  assert.equal(s.phase, 'over');
  assert.equal(s.result!.caller, 'a');
});

test('scoring: caller lowest adds 0; caller not lowest adds hand+10; others add hand; ties all win', () => {
  // b, c, d each swap their first card for a taken discard of 0, so their first card ends as 0
  const mk = (a: number[], b: number[], c: number[], d: number[]) => {
    let s = fresh();
    s.discard = [{ uid: 200, card: 0, faceUp: false, knownBy: [] }];
    [a, b, c, d].forEach((h, i) => setHand(s, P[i]!, h));
    s = apply(s, { type: 'callCabo', player: 'a' }).state;
    s.discard.push({ uid: 201, card: 0, faceUp: false, knownBy: [] }, { uid: 202, card: 0, faceUp: false, knownBy: [] });
    for (const p of ['b', 'c', 'd']) {
      s = apply(s, { type: 'takeDiscard', player: p }).state;
      s = apply(s, { type: 'keepDrawn', player: p, replace: s.hands[p]![0]!.uid }).state;
      s.discard.push({ uid: 300 + P.indexOf(p), card: 0, faceUp: false, knownBy: [] });
    }
    return s.result!;
  };
  // b,c,d each end with their first card replaced by a 0
  const low = mk([1, 1, 1, 1], [5, 9, 9, 9], [5, 8, 8, 8], [5, 7, 7, 7]);
  assert.deepEqual(low.winners, ['a']);
  assert.equal(low.gains['a'], 0);
  assert.equal(low.gains['b'], 27);
  const high = mk([9, 9, 9, 9], [5, 1, 1, 1], [5, 2, 2, 2], [5, 3, 3, 3]);
  assert.deepEqual(high.winners, ['b']);
  assert.equal(high.gains['a'], 46); // 36 + 10
  const tie = mk([1, 2, 3, 4], [5, 1, 2, 7], [5, 5, 5, 5], [5, 6, 6, 6]);
  assert.deepEqual(tie.winners.sort(), ['a', 'b']); // both 10
  assert.equal(tie.gains['a'], 0);   // tied-lowest caller still adds 0
  assert.equal(tie.gains['b'], 10);  // the other tied winner still adds their hand
});

test('failed match: cards stay, penalty card drawn, and you must keep the held card', () => {
  let s = fresh();
  setHand(s, 'a', [3, 4, 5, 6]); setHand(s, 'b', [3, 9, 9, 9]);
  s = holding(s, 9);
  const r = apply(s, { type: 'match', player: 'a', uids: [100, 101] });
  assert.equal(r.state.hands['a']!.length, 5);
  assert.equal(r.state.active, 'a');
  assert.ok(legalActions(r.state, 'a').every((x) => x.type === 'keepDrawn'));
  for (const bad of [{ type: 'discardDrawn' }, { type: 'usePower', uids: [110] }, { type: 'match', uids: [100, 102] }] as const)
    assert.throws(() => apply(r.state, { ...bad, player: 'a' } as Action), /illegal/, bad.type);
});

test('match, own cards only: both go to the discard pile, you keep the held card, turn ends', () => {
  let s = fresh();
  setHand(s, 'a', [3, 3, 5, 6]);
  s = holding(s, 9);
  s = apply(s, { type: 'match', player: 'a', uids: [100, 101] }).state;
  assert.deepEqual(s.hands['a']!.map((c) => c.card), [5, 6, 9]);
  assert.equal(shown(s, 'a', 199), 9);
  assert.equal(shown(s, 'b', 199), null);
  assert.equal(view(s, 'b').discardTop, 3);
  assert.equal(s.active, 'b');
});

test('emptying your hand (matching your last card with another player, giving them the held card) ends the game on 0', () => {
  let s = fresh();
  setHand(s, 'a', [4]); setHand(s, 'b', [4, 1, 1, 1]);
  s = holding(s, 9);
  const r = apply(s, { type: 'match', player: 'a', uids: [100, 110] });
  assert.equal(r.state.phase, 'over');
  assert.equal(r.state.result!.reason, 'empty');
  assert.deepEqual(r.state.result!.winners, ['a']);
});

test('swap is blind and moves the physical cards', () => {
  const s = holding(fresh(), 12);
  const a0 = s.hands['a']![0]!, b0 = s.hands['b']![0]!;
  const r = apply(s, { type: 'usePower', player: 'a', uids: [a0.uid, b0.uid] });
  assert.equal(r.state.hands['a']![0]!.uid, b0.uid);
  assert.equal(r.state.hands['b']![0]!.uid, a0.uid);
  assert.equal(r.events.filter((e) => e.secret).length, 0);
});

test('draw pile reshuffles the discard pile (minus its top) when empty', () => {
  let s = fresh();
  s.discard = [...s.pile.splice(0), ...s.discard];
  const top = s.discard.at(-1)!.uid;
  const r = apply(s, { type: 'drawPile', player: 'a' });
  assert.ok(r.events.some((e) => e.type === 'reshuffle'));
  assert.equal(r.state.discard.length, 1);
  assert.equal(r.state.discard[0]!.uid, top);
});

test('session: exactly 100 halves to 50, over 100 ends the session, lowest total wins', () => {
  const finish = (totals: Record<string, number>, gains: Record<string, number>): Session => {
    let sess = newSession(P, 1);
    sess = { ...sess, totals, gameNo: 1 };
    const g: GameState = { ...fresh(), phase: 'over', result: { reason: 'cabo', totals: gains, gains, winners: [], caller: null, reveal: Object.fromEntries(P.map((p) => [p, []])) } };
    return endGame({ ...sess, game: g });
  };
  const half = finish({ a: 90, b: 10, c: 10, d: 10 }, { a: 10, b: 5, c: 5, d: 5 });
  assert.equal(half.totals['a'], 50);
  assert.equal(half.over, false);
  const done = finish({ a: 95, b: 10, c: 40, d: 40 }, { a: 10, b: 5, c: 5, d: 5 });
  assert.equal(done.over, true);
  assert.deepEqual(done.winners, ['b']);
  assert.throws(() => endGame(done), /not finished/); // can't score twice
  assert.equal(startGame(newSession(P, 1)).session.gameNo, 1);
});

// --- what each player's view knows (knowledge travels with the card) ---
const shown = (s: GameState, me: string, uid: number) =>
  Object.values(view(s, me).hands).flat().find((c) => c.uid === uid)?.card ?? null;

test('view: a card drawn from the pile and kept is known to the drawer only', () => {
  let s = apply(fresh(), { type: 'drawPile', player: 'a' }).state;
  const { uid, card } = s.drawn!;
  s = apply(s, { type: 'keepDrawn', player: 'a', replace: s.hands['a']![0]!.uid }).state;
  assert.equal(shown(s, 'a', uid), card);
  assert.equal(shown(s, 'b', uid), null);
});

test('view: knowledge follows a card when it is swapped into another hand', () => {
  let s = apply(fresh(), { type: 'drawPile', player: 'a' }).state;
  const { uid, card } = s.drawn!;
  s = apply(s, { type: 'keepDrawn', player: 'a', replace: s.hands['a']![0]!.uid }).state; // b's turn now
  s = holding(s, 11);
  s = apply(s, { type: 'usePower', player: 'b', uids: [uid, s.hands['c']![0]!.uid] }).state;
  assert.equal(s.hands['c']![0]!.uid, uid);
  assert.equal(shown(s, 'a', uid), card);
  assert.equal(shown(s, 'c', uid), null);
});

test('view: peek and spy show the target card to the user only', () => {
  const s = holding(fresh(), 9);
  const b3 = s.hands['b']![3]!;
  const spied = apply(s, { type: 'usePower', player: 'a', uids: [b3.uid] }).state;
  assert.equal(shown(spied, 'a', b3.uid), b3.card);
  assert.equal(shown(spied, 'b', b3.uid), null);

  const s7 = holding(fresh(), 7);
  const a3 = s7.hands['a']![3]!;
  const peeked = apply(s7, { type: 'usePower', player: 'a', uids: [a3.uid] }).state;
  assert.equal(shown(peeked, 'a', a3.uid), a3.card);
  assert.equal(shown(peeked, 'c', a3.uid), null);
});

test('view: a failed match shows the tried cards to everyone; the penalty card only to its taker', () => {
  let s = fresh();
  setHand(s, 'a', [3, 4, 5, 6]);
  s = apply(s, { type: 'drawPile', player: 'a' }).state;
  s = apply(s, { type: 'match', player: 'a', uids: [100, 101] }).state;
  for (const p of P) assert.deepEqual([shown(s, p, 100), shown(s, p, 101)], [3, 4]);
  const pen = s.hands['a']![4]!;
  assert.equal(shown(s, 'a', pen.uid), pen.card);
  assert.equal(shown(s, 'b', pen.uid), null);
});

// --- abilities fire straight from the held card ---

test('ability: a freshly drawn 9 spies straight away, goes to the discard pile, and ends the turn', () => {
  const s = holding(fresh(), 9);
  const b0 = s.hands['b']![0]!;
  const r = apply(s, { type: 'usePower', player: 'a', uids: [b0.uid] }).state;
  assert.equal(shown(r, 'a', b0.uid), b0.card);
  assert.equal(view(r, 'a').discardTop, 9);
  assert.equal(r.active, 'b');
});

test('ability: only a fresh 7-12 from the draw pile has one; a plain discard skips it', () => {
  const b0 = (s: GameState) => s.hands['b']![0]!.uid;
  const low = holding(fresh(), 5);
  assert.throws(() => apply(low, { type: 'usePower', player: 'a', uids: [b0(low)] }), /power/);

  const fromDiscard = fresh();
  fromDiscard.discard.push({ uid: 198, card: 9, faceUp: false, knownBy: [] });
  const took = apply(fromDiscard, { type: 'takeDiscard', player: 'a' }).state;
  assert.throws(() => apply(took, { type: 'usePower', player: 'a', uids: [b0(took)] }), /power/);
  assert.ok(!legalActions(took, 'a').some((x) => x.type === 'usePower'));

  const high = holding(fresh(), 10);
  assert.ok(legalActions(high, 'a').some((x) => x.type === 'usePower'));
  const r = apply(high, { type: 'discardDrawn', player: 'a' }).state;
  assert.equal(r.active, 'b');
  assert.equal(r.phase, 'start');
});

test('match with another player: they receive the held card, which you know and they do not', () => {
  let s = fresh();
  setHand(s, 'a', [3, 4, 5, 6]); setHand(s, 'b', [3, 1, 1, 1]);
  s = holding(s, 9);
  s = apply(s, { type: 'match', player: 'a', uids: [100, 110] }).state;
  assert.deepEqual(s.hands['a']!.map((c) => c.card), [4, 5, 6]);
  assert.deepEqual(s.hands['b']!.map((c) => c.card), [1, 1, 1, 9]);
  assert.equal(shown(s, 'a', 199), 9);
  assert.equal(shown(s, 'b', 199), null);
  assert.equal(s.active, 'b');
});

test('match: needs 2+ cards in hands, at least one yours, at most one other player, never the held card', () => {
  const s = fresh();
  setHand(s, 'a', [3, 3, 5, 6]); setHand(s, 'b', [3, 1, 1, 1]); setHand(s, 'c', [3, 1, 1, 1]);
  const h = holding(s, 3);
  const bad = [[100], [110, 120], [100, 110, 120], [100, 199]];
  for (const uids of bad) assert.throws(() => apply(h, { type: 'match', player: 'a', uids }), /illegal/, JSON.stringify(uids));
  assert.doesNotThrow(() => apply(h, { type: 'match', player: 'a', uids: [100, 101, 110] }));
});

test('black and red 13 match each other', () => {
  let s = fresh();
  setHand(s, 'a', [0, 13, 5, 6]);
  s = holding(s, 9);
  s = apply(s, { type: 'match', player: 'a', uids: [100, 101] }).state;
  assert.deepEqual(s.hands['a']!.map((c) => c.card), [5, 6, 9]);
});
