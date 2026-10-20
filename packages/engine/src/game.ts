import type {
  Action, Applied, Card, GameEvent, GameResult, GameState, PlayerId, Power, Slot, Suit, View,
} from './types.ts';

// Deck: two 0s (black 13), 1-12 x4, two 13s (red 13) = 52 cards.
export const buildDeck = (): Card[] =>
  [0, 0, 13, 13, ...Array.from({ length: 12 }, (_, i) => i + 1).flatMap((v) => [v, v, v, v])];
/** The same deck, in the same order, with each card's suit: a real 52-card deck with no repeated face. */
const SUITS: Suit[] = ['s', 'h', 'd', 'c'];
const suitedDeck = (): { card: Card; suit: Suit }[] =>
  buildDeck().map((card, i) => ({ card, suit: card === 0 ? (i === 0 ? 's' : 'c') : card === 13 ? (i === 2 ? 'h' : 'd') : SUITS[(i - 4) % 4]! }));
export const powerOf = (c: Card): Power | null =>
  c === 7 || c === 8 ? 'peek' : c === 9 || c === 10 ? 'spy' : c === 11 || c === 12 ? 'swap' : null;
/** Matching goes by rank: a black 13 (0 points) matches a red 13. */
export const rankOf = (c: Card) => (c === 0 ? 13 : c);
export const handTotal = (h: Slot[]) => h.reduce((n, s) => n + s.card, 0);

