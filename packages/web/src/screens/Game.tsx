import { useState } from 'react';
import type { ReactNode } from 'react';
import { Ban } from 'lucide-react';
import { powerOf } from '@cabo/engine';
import type { Action, ViewSlot } from '@cabo/engine';
import type { Update } from '@cabo/server';
import type { Confirm, PowerPlayed } from '@/App.tsx';
import { AnimSlot } from '@/anim/slots.tsx';
import { Hud } from '@/components/Hud.tsx';
import type { Rail } from '@/components/Hud.tsx';
import { ActionNotice, CaboCall, PausedPanel, SummaryPanel } from '@/components/Overlays.tsx';
import { CardArt, CardSpot, CardView } from '@/components/PlayingCard.tsx';
import { Seat } from '@/components/Seat.tsx';
import type { SeatInfo } from '@/components/Seat.tsx';
import { SideRail } from '@/components/SideRail.tsx';
import { Button, Chip } from '@/components/ui.tsx';
import { POWER_LABEL, label, spoken } from '@/lib/cards.ts';
import { cn } from '@/lib/cn.ts';
import { MEMORY_MS } from '@/lib/motion.ts';

/** What the player is picking cards for, after drawing. Nothing is picked by a plain click: an action comes first. */
export type Pick = 'keep' | 'match' | 'peek' | 'spy' | 'swap';
const PICK_HINT: Record<Pick, string> = {
  keep: 'Pick one of your cards: the drawn card takes its place and that card is discarded.',
  match: 'Pick the cards in hands to pair off (same rank): at least one of yours, at most one other player\'s. The card you drew can\'t be matched. Then press Match.',
  peek: 'Pick one of your cards to look at.',
  spy: 'Pick another player\'s card to look at.',
  swap: 'Pick any two cards on the table, from anyone, to swap them.',
};

/**
 * Where each opponent sits on the oval, clockwise from you (you're at the bottom): the first player after you is on
 * the left, the last on the right. Angles in degrees; 90 = the top of the table.
 */
function seatSpot(i: number, n: number) {
  const start = n === 2 ? 150 : n === 3 ? 160 : 168;
  const a = ((n === 1 ? 90 : start - (i * (2 * start - 180)) / (n - 1)) * Math.PI) / 180;
  return { x: 50 + 40 * Math.cos(a), y: 62 - 46 * Math.sin(a) };
}

