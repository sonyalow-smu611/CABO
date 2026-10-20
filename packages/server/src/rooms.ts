import { apply, endGame, endSession, eventsFor, legalActions, makeRng, newSession, startGame, view } from '@cabo/engine';
import type { Action, GameEvent, GameResult, PlayerId, Session, Summary, SummaryRow, View } from '@cabo/engine';
import { PRESETS, random } from '@cabo/bots';
import type { Bot } from '@cabo/bots';

export const BOTS = { ...PRESETS, random } satisfies Record<string, Bot>;
export type BotName = keyof typeof BOTS;

/** A vacant seat keeps its id, hand and total; its human left or dropped and can come back, or someone else can take it. */
export interface Seat { id: PlayerId; name: string; bot?: BotName; status: 'occupied' | 'vacant' }
/** The engine's Summary with each seat's name: what the summary and final results screens show. */
export type GameSummary = Omit<Summary, 'players'> & { players: (SummaryRow & { name: string })[] };
/** Everything one seat needs after a change. `legal` is non-empty only on your turn. */
export interface Update {
  seats: Seat[];
  owner: PlayerId;
  /** A seat is vacant mid-session: no moves until it is filled, or the owner ends the game or brings in a bot. */
  paused: boolean;
  view: View | null;
  legal: Action[];
  events: GameEvent[];
  /** Once a game is over these already include its scoring (the same endGame() that next() commits). */
  session: { totals: Record<PlayerId, number>; gameNo: number; over: boolean; winners: PlayerId[]; history: GameResult[]; halved: PlayerId[] };
  /** Set between games (after the reveal) and once the session is over; null while a game runs. */
  summary: GameSummary | null;
}
export type Send = (to: PlayerId, u: Update) => void;
/** How long a bot waits before each move: slow enough that everyone can follow what every bot does. */
export const BOT_DELAY_MS = 2000;

/**
 * One table. Every move, human or bot, goes through act(); bots run in-process after a short delay.
 * Humans are only ever sent their own view.
 */
export class Room {
  seats: Seat[] = [];
  owner: PlayerId = '';
  session: Session | null = null;
  private send: Send;
  private opts: { botDelayMs: number; seed: number };
  private rng: () => number;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(send: Send, opts = { botDelayMs: BOT_DELAY_MS, seed: Date.now() }) {
    this.send = send; this.opts = opts; this.rng = makeRng(opts.seed);
  }

  get paused() { return !!this.session && this.seats.some((x) => x.status === 'vacant'); }

  /**
   * A human takes the first vacant seat, inheriting everything about it (hand, total, what it has seen).
   * Only before the game starts are new seats added.
   */
  join(name: string, bot?: BotName): PlayerId {
    const free = bot ? undefined : this.seats.find((x) => x.status === 'vacant');
    if (free) return this.occupy(free.id, name);
    if (this.session) throw new Error('game already started');
    if (this.seats.length >= 6) throw new Error('room is full');
    if (bot && !Object.hasOwn(BOTS, bot)) throw new Error(`unknown bot ${bot}`);
    const id = `s${Math.max(-1, ...this.seats.map((x) => Number(x.id.slice(1)))) + 1}`;
    this.seats.push({ id, name, bot, status: 'occupied' });
    if (!bot && this.seat(this.owner)?.status !== 'occupied') this.owner = id;
    this.broadcast([]);
    return id;
  }

  /** Someone is back in the seat (its own player with their token, or a newcomer who gives it a new name). */
  occupy(id: PlayerId, name?: string): PlayerId {
    const seat = this.seats.find((x) => x.id === id)!;
    seat.status = 'occupied';
    if (name) seat.name = name;
    if (this.seat(this.owner)?.status !== 'occupied') this.owner = id;
    this.broadcast([]);
    return id;
  }

  /**
   * Leave or a dropped connection. Mid-session the seat goes vacant and the room pauses; in the lobby a Leave
   * gives the seat up (a dropped connection keeps it, so a refresh can take it back).
   */
  leave(id: PlayerId, opts: { remove?: boolean } = {}) {
    const seat = this.seat(id);
    if (!seat || seat.bot) return;
    if (this.owner === id) {
      // Ownership passes clockwise to the next seated human. With none, it stays put and goes to whoever sits down next.
      const i = this.seats.indexOf(seat);
      const next = [...this.seats.slice(i + 1), ...this.seats.slice(0, i)].find((x) => !x.bot && x.status === 'occupied');
      if (next) this.owner = next.id;
    }
    if (!this.session && opts.remove) this.seats = this.seats.filter((x) => x !== seat);
    else seat.status = 'vacant';
    this.broadcast([]);
  }

