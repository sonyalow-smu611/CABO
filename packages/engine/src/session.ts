import { apply, newGame } from './game.ts';
import type { Applied, GameEvent, PlayerId, Session, SummaryRow } from './types.ts';

export function newSession(players: PlayerId[], seed: number): Session {
  const zero = () => Object.fromEntries(players.map((p) => [p, 0]));
  return { players: [...players], totals: zero(), gamesWon: zero(), gameNo: 0, seed, game: null, over: false, winners: [], history: [], summary: null };
}

/** Deal the next game. The starting seat rotates each game; the seed is derived so the whole session replays. */
export function startGame(sess: Session): { session: Session; events: GameEvent[] } {
  if (sess.over) throw new Error('session is over');
  if (sess.game && sess.game.phase !== 'over') throw new Error('previous game is still running');
  const gameNo = sess.gameNo + 1;
  const { state, events } = newGame(sess.players, sess.seed + gameNo * 7919, (gameNo - 1) % sess.players.length);
  return { session: { ...sess, gameNo, game: state }, events };
}

export const play = (sess: Session, action: Parameters<typeof apply>[1]): { session: Session; events: GameEvent[] } => {
  if (!sess.game) throw new Error('no game running');
  const r: Applied = apply(sess.game, action);
  return { session: { ...sess, game: r.state }, events: r.events };
};

/**
 * Score a finished game into the session. Points only change here. Landing on exactly 100 halves to 50;
 * the session ends when anyone goes above 100, and the lowest total(s) win.
 */
export function endGame(sess: Session): Session {
  const r = sess.game?.result;
  if (!r) throw new Error('game is not finished');
  const totals = { ...sess.totals }, gamesWon = { ...sess.gamesWon };
  for (const p of sess.players) {
    totals[p]! += r.gains[p]!;
    if (totals[p] === 100) totals[p] = 50;
  }
  for (const p of r.winners) gamesWon[p]! += 1;
  const over = sess.players.some((p) => totals[p]! > 100);
  const winners = over ? lowest(sess.players, totals) : [];
  const players = sess.players.map((p): SummaryRow => ({
    seat: p, gained: r.gains[p]!, total: totals[p]!, winner: r.winners.includes(p),
    caboPenalty: r.caller === p && !r.winners.includes(p), halved: sess.totals[p]! + r.gains[p]! === 100,
    gamesWon: gamesWon[p]!, sessionWinner: winners.includes(p),
  }));
  const hands = Object.fromEntries(sess.players.map((p) => [p, r.reveal[p]!.map(({ card, suit }) => ({ card, suit }))]));
  return { ...sess, totals, gamesWon, over, winners, history: [...sess.history, r], game: null,
    summary: { game: sess.gameNo, sessionOver: over, hands, players } };
}

/** End the session now with the totals as they stand; a game in progress is dropped unscored. */
export function endSession(sess: Session): Session {
  const winners = lowest(sess.players, sess.totals);
  const players = sess.players.map((p): SummaryRow => ({
    seat: p, gained: 0, total: sess.totals[p]!, winner: false, caboPenalty: false, halved: false,
    gamesWon: sess.gamesWon[p]!, sessionWinner: winners.includes(p),
  }));
  return { ...sess, over: true, winners, game: null, summary: { game: sess.gameNo, sessionOver: true, hands: {}, players } };
}

const lowest = (players: PlayerId[], totals: Record<PlayerId, number>) => {
  const min = Math.min(...players.map((p) => totals[p]!));
  return players.filter((p) => totals[p] === min);
};