export function Game({ u, me, send, error, log, easy, toggleEasy, mode, setMode, picked, setPicked, failed, caboBy, action, seenAt, revealed, setRevealed, confirm }: {
  u: Update; me: { roomId: string; seat: string }; send: (ev: string, body?: object) => Promise<unknown>; error: string; log: string[];
  easy: boolean; toggleEasy: () => void; mode: Pick | null; setMode: (m: Pick | null) => void; picked: number[]; setPicked: (p: number[]) => void;
  failed: number[]; caboBy: string | null; action: PowerPlayed | null; seenAt: Map<number, number>; revealed: boolean; setRevealed: (r: boolean) => void; confirm: (c: Confirm) => void;
}) {
  const [rail, setRail] = useState<Rail | null>(() => (matchMedia('(min-width: 1024px)').matches ? 'log' : null));
  const seats = u.seats;
  const seat = (id?: string) => seats.find((x) => x.id === id);
  const n = (id?: string) => seat(id)?.name ?? '?';
  const isHost = u.owner === me.seat;
  const paused = u.paused;
  const vacant = seats.filter((x) => x.status === 'vacant');
  const v = u.view, s = u.session, sum = u.summary;
  const legal = u.legal;
  const can = (t: Action['type']) => legal.some((a) => a.type === t);
  const act = (a: Record<string, unknown>) => send('act', { ...a, player: me.seat });

  const hud = (
    <Hud roomId={me.roomId} gameNo={s?.gameNo} round={v && v.phase !== 'over' ? v.round : undefined}
      canCabo={can('callCabo')} onCabo={() => act({ type: 'callCabo' })} rail={rail} setRail={setRail} easy={easy} toggleEasy={toggleEasy}
      onEnd={isHost && !s?.over ? () => confirm('end') : undefined} onLeave={() => confirm('leave')} />
  );
  const pausedPanel = paused && (
    <PausedPanel vacant={vacant} roomId={me.roomId} isOwner={isHost} ownerName={n(u.owner)} sessionOver={!!s?.over}
      onReplace={(id) => send('replaceWithBot', { seat: id, bot: 'steady' })} onEnd={() => confirm('end')} />
  );
  const summaryPanel = (standalone: boolean) => sum && (
    <SummaryPanel sum={sum} me={me.seat} isOwner={isHost} paused={paused} ownerName={n(u.owner)} standalone={standalone}
      onNext={() => send(sum.sessionOver ? 'newSession' : 'next')} onLeave={() => confirm('leave')} />
  );
  const rails = <SideRail rail={rail} setRail={setRail} log={log} seats={seats} totals={s?.totals ?? {}} me={me.seat} />;
  const frame = (table: ReactNode) => (
    <div className="flex h-full flex-col">
      {hud}
      <div className="relative flex min-h-0 flex-1">
        <main className="felt relative flex min-w-0 flex-1 flex-col overflow-y-auto md:overflow-hidden">{table}</main>
        {rails}
      </div>
    </div>
  );

  // The session was ended mid-game: there is no table to show, only the results.
  if (!v) return frame(<>{summaryPanel(true)}{pausedPanel}{error && <ErrorToast text={error} />}</>);

  const r = v.result, over = v.phase === 'over';
  const power = v.drawn?.card != null && v.drawn.from === 'pile' ? powerOf(v.drawn.card) : null;
  const myTurn = v.active === me.seat && !over && !paused;
  // Whose turn it is: the active seat, or while paused the empty seat(s) everyone is waiting on.
  const waitingOn = (p: string) => (paused ? vacant.some((x) => x.id === p) : v.active === p && !over);
  const visible = (c: ViewSlot) => c.card !== null && (c.faceUp || over || easy || Date.now() - (seenAt.get(c.uid) ?? 0) < MEMORY_MS);

  const pick = (m: Pick | null) => { setMode(m); setPicked([]); };
  const pickable = (owner: string) => mode === 'keep' || mode === 'peek' ? owner === me.seat : mode === 'spy' ? owner !== me.seat : !!mode;
  /** Click a picked card again to unpick it. Match waits for its button; the others go as soon as enough are picked. */
  const onCard = (owner: string, c: ViewSlot) => {
    if (!mode || !pickable(owner)) return;
    if (picked.includes(c.uid)) return setPicked(picked.filter((x) => x !== c.uid));
    const next = [...picked, c.uid];
    if (mode === 'match' || next.length < (mode === 'swap' ? 2 : 1)) return setPicked(next);
    act(mode === 'keep' ? { type: 'keepDrawn', replace: c.uid } : { type: 'usePower', uids: next });
  };

  // The power just played: its cards light up for everyone, and its notice sits by the player's seat.
  const spot = new Set(action ? action.uids ?? (action.uid != null ? [action.uid] : []) : []);
  const notice = action && <ActionNotice power={action.type} {...describePower(action, me.seat, n)} />;

  const info = (p: string): SeatInfo => ({
    name: n(p), you: p === me.seat, bot: !!seat(p)?.bot, owner: u.owner === p, total: s?.totals[p] ?? 0,
    turn: waitingOn(p), caller: v.caller === p, vacant: vacant.some((x) => x.id === p),
    result: r ? { hand: r.totals[p]!, winner: r.winners.includes(p) } : undefined,
  });
  const hand = (p: string) => v.hands[p]!.map((c) => {
    const shown = visible(c), order = picked.indexOf(c.uid), choosing = myTurn && !!mode;
    return (
      <CardView key={c.uid} flipId={c.uid} card={shown ? c.card : null} suit={shown ? c.suit : null} size={p === me.seat ? 'lg' : 'sm'}
        faceUp={c.faceUp} known={shown && !over} failed={failed.includes(c.uid)} spotlight={spot.has(c.uid)}
        pickable={choosing && pickable(p) && order < 0} picked={order >= 0 ? order + 1 : undefined} dimmed={choosing && !pickable(p)}
        aria-pressed={mode ? order >= 0 : undefined} disabled={!myTurn || !pickable(p)} onClick={() => onCard(p, c)} />
    );
  });

  const i = v.players.indexOf(me.seat);
  const opponents = [...v.players.slice(i + 1), ...v.players.slice(0, Math.max(i, 0))];

  // The dock: what's happening, and your moves. Fixed height, so it never shifts the table (which would make every card glide).
  let prompt: ReactNode, tone: 'turn' | 'danger' | 'quiet' = 'quiet', moves: ReactNode = null;
  if (over) {
    prompt = r!.reason === 'empty' ? 'A hand was emptied. Every card turns over.' : 'Cabo reveal. Every card turns over.';
    if (sum) moves = <Button variant="primary" onClick={() => setRevealed(true)}>See the summary</Button>;
  } else if (paused) {
    prompt = 'Paused: waiting for the empty seat.';
  } else if (!myTurn) {
    prompt = `${n(v.active)} is ${v.phase === 'drawn' ? 'deciding what to do with their card' : 'taking their turn'}…`;
  } else if (mode) {
    tone = 'turn';
    const count = mode === 'swap' ? ` (${picked.length}/2)` : mode === 'match' && picked.length ? ` (${picked.length} picked)` : '';
    prompt = PICK_HINT[mode] + count;
    moves = <>
      {mode === 'match' && <Button variant="select" disabled={picked.length < 2} onClick={() => act({ type: 'match', uids: picked })}>
        Match{picked.length >= 2 ? ` these ${picked.length}` : ''}</Button>}
      <Button onClick={() => pick(null)}>Cancel</Button>
    </>;
  } else if (v.phase === 'start') {
    tone = 'turn';
    prompt = `Draw from the pile${can('takeDiscard') ? `, take the ${label(v.discardTop)} from the discard pile` : ''}${can('callCabo') ? ', or call Cabo' : ''}.`;
    moves = <>
      {can('drawPile') && <Button variant="primary" onClick={() => act({ type: 'drawPile' })}>Draw</Button>}
      {can('takeDiscard') && <Button onClick={() => act({ type: 'takeDiscard' })}>Take {label(v.discardTop)}</Button>}
    </>;
  } else {
    tone = v.matchFailed ? 'danger' : 'turn';
    prompt = v.matchFailed ? 'Not a match: the cards stay put and you took a penalty card. Now keep the drawn card in place of one of yours.'
      : v.drawn?.from === 'discard' ? `You took the ${label(v.drawn.card)}. Keep it in place of one of your cards, or try a match.`
      : `You drew a ${label(v.drawn?.card)}${power ? ` (${POWER_LABEL[power]})` : ''}. Keep it, discard it${power ? ', use its power' : ''}, or try a match.`;
    moves = <>
      {can('keepDrawn') && <Button variant={v.matchFailed ? 'primary' : 'secondary'} onClick={() => pick('keep')}>Keep it…</Button>}
      {can('discardDrawn') && <Button onClick={() => act({ type: 'discardDrawn' })}>Discard it</Button>}
      {can('usePower') && power && <Button variant="primary" onClick={() => pick(power)}>{POWER_LABEL[power]}…</Button>}
      {!v.matchFailed && <Button onClick={() => pick('match')}>Match…</Button>}
    </>;
  }

  return frame(<>
    <div aria-hidden className="table-rail pointer-events-none absolute inset-x-[3%] bottom-[2%] top-[4%] hidden md:block" />

    {v.caller && !over && (
      <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2">
        <Chip tone="gold" className="px-4 py-1 text-xs tracking-[.16em] shadow-[0_6px_24px_-6px_rgb(243_201_74/.6)]">
          FINAL ROUND · {v.caller === me.seat ? 'YOU' : n(v.caller).toUpperCase()} CALLED CABO
        </Chip>
      </div>
    )}

    {/* Opponents around the oval with the piles in the middle; stacked on phones. */}
    <div className="relative flex flex-col gap-4 p-3 pt-12 md:block md:min-h-[300px] md:flex-1 md:p-0">
      <div className="grid grid-cols-2 gap-x-2 gap-y-4 md:contents">
        {opponents.map((p, k) => {
          const { x, y } = seatSpot(k, opponents.length);
          return (
            <Seat key={p} info={info(p)} notice={action?.player === p && notice} className="md:absolute md:w-max md:max-w-[17rem] md:-translate-x-1/2 md:-translate-y-1/2"
              style={{ left: `clamp(8rem, ${x}%, calc(100% - 8rem))`, top: `${y}%` }}>
              {hand(p)}
            </Seat>
          );
        })}
      </div>
      <CentrePiles v={v} me={me.seat} n={n} matching={myTurn && mode === 'match'} />
    </div>

    <div className="shrink-0 px-3 pb-2 md:px-6">
      <Dock prompt={prompt} tone={tone} myTurn={myTurn} moves={moves} />
    </div>
    <div className="shrink-0 pb-4 [perspective:800px]">
      <Seat info={info(me.seat)} plateBelow notice={action?.player === me.seat && notice} className="mx-auto w-max max-w-full">{hand(me.seat)}</Seat>
    </div>

    <AnimSlot name="turnChange" fire={`${s?.gameNo}-${v.turn}`} props={{ name: n(v.active), mine: v.active === me.seat }} />
    {action && <AnimSlot name="powerPlayed" fire={`${s?.gameNo}-${v.turn}`} props={{ power: action.type, name: n(action.player), mine: action.player === me.seat }} />}
    {v.caller && <AnimSlot name="caboCall" fire={`${s?.gameNo}-${v.caller}`} props={{ name: n(v.caller), mine: v.caller === me.seat }} />}
    {over && <AnimSlot name="reveal" fire={`${s?.gameNo}`} props={{ reason: r!.reason }} />}

    {caboBy && <CaboCall name={n(caboBy)} mine={caboBy === me.seat} />}
    {sum && revealed && summaryPanel(false)}
    {pausedPanel}
    {error && <ErrorToast text={error} />}
  </>);
}

