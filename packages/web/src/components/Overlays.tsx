import type { CSSProperties, ReactNode } from 'react';
import { ArrowLeftRight, Eye, Pause, Search, Trophy } from 'lucide-react';
import type { Power } from '@cabo/engine';
import type { GameSummary, Seat } from '@cabo/server';
import { AnimSlot } from '@/anim/slots.tsx';
import { POWER_LABEL } from '@/lib/cards.ts';
import { ACTION_MS, CABO_MS } from '@/lib/motion.ts';
import { cn } from '@/lib/cn.ts';
import { CardArt } from './PlayingCard.tsx';
import { Button, Chip, Panel } from './ui.tsx';

/** Dims the felt under a centred panel. The table stays visible behind it. */
const Scrim = ({ z, children }: { z: string; children: ReactNode }) => (
  <div className={cn('absolute inset-0 flex items-center justify-center overflow-y-auto bg-navy-950/65 p-4 backdrop-blur-[2px]', z)}>{children}</div>
);

/**
 * Someone called Cabo: a big gold announcement in the middle of the table for CABO_MS, naming the caller, with a bar
 * running down the time. It never blocks the table (the next player may already be moving).
 */
export function CaboCall({ name, mine }: { name: string; mine: boolean }) {
  return (
    <div role="alert" style={{ '--cabo-ms': `${CABO_MS}ms` } as CSSProperties}
      className="cabo-call pointer-events-none absolute inset-0 z-[45] flex items-center justify-center bg-navy-950/50 p-4">
      <div className="cabo-pop relative w-full max-w-lg overflow-hidden rounded-3xl bg-chrome px-6 pb-9 pt-8 text-center shadow-[0_0_80px_-10px_rgb(243_201_74/.55)] ring-2 ring-turn md:px-10">
        <p className="text-xs font-bold uppercase tracking-[.35em] text-turn">Final round</p>
        <p className="mt-1 font-display text-7xl font-extrabold tracking-[.06em] text-turn md:text-9xl">CABO!</p>
        <p className="mt-3 text-xl font-semibold text-white md:text-2xl">{mine ? 'You called Cabo' : `${name} called Cabo`}</p>
        <p className="mt-1 text-sm text-grey-300">Everyone else gets one last turn, then every card is revealed.</p>
        <span aria-hidden className="cabo-timer absolute inset-x-0 bottom-0 h-1.5 origin-left bg-turn" />
      </div>
    </div>
  );
}

const POWER_ICON: Record<Power, typeof Eye> = { peek: Eye, spy: Search, swap: ArrowLeftRight };

/** A power was just used: the Cabo card's little sibling, shown by the player's seat for ACTION_MS. */
export function ActionNotice({ power, title, detail }: { power: Power; title: string; detail: string }) {
  const Icon = POWER_ICON[power];
  return (
    <div role="status" style={{ '--action-ms': `${ACTION_MS}ms` } as CSSProperties}
      className="action-notice relative w-max max-w-[16rem] overflow-hidden rounded-2xl bg-chrome px-4 pb-3.5 pt-2.5 shadow-[0_0_40px_-10px_rgb(243_201_74/.6)] ring-2 ring-turn">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.25em] text-turn"><Icon className="size-3.5" aria-hidden />{POWER_LABEL[power]}</p>
      <p className="mt-0.5 font-display text-lg font-bold leading-tight text-white">{title}</p>
      <p className="mt-0.5 text-xs leading-snug text-grey-300">{detail}</p>
      <span aria-hidden className="action-timer absolute inset-x-0 bottom-0 h-1 origin-left bg-turn" />
    </div>
  );
}

/** A seat is empty: everyone sees who left and the code to share; only the owner chooses what happens. */
export function PausedPanel({ vacant, roomId, isOwner, ownerName, sessionOver, onReplace, onEnd }: {
  vacant: Seat[]; roomId: string; isOwner: boolean; ownerName: string; sessionOver: boolean;
  onReplace: (seat: string) => void; onEnd: () => void;
}) {
  return (
    <Scrim z="z-40">
      <Panel role="status" className="w-full max-w-md border-t-4 border-danger p-6">
        <div className="flex items-center gap-2 text-danger"><Pause className="size-5 fill-current" /><span className="text-xs font-bold uppercase tracking-[.2em]">Paused</span></div>
        <h2 className="mt-2 font-display text-2xl font-bold">{vacant.map((x) => x.name).join(' and ')} left the table</h2>
        <p className="mt-2 text-sm leading-relaxed text-grey-300">
          They can come back, or anyone can take the seat by joining with code <b className="tracking-widest text-white">{roomId}</b>.
        </p>
        {isOwner ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {vacant.map((x) => <Button key={x.id} variant="primary" onClick={() => onReplace(x.id)}>Replace {x.name} with a bot</Button>)}
            {!sessionOver && <Button variant="danger" onClick={onEnd}>End game</Button>}
          </div>
        ) : <p className="mt-6 text-sm text-grey-400">Waiting for {ownerName} (the room owner) to decide…</p>}
      </Panel>
    </Scrim>
  );
}

