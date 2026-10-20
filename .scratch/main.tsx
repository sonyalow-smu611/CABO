import { StrictMode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import { powerOf } from '@cabo/engine';
import type { Action, Card, GameEvent, ViewSlot } from '@cabo/engine';
import type { BotName, Update } from '@cabo/server';

const BOT_NAMES = ['steady', 'cautious', 'bold', 'forgetful', 'random'] as const satisfies readonly BotName[];

const socket = io(import.meta.env.VITE_SERVER_URL); // unset = same origin (Vite proxies /socket.io in dev)
const call = (ev: string, body: object = {}) =>
  new Promise<{ error?: string; roomId?: string; seat?: string; token?: string }>((res) => socket.emit(ev, body, res));
/** The seat token survives refreshes. Storage can be unavailable (private mode), so every access is guarded. */
const saved = {
  get: () => { try { return localStorage.getItem('cabo-seat') ?? ''; } catch { return ''; } },
  set: (t: string) => { try { t ? localStorage.setItem('cabo-seat', t) : localStorage.removeItem('cabo-seat'); } catch { /* not kept */ } },
};

gsap.registerPlugin(Flip);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Memory mode: a face-down card you've seen shows its value this long, then turns back over. */
const MEMORY_MS = 2500;

/** A card element. data-flip-id (its uid) lets Flip glide it between hands, the held spot and the discard pile. */
function CardView({ flipId, text, hidden, className = '', ...rest }:
  { flipId: number | string; text: string; hidden: boolean; className?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const ref = useRef<HTMLButtonElement>(null), last = useRef(text);
  useLayoutEffect(() => { // turn the card over when what it shows changes
    if (last.current !== text && !reduced) gsap.fromTo(ref.current, { rotateY: 90 }, { rotateY: 0, duration: 0.25, ease: 'power1.out' });
    last.current = text;
  }, [text]);
  return <button ref={ref} data-flip-id={flipId} className={`card ${hidden ? 'hidden' : 'known'} ${className}`} {...rest}>{text}</button>;
}

const label = (c: Card | null | undefined) => (c == null ? '?' : c === 0 ? '13♠' : c === 13 ? '13♥' : String(c));

function describe(e: GameEvent, n: (id?: string) => string): string {
  const what: Record<GameEvent['type'], string> = {
    start: 'starts', end: 'Game over', reshuffle: 'Discard pile reshuffled into the draw pile',
    draw: `drew from the ${e.from === 'discard' ? 'discard pile' : 'draw pile'}`,
    discard: `discarded ${label(e.card)}`, keep: 'kept the card', peek: 'peeked at a card',
    spy: `spied on ${n(e.target)}`, swap: `swapped a card of ${n(e.owners?.[0])} with one of ${n(e.owners?.[1])}`,
    match: e.ok ? 'matched!' : 'failed a match', give: `gave the held card to ${n(e.to)}`,
    penalty: 'took a penalty card', cabo: 'called CABO',
  };
  const seen = e.secret ? ` (you saw ${label(e.secret.card)})` : '';
  return e.player && e.type !== 'end' && e.type !== 'reshuffle' ? `${n(e.player)} ${what[e.type]}${seen}` : what[e.type];
}

function App() {
  const [u, setU] = useState<Update | null>(null);
  const [me, setMe] = useState<{ roomId: string; seat: string } | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [mode, setMode] = useState<'match' | 'power' | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [bot, setBot] = useState<BotName>('steady');
  const [easy, setEasy] = useState(() => { try { return localStorage.getItem('cabo-easy') === '1'; } catch { return false; } });
  const [, setTick] = useState(0);
  const seenAt = useRef(new Map<number, number>()); // uid -> when this face-down card became known to me
  const flip = useRef<ReturnType<typeof Flip.getState> | null>(null);

  useLayoutEffect(() => { // after each update renders, glide every card from where it was
    const from = flip.current;
    flip.current = null;
    if (from) Flip.from(from, {
      targets: '[data-flip-id]', duration: 0.45, ease: 'power2.inOut',
      onEnter: (els) => gsap.fromTo(els, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.3 }),
    });
  }, [u]);

  useEffect(() => {
    const onUpdate = (x: Update) => {
      const n = (id?: string) => x.seats.find((s) => s.id === id)?.name ?? '?';
      if (!reduced) flip.current = Flip.getState('[data-flip-id]');
      // Track when each face-down card became known, so memory mode can turn it back over.
      const known = new Set<number>(), now = Date.now();
      for (const h of Object.values(x.view?.hands ?? {})) for (const c of h) if (c.card !== null && !c.faceUp) known.add(c.uid);
      for (const uid of seenAt.current.keys()) if (!known.has(uid)) seenAt.current.delete(uid);
      let fresh = false;
      for (const uid of known) if (!seenAt.current.has(uid)) { seenAt.current.set(uid, now); fresh = true; }
      if (fresh) setTimeout(() => setTick((t) => t + 1), MEMORY_MS + 50);
      setU(x);
      setLog((l) => [...x.events.map((e) => describe(e, n)).reverse(), ...l].slice(0, 12));
      setMode(null);
      setPicked([]);
    };
    // On every (re)connect, take our seat back: a new connection is not subscribed to anything yet.
    const onConnect = async () => {
      const token = saved.get();
      if (!token) return;
      const r = await call('resume', { token });
      if (r.roomId) setMe({ roomId: r.roomId, seat: r.seat! }); else saved.set('');
    };
    socket.on('update', onUpdate);
    socket.on('connect', onConnect);
    if (socket.connected) onConnect();
    return () => { socket.off('update', onUpdate); socket.off('connect', onConnect); };
  }, []);

  const send = async (ev: string, body?: object) => {
    const r = await call(ev, body);
    setError(r.error ?? '');
    return r;
  };
  const enter = async (ev: 'create' | 'join') => {
    const r = await send(ev, { name, roomId: code });
    if (r.roomId) { saved.set(r.token!); setMe({ roomId: r.roomId, seat: r.seat! }); }
  };
  const leave = () => { saved.set(''); location.reload(); };
  const toggleEasy = () => setEasy((e) => { try { localStorage.setItem('cabo-easy', e ? '0' : '1'); } catch { /* not kept */ } return !e; });

  if (!me) return (
    <main>
      <h1>Cabo</h1>
      <div className="row"><input placeholder="Your name" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="row"><button className="primary" onClick={() => enter('create')}>Create room</button></div>
      <div className="row">
        <input placeholder="Room code" value={code} maxLength={4} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <button onClick={() => enter('join')} disabled={code.length !== 4}>Join</button>
      </div>
      {error && <p className="error">{error}</p>}
    </main>
  );

  const seats = u?.seats ?? [];
  const n = (id?: string) => seats.find((s) => s.id === id)?.name ?? '?';
  const isHost = seats[0]?.id === me.seat;
  const v = u?.view ?? null, s = u?.session;
  const legal = u?.legal ?? [];
  const can = (t: Action['type']) => legal.some((a) => a.type === t);
  const act = (a: Record<string, unknown>) => send('act', { ...a, player: me.seat });
  const power = v?.drawn?.card != null && v.drawn.from === 'pile' ? powerOf(v.drawn.card) : null;

  const onCard = (owner: string, c: ViewSlot) => {
    if (mode === 'match') return setPicked((p) => (p.includes(c.uid) ? p.filter((x) => x !== c.uid) : [...p, c.uid]));
    if (mode === 'power') {
      const next = [...picked, c.uid];
      return next.length === (power === 'swap' ? 2 : 1) ? act({ type: 'usePower', uids: next }) : setPicked(next);
    }
    if (owner === me.seat && legal.some((a) => a.type === 'keepDrawn' && a.replace === c.uid)) act({ type: 'keepDrawn', replace: c.uid });
  };

  const header = (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <h1>Cabo · room {me.roomId}{s?.gameNo ? ` · game ${s.gameNo}` : ''}{v && v.phase !== 'over' ? ` · round ${v.round}` : ''}</h1>
      <div className="row">
        <label className="muted"><input type="checkbox" checked={easy} onChange={toggleEasy} /> Show cards I've seen</label>
        <button onClick={leave}>Leave</button>
      </div>
    </div>
  );
  // During a game these are the totals going in; at game over the scoreboard below replaces them.
  const totals = s && s.gameNo > 0 && v?.phase !== 'over' && (
    <p className="muted">Totals: {seats.map((x) => `${x.name} ${s.totals[x.id] ?? 0}`).join(' · ')}</p>
  );

  if (!v) return (
    <main>
      {header}
      <p>Share the code <b>{me.roomId}</b>. Players ({seats.length}/6):</p>
      <ul>{seats.map((x) => <li key={x.id}>{x.name}{x.bot ? ' (bot)' : ''}{x.id === me.seat ? ' (you)' : ''}</li>)}</ul>
      {isHost && <div className="row">
        <select value={bot} onChange={(e) => setBot(e.target.value as BotName)} aria-label="Bot style">
          {BOT_NAMES.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <button onClick={() => send('addBot', { bot })} disabled={seats.length >= 6}>Add bot</button>
        <button className="primary" onClick={() => send('start')} disabled={seats.length < 3}>Start</button>
      </div>}
      {!isHost && <p className="muted">Waiting for the host to start…</p>}
      {error && <p className="error">{error}</p>}
    </main>
  );

  const r = v.result;
  const visible = (c: ViewSlot) => c.card !== null &&
    (c.faceUp || v.phase === 'over' || easy || Date.now() - (seenAt.current.get(c.uid) ?? 0) < MEMORY_MS);
  const myTurn = v.active === me.seat && v.phase !== 'over';
  const hint = mode === 'match' ? 'Pick 2+ cards of the same rank: at least one of yours, at most one other player\'s.'
    : mode === 'power' ? (power === 'peek' ? 'Pick one of your cards to peek at.' : power === 'spy' ? 'Pick another player\'s card to spy on.' : 'Pick any two cards to swap.')
    : v.phase === 'drawn' && myTurn ? `Click one of your cards to swap the held card in${v.matchFailed ? ' (you must keep it)' : ''}.` : '';

  return (
    <main>
      {header}
      {totals}
      <p>
        {v.phase === 'over' ? (r!.reason === 'empty' ? 'A hand was emptied.' : 'Cabo reveal.')
          : myTurn ? <b>Your turn.</b> : `${n(v.active)}'s turn.`}
        {v.caller && v.phase !== 'over' ? ` ${n(v.caller)} called CABO.` : ''}
      </p>

      <div className="row">
        <span>Draw pile: {v.pileCount}</span>
        <span>· Discard</span>
        <CardView flipId={v.discardTopUid ?? 'discard'} text={label(v.discardTop)} hidden={v.discardTop === null} disabled />
        {v.drawn && <>
          <span>· Held{v.active === me.seat ? '' : ` by ${n(v.active)}`}</span>
          <CardView flipId={v.drawn.uid} text={label(v.drawn.card)} hidden={v.drawn.card === null} disabled className="held" />
        </>}
      </div>

      {/* Always rendered with a fixed height: a layout shift here would make every card on the table glide. */}
      <div className="row actions">{myTurn && <>
        {can('drawPile') && <button className="primary" onClick={() => act({ type: 'drawPile' })}>Draw</button>}
        {can('takeDiscard') && <button onClick={() => act({ type: 'takeDiscard' })}>Take {label(v.discardTop)}</button>}
        {can('callCabo') && <button onClick={() => act({ type: 'callCabo' })}>Call CABO</button>}
        {can('discardDrawn') && <button onClick={() => act({ type: 'discardDrawn' })}>Discard it</button>}
        {can('usePower') && mode !== 'power' && <button onClick={() => { setMode('power'); setPicked([]); }}>Use {power}</button>}
        {v.phase === 'drawn' && !v.matchFailed && mode !== 'match' && <button onClick={() => { setMode('match'); setPicked([]); }}>Match…</button>}
        {mode === 'match' && <button className="primary" disabled={picked.length < 2} onClick={() => act({ type: 'match', uids: picked })}>Match {picked.length}</button>}
        {mode && <button onClick={() => { setMode(null); setPicked([]); }}>Cancel</button>}
      </>}</div>
      <p className="muted hint">{hint}</p>

      {v.players.map((p) => (
        <div key={p} className={`player${v.active === p && v.phase !== 'over' ? ' active' : ''}`}>
          <div>{n(p)}{p === me.seat ? ' (you)' : ''}{r ? ` — ${r.totals[p]} pts${r.winners.includes(p) ? ' ★' : ''}${r.caller === p ? ' (caller)' : ''}` : ''}</div>
          <div className="row">
            {v.hands[p]!.map((c) => (
              <CardView key={c.uid} flipId={c.uid} text={visible(c) ? label(c.card) : '?'} hidden={!visible(c)}
                className={`${c.faceUp ? 'faceup' : ''}${picked.includes(c.uid) ? ' picked' : ''}`}
                disabled={!myTurn} onClick={() => onCard(p, c)} />
            ))}
          </div>
        </div>
      ))}

      {r && s && <>
        <table className="board">
          <thead><tr><th>Player</th><th>Hand</th><th>Added</th><th>Total</th></tr></thead>
          <tbody>{v.players.map((p) => (
            <tr key={p}>
              <td>{n(p)}{r.winners.includes(p) ? ' ★' : ''}{r.caller === p ? ' (called)' : ''}</td>
              <td>{r.totals[p]}</td>
              <td>+{r.gains[p]}{r.caller === p && r.gains[p] !== 0 ? ' (incl. +10 for calling)' : ''}</td>
              <td>{s.totals[p]}{s.halved.includes(p) ? ' (hit 100, halved)' : ''}</td>
            </tr>
          ))}</tbody>
        </table>
        {s.over
          ? <p><b>Session over.</b> {s.winners.map(n).join(' & ')} win{s.winners.length > 1 ? '' : 's'} with the lowest total.</p>
          : isHost ? <button className="primary" onClick={() => send('next')}>Next game</button>
          : <p className="muted">Waiting for the host…</p>}
      </>}
      {error && <p className="error">{error}</p>}
      <ul className="log">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