/** The words on a power's notice, from where you sit: who used it, and on whose cards (never what they are). */
function describePower(a: PowerPlayed, me: string, n: (id?: string) => string): { title: string; detail: string } {
  const mine = a.player === me, actor = mine ? 'You' : n(a.player);
  const whose = (o?: string) => (o === me ? 'your' : o === a.player ? 'their own' : `${n(o)}'s`);
  const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
  if (a.type === 'peek') return { title: `${actor} peeked`, detail: `At one of ${mine ? 'your' : 'their'} own cards.` };
  if (a.type === 'spy') return { title: `${actor} spied on ${a.target === me ? 'you' : n(a.target)}`, detail: `Looked at one of ${whose(a.target)} cards.` };
  const [x, y] = a.owners ?? [];
  return { title: `${actor} swapped two cards`, detail: x === y ? `Two of ${whose(x)} cards traded places.` : `${cap(whose(x))} card ↔ ${whose(y)} card.` };
}

/** Draw pile, the held card (or its empty spot, so nothing shifts) and the discard pile. */
/** While matching, the held card is out of bounds (only cards in hands can be matched), so it dims and says so. */
function CentrePiles({ v, me, n, matching }: { v: NonNullable<Update['view']>; me: string; n: (id?: string) => string; matching: boolean }) {
  const held = v.drawn;
  return (
    <div className="flex items-end justify-center gap-4 md:absolute md:left-1/2 md:top-[62%] md:-translate-x-1/2 md:-translate-y-1/2 md:gap-7">
      <Pile label="Draw" count={v.pileCount}>
        {v.pileCount > 0 ? (
          <span className="relative block">
            {v.pileCount > 2 && <CardArt card={null} size="md" className="absolute left-[3px] top-[3px] opacity-70" />}
            {v.pileCount > 1 && <CardArt card={null} size="md" className="absolute left-[1.5px] top-[1.5px]" />}
            <CardArt card={null} size="md" className="relative" />
          </span>
        ) : <CardSpot size="md" label="Empty" />}
      </Pile>
      <Pile label={held ? (v.active === me ? 'Your card' : `${n(v.active)}'s card`) : 'Held'} strong={!!held}>
        {held ? (
          <span className="relative">
            <CardView flipId={held.uid} card={held.card} suit={held.suit} size="md" disabled dimmed={matching} className="shadow-lift"
              aria-label={matching && held.card !== null ? `${spoken(held.card, held.suit)}, can't be matched` : undefined} />
            {matching && (
              <Chip tone="dark" className="absolute -bottom-2 left-1/2 -translate-x-1/2 shadow-panel">
                <Ban className="size-3" aria-hidden />Can't match
              </Chip>
            )}
          </span>
        )
          : <CardSpot size="md" />}
      </Pile>
      <Pile label="Discard" count={v.discardCount}>
        {v.discardTop !== null
          ? <CardView flipId={v.discardTopUid ?? 'discard'} card={v.discardTop} suit={v.discardTopSuit} size="md" disabled />
          : <CardSpot size="md" label="Empty" />}
      </Pile>
    </div>
  );
}

