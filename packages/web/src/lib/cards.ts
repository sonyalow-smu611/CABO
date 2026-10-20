import { powerOf } from '@cabo/engine';
import type { Card, Power, Suit } from '@cabo/engine';

/** Text variation selector: keeps ♥ and ♦ from turning into emoji on phones. */
const T = '︎';
export const SUIT_GLYPH: Record<Suit, string> = { s: `♠${T}`, h: `♥${T}`, d: `♦${T}`, c: `♣${T}` };
export const SUIT_NAME: Record<Suit, string> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
export const isRed = (s: Suit) => s === 'h' || s === 'd';

/**
 * A card's suit, for drawing it. The engine sends one with every visible card; hand-built cards without one get a
 * suit of the right colour (the black 13 is worth 0, the red 13 is worth 13).
 */
export const suitFor = (card: Card, suit: Suit | null | undefined): Suit => suit ?? (card === 13 ? 'h' : 's');

/** The index printed on the card is its value: there are no J/Q/K, and the Kings read 13 (red) or 0 (black). */
export const index = (c: Card) => String(c);

/** For the event log and screen readers. */
export const label = (c: Card | null | undefined) => (c == null ? '?' : String(c));
export const spoken = (c: Card, s: Suit | null | undefined) => `${c} of ${SUIT_NAME[suitFor(c, s)]}`;

export const POWER_LABEL: Record<Power, string> = { peek: 'Peek', spy: 'Spy', swap: 'Swap' };
export const powerHint = (c: Card): Power | null => powerOf(c);

/**
 * Pip positions for 1-10 on a 3-column, 7-row grid (col 0-2, row 0-6). Pips below the middle are drawn upside down,
 * like a printed deck. 11, 12, 13 and 0 show one large suit instead.
 */
export const PIPS: Record<number, [col: number, row: number][]> = {
  1: [[1, 3]],
  2: [[1, 0], [1, 6]],
  3: [[1, 0], [1, 3], [1, 6]],
  4: [[0, 0], [2, 0], [0, 6], [2, 6]],
  5: [[0, 0], [2, 0], [1, 3], [0, 6], [2, 6]],
  6: [[0, 0], [2, 0], [0, 3], [2, 3], [0, 6], [2, 6]],
  7: [[0, 0], [2, 0], [1, 1.5], [0, 3], [2, 3], [0, 6], [2, 6]],
  8: [[0, 0], [2, 0], [1, 1.5], [0, 3], [2, 3], [1, 4.5], [0, 6], [2, 6]],
  9: [[0, 0], [2, 0], [0, 2], [2, 2], [1, 3], [0, 4], [2, 4], [0, 6], [2, 6]],
  10: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2], [0, 4], [2, 4], [1, 5], [0, 6], [2, 6]],
};
