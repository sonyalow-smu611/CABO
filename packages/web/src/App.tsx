import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import type { GameEvent } from '@cabo/engine';
import type { Update } from '@cabo/server';
import { Button, Dialog } from '@/components/ui.tsx';
import { describe } from '@/lib/describe.ts';
import { ACTION_MS, CABO_MS, FAIL_MS, MEMORY_MS, REVEAL_MS, movePaced, reduced } from '@/lib/motion.ts';
import { call, saved, savedEasy, socket } from '@/lib/socket.ts';
import { Entry } from '@/screens/Entry.tsx';
import { Game } from '@/screens/Game.tsx';
import type { Pick } from '@/screens/Game.tsx';
import { Lobby } from '@/screens/Lobby.tsx';

gsap.registerPlugin(Flip);

export type Confirm = 'leave' | 'end';
/** A peek, spy or swap event: who used it, on whose cards, and which cards (never their values). */
export type PowerPlayed = GameEvent & { type: 'peek' | 'spy' | 'swap'; player: string };
const CONFIRM: Record<Confirm, { title: string; q: string; yes: string }> = {
  leave: { title: 'Leave the game?', q: 'It pauses for everyone until you come back or someone takes your seat.', yes: 'Leave' },
  end: { title: 'End the game for everyone?', q: 'The session ends with the scores as they stand.', yes: 'End game' },
};

export function App() {
  const [u, setU] = useState<Update | null>(null);
  const [me, setMe] = useState<{ roomId: string; seat: string } | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [mode, setMode] = useState<Pick | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [failed, setFailed] = useState<number[]>([]);
  const [caboBy, setCaboBy] = useState<string | null>(null); // who just called Cabo, while the announcement is up
  const caboTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [action, setAction] = useState<PowerPlayed | null>(null); // the power just played, while it's announced
  const actionTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [easy, setEasy] = useState(savedEasy.get);
  const [, setTick] = useState(0);
  const [confirming, setConfirming] = useState<Confirm | null>(null);
  const [revealed, setRevealed] = useState(false); // the reveal has had its moment; show the summary
  const hadSummary = useRef(false);
  const seenAt = useRef(new Map<number, number>()); // uid -> when this face-down card became known to me
  const flip = useRef<ReturnType<typeof Flip.getState> | null>(null);

  useLayoutEffect(() => { // after each update renders, glide every card from where it was
    const from = flip.current;
    flip.current = null;
    if (from) Flip.from(from, {
      targets: '[data-flip-id]', duration: movePaced(0.45), ease: 'power2.inOut',
      onEnter: (els) => gsap.fromTo(els, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: movePaced(0.3) }),
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
      // A failed match: outline its cards in red for a moment.
      const miss = x.events.find((e) => e.type === 'match' && !e.ok);
      if (miss?.cards) { setFailed(miss.cards.map((c) => c.uid)); setTimeout(() => setFailed([]), FAIL_MS); }
      // Someone used a power: announce it by their seat and light up its cards, for everyone.
      const power = x.events.find((e): e is PowerPlayed => e.type === 'peek' || e.type === 'spy' || e.type === 'swap');
      if (power) {
        setAction(power);
        clearTimeout(actionTimer.current);
        actionTimer.current = setTimeout(() => setAction(null), ACTION_MS);
      }
      // Someone called Cabo: announce it to the whole table.
      const cabo = x.events.find((e) => e.type === 'cabo');
      if (cabo?.player) {
        setCaboBy(cabo.player);
        clearTimeout(caboTimer.current);
        caboTimer.current = setTimeout(() => setCaboBy(null), CABO_MS);
      }
      // A new summary: leave the revealed table up for a moment first (none to show when the session was ended mid-game).
      if (x.summary && !hadSummary.current) {
        setRevealed(!x.view);
        if (x.view) setTimeout(() => setRevealed(true), REVEAL_MS);
      }
      hadSummary.current = !!x.summary;
      setU(x);
      setLog((l) => [...x.events.map((e) => describe(e, n)).reverse(), ...l].slice(0, 40));
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
  const leave = async () => { await call('leave'); saved.set(''); location.reload(); };
  const toggleEasy = () => setEasy((e) => { savedEasy.set(!e); return !e; });

  if (!me) return <Entry name={name} setName={setName} code={code} setCode={setCode}
    onCreate={() => enter('create')} onJoin={() => enter('join')} error={error} />;

  const dialog = confirming && (
    <Dialog tone="danger" title={CONFIRM[confirming].title} actions={<>
      <Button autoFocus onClick={() => setConfirming(null)}>Cancel</Button>
      <Button variant="danger" onClick={() => { setConfirming(null); if (confirming === 'leave') leave(); else send('endGame'); }}>
        {CONFIRM[confirming].yes}
      </Button>
    </>}>{CONFIRM[confirming].q}</Dialog>
  );

  // Before the first deal (no session yet): the lobby. A Leave here just gives the seat up, so no confirm.
  if (!u?.view && !u?.summary) return <>
    <Lobby roomId={me.roomId} seats={u?.seats ?? []} me={me.seat} owner={u?.owner ?? ''} error={error}
      onAddBot={(bot) => send('addBot', { bot })} onStart={() => send('start')} onLeave={leave} />
    {dialog}
  </>;

  return <>
    <Game u={u} me={me} send={send} error={error} log={log} easy={easy} toggleEasy={toggleEasy}
      mode={mode} setMode={setMode} picked={picked} setPicked={setPicked} failed={failed} caboBy={caboBy} action={action}
      seenAt={seenAt.current} revealed={revealed} setRevealed={setRevealed} confirm={setConfirming} />
    {dialog}
  </>;
}