const Pile = ({ label: text, count, strong, children }: { label: string; count?: number; strong?: boolean; children: ReactNode }) => (
  <div className="flex flex-col items-center gap-2 [perspective:600px]">
    {children}
    <span className={cn('max-w-24 truncate text-[11px] font-semibold uppercase tracking-[.14em]', strong ? 'text-white' : 'text-grey-400')}>
      {text}{count != null && <span className="ml-1 text-grey-500 numerals">{count}</span>}
    </span>
  </div>
);

function Dock({ prompt, tone, myTurn, moves }: { prompt: ReactNode; tone: 'turn' | 'danger' | 'quiet'; myTurn: boolean; moves: ReactNode }) {
  return (
    <div className={cn('mx-auto flex h-[116px] max-w-4xl flex-col justify-center gap-2 rounded-2xl bg-chrome/90 px-4 shadow-panel backdrop-blur md:h-[72px] md:flex-row md:items-center md:gap-4 md:px-5',
      tone === 'danger' && 'ring-1 ring-danger/60')}>
      <p role="status" className={cn('flex min-w-0 flex-1 items-start gap-2 text-sm leading-snug md:items-center',
        tone === 'danger' ? 'text-red-300' : tone === 'turn' ? 'text-white' : 'text-grey-300')}>
        {myTurn && <Chip tone="gold" className="mt-px shrink-0 tracking-[.12em] md:mt-0">YOUR TURN</Chip>}
        <span className="line-clamp-2">{prompt}</span>
      </p>
      <div className="flex shrink-0 gap-2 overflow-x-auto">{moves}</div>
    </div>
  );
}

const ErrorToast = ({ text }: { text: string }) => (
  <p role="alert" className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-danger px-4 py-2 text-sm font-semibold text-white shadow-panel">{text}</p>
);