/**
 * After each game ("Game N summary") and once the session is over ("Final results"): one panel, switched by
 * sessionOver. Winners are green and labelled, so colour is never the only cue.
 */
export function SummaryPanel({ sum, me, isOwner, paused, ownerName, onNext, onLeave, standalone }: {
  sum: GameSummary; me: string; isOwner: boolean; paused: boolean; ownerName: string;
  onNext: () => void; onLeave: () => void; standalone?: boolean;
}) {
  const final = sum.sessionOver;
  const rows = [...sum.players].sort((a, b) => (final ? a.total - b.total : a.gained - b.gained));
  const won = (x: GameSummary['players'][number]) => (final ? x.sessionWinner : x.winner);
  const winners = rows.filter(won), hand = sum.hands[me];
  const panel = (
    <Panel className="relative w-full max-w-2xl overflow-hidden p-6 md:p-8">
      <AnimSlot name="winner" fire={`${sum.game}-${final}`} props={{ names: winners.map((x) => x.name), mine: winners.some((x) => x.seat === me), final }} />
      <p className="text-xs font-bold uppercase tracking-[.2em] text-grey-400">{final ? 'Session over' : 'Round complete'}</p>
      <h2 className="mt-1 font-display text-3xl font-bold md:text-4xl">{final ? 'Final results' : `Game ${sum.game} summary`}</h2>
      {winners.length > 0 && (
        <p className="mt-2 flex items-center gap-2 text-sm text-win">
          <Trophy className="size-4" />{winners.map((x) => (x.seat === me ? 'You' : x.name)).join(' & ')} {final ? 'won the session' : 'won this game'}
        </p>
      )}

      {hand && hand.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-grey-400">Your final hand</p>
          <div className="mt-2 flex flex-wrap gap-2">{hand.map((c, i) => <CardArt key={i} card={c.card} suit={c.suit} size="md" />)}</div>
        </div>
      )}

      <table className="mt-6 w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-[.12em] text-grey-500">
          <tr className="border-b border-white/10">
            <th className="py-2 pl-3 font-semibold">Player</th>
            {final ? <><th className="py-2 text-right font-semibold">Games won</th><th className="py-2 pr-3 text-right font-semibold">Final score</th></>
              : <><th className="py-2 text-right font-semibold">Points</th><th className="py-2 pr-3 text-right font-semibold">Total</th></>}
          </tr>
        </thead>
        <tbody className="numerals">
          {rows.map((x) => (
            <tr key={x.seat} className={cn('border-b border-white/5', won(x) && 'bg-win/10 text-win')}>
              <td className="py-2.5 pl-3 font-semibold">
                <span className="flex flex-wrap items-center gap-2">
                  {x.name}{x.seat === me && <span className="font-normal text-grey-400">(you)</span>}
                  {won(x) && <Chip tone="green">Winner</Chip>}
                </span>
              </td>
              {final ? <>
                <td className="py-2.5 text-right">{x.gamesWon}</td>
                <td className="py-2.5 pr-3 text-right font-display text-lg font-bold">{x.total}</td>
              </> : <>
                <td className="py-2.5 text-right">
                  <span className="inline-flex items-center gap-1.5">+{x.gained}{x.caboPenalty && <Chip>incl. +10 Cabo</Chip>}</span>
                </td>
                <td className="py-2.5 pr-3 text-right font-display text-lg font-bold">{x.halved ? <span title="Landed on exactly 100, so halved">100 → 50</span> : x.total}</td>
              </>}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        {isOwner ? <Button variant="primary" size="lg" disabled={paused} onClick={onNext}>{final ? 'New session' : 'Next game'}</Button>
          : <p className="text-sm text-grey-400">Waiting for {ownerName} (the room owner) to {final ? 'start a new session' : 'deal the next game'}…</p>}
        <Button onClick={onLeave}>Leave game</Button>
      </div>
    </Panel>
  );
  return standalone ? <div className="flex min-h-full items-center justify-center p-4">{panel}</div> : <Scrim z="z-30">{panel}</Scrim>;
}
