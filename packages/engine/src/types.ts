export type PlayerId = string;
/** A card's face value is also its point value: 0 (black 13), 1-12, 13 (red 13). */
export type Card = number;
/** Cosmetic only: points, rank and powers come from the value. The black 13 (0) is a spade or club, the red 13 a heart or diamond. */
export type Suit = 's' | 'h' | 'd' | 'c';
/**
 * uid is a stable id for the physical card (0-51), given out after the shuffle so it says nothing about the value.
 * knownBy = players who have seen it; it moves with the card. suit is unset on hand-built test cards.
 */
export interface Slot { uid: number; card: Card; suit?: Suit; faceUp: boolean; knownBy: PlayerId[] }
export type Phase = 'start' | 'drawn' | 'over';
export type Power = 'peek' | 'spy' | 'swap';
export type Drawn = Slot & { from: 'pile' | 'discard' };

export interface GameResult {
  reason: 'cabo' | 'empty';
  totals: Record<PlayerId, number>;   // hand totals at the reveal
  gains: Record<PlayerId, number>;    // points added to the session totals
  winners: PlayerId[];                // lowest hand total, ties all win
  caller: PlayerId | null;
  reveal: Record<PlayerId, { uid: number; card: Card; suit?: Suit }[]>;
}

export interface GameState {
  players: PlayerId[];
  hands: Record<PlayerId, Slot[]>;
  pile: Slot[];            // draw pile, top = last
  discard: Slot[];         // top = last
  active: PlayerId;        // exactly one actor at any time
  phase: Phase;
  drawn: Drawn | null;
  caller: PlayerId | null;
  matchFailed: boolean;    // after a failed match the held card must be kept
  turn: number;            // turns taken this game
  rng: number;             // seeded RNG state, so games replay exactly
  starter: number;         // seat index that plays first
  result: GameResult | null;
}

export type Action =
  | { type: 'drawPile'; player: PlayerId }
  | { type: 'takeDiscard'; player: PlayerId }
  | { type: 'keepDrawn'; player: PlayerId; replace: number }
  | { type: 'discardDrawn'; player: PlayerId }
  | { type: 'usePower'; player: PlayerId; uids: number[] } // a fresh 7-12 from the pile: discard it and use its power
  | { type: 'match'; player: PlayerId; uids: number[] } // cards in hands: 1+ of yours, at most one other player's
  | { type: 'callCabo'; player: PlayerId };

/**
 * Public log entry. `secret` is only meant for one player; eventsFor() strips it for everyone else.
 * swap: uids[i] was owned by owners[i]. spy: target's card `uid`. give: `uid` moves from player to `to`.
 */
export interface GameEvent {
  type: 'start' | 'peek' | 'spy' | 'draw' | 'discard' | 'keep' | 'swap' | 'match' | 'give'
      | 'penalty' | 'reshuffle' | 'cabo' | 'end';
  player?: PlayerId;
  uid?: number;
  uids?: number[];
  owners?: PlayerId[];
  card?: Card;
  cards?: { uid: number; card: Card }[];
  from?: string;
  to?: PlayerId;
  target?: PlayerId;
  ok?: boolean;
  secret?: { to: PlayerId; uid: number; card: Card };
  result?: GameResult;
}

/** card and suit are both null until this player may see the card. */
export interface ViewSlot { uid: number; card: Card | null; suit: Suit | null; faceUp: boolean }
/** What one player is allowed to see. Unseen cards are null; remember peeks from events. */
export interface View {
  me: PlayerId;
  players: PlayerId[];
  active: PlayerId;
  phase: Phase;
  caller: PlayerId | null;
  turn: number;
  round: number;
  hands: Record<PlayerId, ViewSlot[]>;
  drawn: { uid: number; card: Card | null; suit: Suit | null; from: 'pile' | 'discard' } | null;
  matchFailed: boolean;    // the active player failed a match this turn and must keep the held card
  pileCount: number;
  discardTop: Card | null;
  discardTopSuit: Suit | null;
  discardTopUid: number | null; // so the UI can animate a card onto the discard pile
  discardCount: number;
  result: GameResult | null;
}

export interface Applied { state: GameState; events: GameEvent[] }

/** One player's line in a Summary. */
export interface SummaryRow {
  seat: PlayerId;
  gained: number;          // points added this game (0 when the session was ended mid-game)
  total: number;           // session total after this game, already halved if it landed on 100
  winner: boolean;         // lowest hand this game, ties all win
  caboPenalty: boolean;    // called Cabo without the lowest hand: gained includes +10
  halved: boolean;         // landed on exactly 100, so the total went to 50
  gamesWon: number;        // games won this session so far
  sessionWinner: boolean;  // lowest final total, set only when the session is over
}
/** What a game (or the whole session) came to, for the summary screens. */
export interface Summary {
  game: number;
  sessionOver: boolean;
  hands: Record<PlayerId, { card: Card; suit?: Suit }[]>; // the revealed hands; empty when the session was ended mid-game
  players: SummaryRow[];
}

export interface Session {
  players: PlayerId[];
  totals: Record<PlayerId, number>;
  gamesWon: Record<PlayerId, number>;
  gameNo: number;           // games played so far in this session
  seed: number;
  game: GameState | null;
  over: boolean;
  winners: PlayerId[];      // session winners, set when over
  history: GameResult[];
  summary: Summary | null;  // the last scored game, or the session's end
}
