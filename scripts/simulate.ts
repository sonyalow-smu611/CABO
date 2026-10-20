// Bot-vs-bot soak test: every session must finish, apply() must accept every bot move, and no card may ever vanish.
import { allUids, apply, endGame, legalActions, makeRng, newSession, startGame, view } from '@cabo/engine';
import type { Action, GameState, PlayerId, Session } from '@cabo/engine';
import { PRESETS, random } from '@cabo/bots';
import type { Bot } from '@cabo/bots';

const SESSIONS = Number(process.argv[2] ?? 200);
const SEATS: PlayerId[] = ['steady', 'forgetful', 'rand1', 'bold', 'cautious', 'rand2'];
const botFor = (p: PlayerId): Bot => PRESETS[p as keyof typeof PRESETS] ?? random;
let matched = 0, failed = 0;
const ALL = Array.from({ length: 52 }, (_, i) => i);

function playGame(sess: Session, rng: () => number): Session {
  let g: GameState = sess.game!;
  for (let guard = 0; g.phase !== 'over'; guard++) {
    if (guard > 5000) throw new Error('game did not end');
    const p = g.active, legal = legalActions(g, p);
    if (!legal.length) throw new Error(`no legal action for ${p} in ${g.phase}`);
    const act: Action = botFor(p).choose(view(g, p), legal, rng);
    const r = apply(g, act); // apply() is the referee: it throws on anything illegal
    g = r.state;
    for (const e of r.events) if (e.type === 'match') e.ok ? matched++ : failed++;
    if (JSON.stringify(allUids(g)) !== JSON.stringify(ALL)) throw new Error('a card was lost or duplicated');
  }
  return { ...sess, game: g };
}

const wins: Record<string, number> = {};
let games = 0, turns = 0, halved = 0;
for (let n = 0; n < SESSIONS; n++) {
  const rng = makeRng(n + 1);
  const players = SEATS.slice(0, 3 + (n % 4)); // 3-6 players
  let sess = newSession(players, n + 1);
  while (!sess.over) {
    sess = startGame(sess).session;
    sess = playGame(sess, rng);
    turns += sess.game!.turn; games++;
    const before = sess.totals, result = sess.game!.result!;
    sess = endGame(sess);
    const sum = sess.summary!;
    halved += sum.players.filter((x) => x.halved).length;
    // The summary must agree with the rules, recomputed here from the raw game result.
    const low = Math.min(...Object.values(result.totals));
    for (const x of sum.players) {
      const raw = before[x.seat]! + x.gained;
      if (x.halved !== (raw === 100)) throw new Error(`halved flag wrong for ${x.seat}: ${before[x.seat]} + ${x.gained}`);
      if (x.total !== (raw === 100 ? 50 : raw)) throw new Error(`total wrong for ${x.seat}`);
      if (x.caboPenalty !== (result.caller === x.seat && result.totals[x.seat]! > low)) throw new Error(`caboPenalty wrong for ${x.seat}`);
      if (x.winner !== (result.totals[x.seat] === low)) throw new Error(`winner wrong for ${x.seat}`);
    }
    if (sum.game !== sess.gameNo) throw new Error('summary names the wrong game');
    if (sum.sessionOver !== sum.players.some((x) => x.total > 100)) throw new Error('sessionOver must be set exactly when someone is above 100');
    if (sess.gameNo > 200) throw new Error('session did not end');
  }
  const won = Object.values(sess.summary!.players).reduce((n, x) => n + x.gamesWon, 0);
  if (won < sess.gameNo) throw new Error(`games won (${won}) is less than games played (${sess.gameNo})`);
  const best = Math.min(...sess.summary!.players.map((x) => x.total));
  for (const x of sess.summary!.players) if (x.sessionWinner !== (x.total === best)) throw new Error(`sessionWinner wrong for ${x.seat}`);
  for (const w of sess.winners) wins[w] = (wins[w] ?? 0) + 1;
}
if (!matched || !failed) throw new Error(`matching never exercised: ${matched} ok, ${failed} failed`);
console.log(`${SESSIONS} sessions, ${games} games, avg ${(turns / games).toFixed(1)} turns/game, ${halved} halvings, ${matched} matches, ${failed} failed matches`);
console.log('session wins (ties count for each winner):', wins);