// --- seeded RNG (mulberry32); state lives in GameState.rng so replays are exact ---
function rand(s: GameState): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(s.rng ^ (s.rng >>> 15), 1 | s.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function makeRng(seed: number): () => number {
  const s = { rng: seed | 0 } as GameState;
  return () => rand(s);
}
function shuffle<T>(a: T[], s: GameState): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function need(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(`illegal move: ${msg}`);
}

export function newGame(players: PlayerId[], seed: number, starter = 0): Applied {
  need(players.length >= 3 && players.length <= 6, '3-6 players');
  need(new Set(players).size === players.length, 'player ids must be unique');
  const s: GameState = {
    players: [...players], hands: {}, pile: [], discard: [], active: players[starter]!,
    phase: 'start', drawn: null, caller: null, matchFailed: false,
    turn: 0, rng: seed | 0, starter, result: null,
  };
  // Shuffle first, then number: a uid handed out before the shuffle would tell every client the face-down card's value.
  s.pile = shuffle(suitedDeck(), s).map(({ card, suit }, uid) => ({ uid, card, suit, faceUp: false, knownBy: [] }));
  for (const p of players) s.hands[p] = [];
  for (let r = 0; r < 4; r++) for (const p of players) s.hands[p]!.push(s.pile.pop()!);
  // The opening peek: slots are interchangeable, so each player simply knows their first two cards.
  for (const p of players) s.hands[p]!.slice(0, 2).forEach((c) => know(c, p));
  s.discard.push(s.pile.pop()!);
  return { state: s, events: [{ type: 'start', player: s.active }] };
}

const know = (c: Slot, p: PlayerId) => { if (!c.knownBy.includes(p)) c.knownBy.push(p); };
/** The discard pile is public via its top card, so stored knowledge is cleared (it would go stale after a reshuffle). */
const toDiscard = (s: GameState, { uid, card, suit }: Slot) => s.discard.push({ uid, card, suit, faceUp: false, knownBy: [] });

function locate(s: GameState, uid: number): { pid: PlayerId; i: number } | null {
  for (const pid of s.players) {
    const i = s.hands[pid]!.findIndex((x) => x.uid === uid);
    if (i >= 0) return { pid, i };
  }
  return null;
}

/** Top of the draw pile. When empty, the discard pile minus its top card is reshuffled in. */
function takeFromPile(s: GameState, ev: GameEvent[]): Slot | null {
  if (s.pile.length === 0 && s.discard.length > 1) {
    const top = s.discard.pop()!;
    s.pile = shuffle(s.discard.splice(0), s);
    s.discard.push(top);
    ev.push({ type: 'reshuffle' });
  }
  return s.pile.pop() ?? null;
}

function finish(s: GameState, ev: GameEvent[], reason: GameResult['reason']) {
  const totals: Record<PlayerId, number> = {}, gains: Record<PlayerId, number> = {}, reveal: GameResult['reveal'] = {};
  for (const p of s.players) {
    totals[p] = handTotal(s.hands[p]!);
    reveal[p] = s.hands[p]!.map(({ uid, card, suit }) => ({ uid, card, suit }));
  }
  const min = Math.min(...Object.values(totals));
  // Only the Cabo caller, and only if tied-or-lowest, adds 0; a caller who isn't lowest adds hand + 10.
  for (const p of s.players) gains[p] = p === s.caller ? (totals[p] === min ? 0 : totals[p]! + 10) : totals[p]!;
  s.phase = 'over'; s.drawn = null;
  s.result = { reason, totals, gains, winners: s.players.filter((p) => totals[p] === min), caller: s.caller, reveal };
  ev.push({ type: 'end', result: s.result });
}

function endTurn(s: GameState, ev: GameEvent[]) {
  s.drawn = null; s.matchFailed = false;
  const next = s.players[(s.players.indexOf(s.active) + 1) % s.players.length]!;
  if (s.caller && next === s.caller) return finish(s, ev, 'cabo'); // everyone else has had their last turn
  s.active = next; s.phase = 'start'; s.turn++;
}

export function apply(prev: GameState, a: Action): Applied {
  need(prev.phase !== 'over', 'game is over');
  need(a.player === prev.active, `not ${a.player}'s turn`);
  const s = structuredClone(prev), ev: GameEvent[] = [], p = a.player, hand = s.hands[p]!;

  switch (a.type) {
    case 'drawPile': {
      need(s.phase === 'start', 'not the start of your turn');
      const slot = takeFromPile(s, ev);
      need(slot, 'nothing to draw');
      s.drawn = { ...slot, from: 'pile' }; know(s.drawn, p); s.phase = 'drawn';
      ev.push({ type: 'draw', player: p, from: 'pile', uid: slot.uid, secret: { to: p, uid: slot.uid, card: slot.card } });
      break;
    }
    case 'takeDiscard': {
      need(s.phase === 'start', 'not the start of your turn');
      const top = s.discard.pop();
      need(top, 'discard pile is empty');
      s.drawn = { ...top, from: 'discard' }; s.phase = 'drawn';
      ev.push({ type: 'draw', player: p, from: 'discard', uid: top.uid, card: top.card });
      break;
    }
    case 'keepDrawn': {
      need(s.phase === 'drawn' && s.drawn, 'nothing drawn');
      const i = hand.findIndex((x) => x.uid === a.replace);
      need(i >= 0, 'replace one of your own cards');
      const out = hand[i]!, { from, ...d } = s.drawn;
      hand[i] = { ...d, faceUp: from === 'discard' }; // from the discard pile = face up for good
      toDiscard(s, out);
      ev.push({ type: 'keep', player: p, uid: d.uid, to: p, card: from === 'discard' ? d.card : undefined });
      ev.push({ type: 'discard', player: p, uid: out.uid, card: out.card, from: 'hand' });
      endTurn(s, ev);
      break;
    }
    case 'discardDrawn': {
      need(s.phase === 'drawn' && s.drawn, 'nothing drawn');
      need(s.drawn.from === 'pile', 'a card taken from the discard pile must be kept');
      need(!s.matchFailed, 'after a failed match you must keep the held card');
      const d = s.drawn;
      toDiscard(s, d);
      ev.push({ type: 'discard', player: p, uid: d.uid, card: d.card, from: 'drawn' });
      endTurn(s, ev);
      break;
    }
    case 'usePower': {
      const pw = s.phase === 'drawn' && s.drawn?.from === 'pile' ? powerOf(s.drawn.card) : null;
      need(pw, 'only a 7-12 fresh from the draw pile has a power');
      need(!s.matchFailed, 'after a failed match you must keep the held card');
      const need1 = pw !== 'swap';
      need(a.uids.length === (need1 ? 1 : 2) && new Set(a.uids).size === a.uids.length, 'wrong number of cards');
      const locs = a.uids.map((uid) => { const l = locate(s, uid); need(l, 'unknown card'); return l; });
      toDiscard(s, s.drawn!);
      ev.push({ type: 'discard', player: p, uid: s.drawn!.uid, card: s.drawn!.card, from: 'drawn' });
      if (pw === 'peek') {
        need(locs[0]!.pid === p, 'peek one of your own cards');
        const c = s.hands[p]![locs[0]!.i]!;
        know(c, p);
        ev.push({ type: 'peek', player: p, uid: c.uid, secret: { to: p, uid: c.uid, card: c.card } });
      } else if (pw === 'spy') {
        need(locs[0]!.pid !== p, 'spy on another player');
        const c = s.hands[locs[0]!.pid]![locs[0]!.i]!;
        know(c, p);
        ev.push({ type: 'spy', player: p, target: locs[0]!.pid, uid: c.uid, secret: { to: p, uid: c.uid, card: c.card } });
      } else { // blind swap of any two cards on the table
        const [x, y] = locs as [typeof locs[0], typeof locs[0]];
        const hx = s.hands[x.pid]!, hy = s.hands[y.pid]!;
        [hx[x.i], hy[y.i]] = [hy[y.i]!, hx[x.i]!];
        ev.push({ type: 'swap', player: p, uids: a.uids, owners: [x.pid, y.pid] });
      }
      endTurn(s, ev);
      break;
    }
    case 'match': {
      need(s.phase === 'drawn' && s.drawn, 'you can only match after drawing');
      need(!s.matchFailed, 'matching is locked after a failed match this turn');
      need(a.uids.length >= 2 && new Set(a.uids).size === a.uids.length, 'match two or more different cards');
      const found = a.uids.map((uid) => {
        const l = locate(s, uid);
        need(l, 'match cards in hands, not the held card');
        return { uid, owner: l.pid, card: s.hands[l.pid]![l.i]!.card };
      });
      const others = new Set(found.map((f) => f.owner).filter((o) => o !== p));
      need(found.some((f) => f.owner === p), 'a match needs one of your own cards');
      need(others.size <= 1, 'match with at most one other player');
      const cards = found.map(({ uid, card }) => ({ uid, card }));
      if (!found.every((f) => rankOf(f.card) === rankOf(found[0]!.card))) {
        // Wrong guess: everyone sees the cards, they stay put, and you take a penalty card.
        ev.push({ type: 'match', player: p, ok: false, cards });
        for (const f of found) {
          const c = s.hands[f.owner]!.find((x) => x.uid === f.uid)!;
          for (const q of s.players) know(c, q);
        }
        s.matchFailed = true;
        const pen = takeFromPile(s, ev);
        if (pen) { know(pen, p); hand.push(pen); ev.push({ type: 'penalty', player: p, uid: pen.uid, secret: { to: p, uid: pen.uid, card: pen.card } }); }
        break;
      }
      for (const f of found) {
        const h = s.hands[f.owner]!;
        toDiscard(s, h.splice(h.findIndex((x) => x.uid === f.uid), 1)[0]!);
      }
      ev.push({ type: 'match', player: p, ok: true, cards });
      // The held card goes to whoever you matched with: back to you, or to the one other player (unseen by them).
      const to = [...others][0] ?? p, { from, ...held } = s.drawn;
      s.hands[to]!.push({ ...held, faceUp: from === 'discard' });
      ev.push(to === p ? { type: 'keep', player: p, uid: held.uid, to: p, card: from === 'discard' ? held.card : undefined }
                       : { type: 'give', player: p, to, uid: held.uid });
      if (s.hands[p]!.length === 0) finish(s, ev, 'empty');
      else endTurn(s, ev);
      break;
    }
    case 'callCabo': {
      need(s.phase === 'start' && !s.caller, 'cannot call Cabo now');
      s.caller = p;
      ev.push({ type: 'cabo', player: p });
      endTurn(s, ev); // calling is the caller's whole turn and their last
      break;
    }
    default: need(false, `unknown action ${(a as { type: unknown }).type}`);
  }
  return { state: s, events: ev };
}

/** Concrete legal actions. `match` is not listed (any 2+ table cards may be tried); validate with apply(). */
export function legalActions(s: GameState, p: PlayerId): Action[] {
  if (s.phase === 'over' || p !== s.active) return [];
  const mine = s.hands[p]!.map((x) => x.uid);
  const out: Action[] = [];
  switch (s.phase) {
    case 'start':
      if (s.pile.length > 0 || s.discard.length > 1) out.push({ type: 'drawPile', player: p });
      if (s.discard.length > 0) out.push({ type: 'takeDiscard', player: p });
      if (!s.caller) out.push({ type: 'callCabo', player: p });
      break;
    case 'drawn': {
      for (const replace of mine) out.push({ type: 'keepDrawn', player: p, replace });
      if (s.matchFailed) break; // forced keep
      if (s.drawn!.from === 'pile') out.push({ type: 'discardDrawn', player: p });
      const pw = s.drawn!.from === 'pile' ? powerOf(s.drawn!.card) : null;
      const others = s.players.filter((q) => q !== p).flatMap((q) => s.hands[q]!.map((x) => x.uid));
      const all = s.players.flatMap((q) => s.hands[q]!.map((x) => x.uid));
      if (pw === 'peek') for (const u of mine) out.push({ type: 'usePower', player: p, uids: [u] });
      if (pw === 'spy') for (const u of others) out.push({ type: 'usePower', player: p, uids: [u] });
      if (pw === 'swap') for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++)
        out.push({ type: 'usePower', player: p, uids: [all[i]!, all[j]!] });
      break;
    }
  }
  return out;
}

