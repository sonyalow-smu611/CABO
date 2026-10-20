export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Card animations run at this fraction of their natural speed, so every move on the table can be followed. */
const PACE = 0.3;
/** Cards gliding between hands and piles go slower still, so you can follow where each one goes. */
const MOVE_PACE = PACE * 0.75;
/** A natural duration (seconds) at the table's pace. */
export const paced = (seconds: number) => seconds / PACE;
/** A natural duration (seconds) for a card moving across the table. */
export const movePaced = (seconds: number) => seconds / MOVE_PACE;
/** Memory mode: a face-down card you've seen shows its value this long, then turns back over. */
export const MEMORY_MS = 2500;
/** At game over the revealed table stays up this long before the summary panel replaces it. */
export const REVEAL_MS = 3000;
/** The Cabo call fills the screen this long, so everyone knows the final round has started. */
export const CABO_MS = 4000;
/** A power (peek, spy, swap) is announced by the player's seat, and its cards highlighted, this long. */
export const ACTION_MS = 3500;
/** A failed match outlines its cards in red this long. */
export const FAIL_MS = 1800;