  /** The owner's other choice while paused: a bot takes the vacant seat (hand, total and knowledge) for the rest of the session. */
  replaceWithBot(id: PlayerId, bot: BotName = 'steady') {
    const seat = this.seat(id);
    if (seat?.status !== 'vacant') throw new Error('that seat is not vacant');
    if (!Object.hasOwn(BOTS, bot)) throw new Error(`unknown bot ${bot}`);
    Object.assign(seat, { bot, status: 'occupied' });
    this.broadcast([]);
  }

  start() {
    if (this.session) throw new Error('game already started');
    // Seats whose player dropped in the lobby are let go: the game starts without them.
    this.seats = this.seats.filter((x) => x.status === 'occupied');
    const s = newSession(this.seats.map((x) => x.id), this.opts.seed);
    this.deal(s);
  }

  /** The acting player always comes from the seat (the connection), never from the action body. */
  act(player: PlayerId, action: Action) {
    const g = this.session?.game;
    if (!g) throw new Error('no game running');
    if (this.paused) throw new Error('the game is paused');
    const r = apply(g, { ...action, player });
    this.session = { ...this.session!, game: r.state };
    this.broadcast(r.events);
  }

  /** Score the finished game into the session and deal the next one (or end the session). */
  next() {
    if (this.paused) throw new Error('the game is paused');
    if (!this.session?.game || this.session.game.phase !== 'over') throw new Error('game is not finished');
    if (endGame(this.session).over) throw new Error('the session is over');
    this.deal(endGame(this.session));
  }

  /** End the whole session now. A finished game is scored first; one in progress is dropped unscored. */
  end() {
    const s = this.session;
    if (!s) throw new Error('no game running');
    const done = s.game?.phase === 'over' ? endGame(s) : s;
    if (done.over) throw new Error('the session is already over');
    this.session = endSession(done);
    this.broadcast([]);
  }

  /** After the session is over: same seats and bots, totals, games won and the game counter back to zero. */
  newSession() {
    const s = this.session, done = s?.game?.phase === 'over' ? endGame(s) : s;
    if (!done?.over) throw new Error('the session is not over');
    if (this.paused) throw new Error('the game is paused');
    this.deal(newSession(this.seats.map((x) => x.id), Math.floor(this.rng() * 2 ** 31)));
  }

  private deal(s: Session) {
    const r = startGame(s);
    this.session = r.session;
    this.broadcast(r.events);
  }

  /** Everything needed to rebuild the room after a restart (plain JSON). */
  toJSON() { return { seats: this.seats, owner: this.owner, session: this.session }; }
  static restore(data: ReturnType<Room['toJSON']>, send: Send): Room {
    const r = new Room(send);
    // Rooms saved before seats had a status or an owner: everyone seated, the first seat owns.
    r.seats = data.seats.map((x) => ({ ...x, status: x.status ?? 'occupied' }));
    r.owner = data.owner ?? r.seats[0]?.id ?? '';
    r.session = data.session;
    return r;
  }

  /** Re-send everyone the current state (after a socket subscribes, or reconnects). */
  sync() { this.broadcast([]); }

  private seat(id: PlayerId) { return this.seats.find((x) => x.id === id); }

  private broadcast(events: GameEvent[]) {
    const g = this.session?.game ?? null, s = this.session;
    const scored = s && g?.phase === 'over' ? endGame(s) : s; // endGame is pure: a preview until next() commits it
    const halved = s && g?.result ? s.players.filter((p) => s.totals[p]! + g.result!.gains[p]! === 100) : [];
    const sum = g ? (g.phase === 'over' ? scored!.summary : null) : s?.summary ?? null;
    const summary = sum && { ...sum, players: sum.players.map((x) => ({ ...x, name: this.seats.find((y) => y.id === x.seat)!.name })) };
    for (const seat of this.seats) if (!seat.bot) this.send(seat.id, {
      seats: this.seats,
      owner: this.owner,
      paused: this.paused,
      view: g && view(g, seat.id),
      legal: g && !this.paused ? legalActions(g, seat.id) : [],
      events: eventsFor(events, seat.id),
      session: { totals: scored?.totals ?? {}, gameNo: s?.gameNo ?? 0, over: scored?.over ?? false, winners: scored?.winners ?? [], history: scored?.history ?? [], halved },
      summary,
    });
    this.scheduleBot();
  }

  private scheduleBot() {
    const g = this.session?.game;
    const seat = g && g.phase !== 'over' && !this.paused ? this.seats.find((x) => x.id === g.active && x.bot) : undefined;
    if (!seat || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const g = this.session?.game;
      if (!g || g.phase === 'over' || g.active !== seat.id || this.paused) return this.scheduleBot(); // things changed while it waited
      const legal = legalActions(g, seat.id);
      const pick = BOTS[seat.bot!].choose(view(g, seat.id), legal, this.rng);
      // A bot can only return what apply() accepts; anything else falls back to its first legal move.
      try { this.act(seat.id, pick); } catch { this.act(seat.id, legal[0]!); }
    }, this.opts.botDelayMs);
  }
}