/** The state as seen by one player: face-down cards are null, only face-up cards and public info show. */
export function view(s: GameState, me: PlayerId): View {
  const over = s.phase === 'over';
  const hands: View['hands'] = {};
  for (const q of s.players)
    hands[q] = s.hands[q]!.map((x) => {
      const seen = over || x.faceUp || x.knownBy.includes(me);
      return { uid: x.uid, card: seen ? x.card : null, suit: seen ? x.suit ?? null : null, faceUp: x.faceUp };
    });
  const top = s.discard[s.discard.length - 1];
  const held = s.drawn && (me === s.active || s.drawn.from === 'discard');
  return {
    me, players: s.players, active: s.active, phase: s.phase, caller: s.caller,
    turn: s.turn, round: Math.floor(s.turn / s.players.length) + 1, hands,
    drawn: s.drawn ? { uid: s.drawn.uid, card: held ? s.drawn.card : null, suit: held ? s.drawn.suit ?? null : null, from: s.drawn.from } : null,
    matchFailed: s.matchFailed, pileCount: s.pile.length, discardTop: top ? top.card : null, discardTopSuit: top?.suit ?? null,
    discardTopUid: top ? top.uid : null, discardCount: s.discard.length, result: s.result,
  };
}

/** Strip secrets meant for other players. Bots and clients build their memory from this. */
export const eventsFor = (events: GameEvent[], viewer: PlayerId): GameEvent[] =>
  events.map((e) => (e.secret && e.secret.to !== viewer ? { ...e, secret: undefined } : e));

/** Every physical card, once: hands + drawn + piles. Used by tests and the simulator as an invariant. */
export function allUids(s: GameState): number[] {
  return [...s.players.flatMap((p) => s.hands[p]!.map((x) => x.uid)), ...s.pile.map((x) => x.uid),
    ...s.discard.map((x) => x.uid), ...(s.drawn ? [s.drawn.uid] : [])].sort((a, b) => a - b);
}
