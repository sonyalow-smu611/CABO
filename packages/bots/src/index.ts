import { powerOf, rankOf } from '@cabo/engine';
import type { Action, PlayerId, Power, View, ViewSlot } from '@cabo/engine';

/** A bot sees exactly what a human in its seat sees: its View (which already shows every card it knows) and the legal actions. */
export interface Bot {
  name: string;
  choose(view: View, legal: Action[], rng: () => number): Action;
}

const AVG = 6.5; // mean card value of the 52-card deck
const pick = <T>(xs: T[], rng: () => number): T => xs[Math.floor(rng() * xs.length)]!;
/** Known cards grouped by rank (black and red 13 together). */
const byRank = (cs: ViewSlot[]) => {
  const m = new Map<number, ViewSlot[]>();
  for (const c of cs) if (c.card !== null) m.set(rankOf(c.card), [...(m.get(rankOf(c.card)) ?? []), c]);
  return m;
};

/** Uniform over the legal list, plus blind legal-shaped match attempts so stress runs exercise matching. */
export const random: Bot = {
  name: 'random',
  choose(v, legal, rng) {
    const mine = v.hands[v.me]!;
    if (v.phase === 'drawn' && !v.matchFailed && mine.length > 0 && rng() < 0.2) {
      const own = pick(mine, rng);
      const other = pick(v.players.filter((q) => q !== v.me), rng);
      const partners = [...mine.filter((c) => c !== own), ...v.hands[other]!];
      return { type: 'match', player: v.me, uids: [own.uid, pick(partners, rng).uid] };
    }
    return pick(legal, rng);
  },
};

export interface Style {
  caboAt: number;   // call Cabo when the estimated hand total is at most this
  minRound: number; // ...and at least this round has been reached
  forget: number;   // chance, per decision, of losing sight of each face-down card it has seen
}

/**
 * Drop some face-down knowledge from the bot's copy of its view: a weaker memory without a separate tracker.
 * ponytail: forgetting is re-rolled every decision, so a card can be "remembered" again next turn; a per-card
 * forgetting time would be steadier if presets ever need finer tuning.
 */
const forgetSome = (v: View, rate: number, rng: () => number): View => ({
  ...v,
  hands: Object.fromEntries(Object.entries(v.hands).map(([q, h]) =>
    [q, h.map((c) => (c.card !== null && !c.faceUp && rng() < rate ? { ...c, card: null } : c))])),
});

/** Keeps low cards it knows about, matches only when sure, calls Cabo on a low estimate. Tuned by a Style. */
export const thinker = (name: string, style: Style): Bot => ({
  name,
  choose(seen, legal, rng) {
    const v = style.forget ? forgetSome(seen, style.forget, rng) : seen;
    const me = v.me;
    const mine = v.hands[me]!;
    const est = (s: ViewSlot) => s.card ?? AVG;
    const find = (t: Action['type']) => legal.find((a) => a.type === t);
    const unknown = (s: ViewSlot) => s.card === null;
    const use = (uids: number[]): Action => ({ type: 'usePower', player: me, uids });
    /** The useful target for a power, or undefined to just discard. */
    const usePower = (pw: Power): Action | undefined => {
      if (pw === 'peek') { const u = mine.filter(unknown); return u.length ? use([pick(u, rng).uid]) : undefined; }
      const theirs = v.players.filter((q) => q !== me).flatMap((q) => v.hands[q]!);
      if (pw === 'spy') { const u = theirs.filter(unknown); return u.length ? use([pick(u, rng).uid]) : undefined; }
      // blind swap: only worth it if we know one of our own cards is high; hand it to a random opponent card
      const bad = mine.filter((s) => (s.card ?? 0) >= 8).sort((a, b) => est(b) - est(a))[0];
      return bad && theirs.length ? use([bad.uid, pick(theirs, rng).uid]) : undefined;
    };

    switch (v.phase) {
      case 'start': {
        const total = mine.reduce((n, s) => n + est(s), 0);
        if (!v.caller && v.round >= style.minRound && total <= style.caboAt) return find('callCabo')!;
        const take = find('takeDiscard');
        if (take && v.discardTop !== null && v.discardTop <= 3) return take;
        return find('drawPile') ?? take!;
      }

      case 'drawn': {
        const d = v.drawn!;
        // Only sure matches (no penalty risk), and never the held card.
        const match = (cs: ViewSlot[]): Action => ({ type: 'match', player: me, uids: cs.map((c) => c.uid) });
        const own = byRank(mine);
        // With another player: drops our card and dumps the held card on them, always a gain.
        for (const q of v.players) if (q !== me) {
          const theirs = byRank(v.hands[q]!);
          for (const [r, cs] of own) if (theirs.has(r)) return match([...cs, ...theirs.get(r)!]);
        }
        // Own pair: we keep the held card, so only worth it when it's worth less than what we drop.
        for (const cs of own.values())
          if (cs.length >= 2 && (d.card ?? AVG) < cs.reduce((n, c) => n + c.card!, 0)) return match(cs);

        const pw = d.from === 'pile' && d.card !== null ? powerOf(d.card) : null;
        if (pw) return usePower(pw) ?? find('discardDrawn')!; // a high card is never worth keeping; use its power if it helps
        const worst = mine.reduce((a, b) => (est(b) > est(a) ? b : a));
        if (d.from === 'discard' || (d.card !== null && d.card < est(worst) - 0.5))
          return { type: 'keepDrawn', player: me, replace: worst.uid };
        return find('discardDrawn') ?? { type: 'keepDrawn', player: me, replace: worst.uid };
      }

    }
    throw new Error(`no move for phase ${v.phase}`);
  },
});

export const PRESETS = {
  steady: thinker('steady', { caboAt: 9, minRound: 3, forget: 0 }),
  cautious: thinker('cautious', { caboAt: 5, minRound: 3, forget: 0 }),
  bold: thinker('bold', { caboAt: 14, minRound: 2, forget: 0 }),
  forgetful: thinker('forgetful', { caboAt: 9, minRound: 3, forget: 0.35 }),
} satisfies Record<string, Bot>;
export const steady = PRESETS.steady;

export type { PlayerId };
