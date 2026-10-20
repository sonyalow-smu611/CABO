import { useState } from 'react';
import { Bot, Check, Copy, Crown, LogOut, Plus } from 'lucide-react';
import type { BotName, Seat } from '@cabo/server';
import { AnimSlot } from '@/anim/slots.tsx';
import { Avatar, Button, Chip, Wordmark } from '@/components/ui.tsx';
import { cn } from '@/lib/cn.ts';

export const BOT_NAMES = ['steady', 'cautious', 'bold', 'forgetful', 'random'] as const satisfies readonly BotName[];
const MAX = 6, MIN = 3;

/** The room before the deal: six seat cards, filled or open, the code to share, and the host's Start. */
export function Lobby({ roomId, seats, me, owner, onAddBot, onStart, onLeave, error }: {
  roomId: string; seats: Seat[]; me: string; owner: string;
  onAddBot: (bot: BotName) => void; onStart: () => void; onLeave: () => void; error: string;
}) {
  const isHost = owner === me, n = seats.length;
  const ownerName = seats.find((x) => x.id === owner)?.name ?? 'the host';
  return (
    <div className="felt flex min-h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b border-white/10 bg-chrome/80 px-4 backdrop-blur">
        <Wordmark className="text-lg text-white" />
        <Button variant="ghost" size="sm" onClick={onLeave}><LogOut className="size-4" />Leave</Button>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center px-4 py-8 md:py-12">
        <RoomCode code={roomId} />
        <p className="mt-2 text-center text-sm text-grey-300">Share the code with friends. {MIN}–{MAX} players; bots can fill open seats.</p>

        <ol className="mt-8 grid w-full grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          {Array.from({ length: MAX }, (_, i) => {
            const s = seats[i];
            return (
              <li key={s?.id ?? `open-${i}`} className="relative">
                <span className="absolute left-3 top-2.5 z-10 text-[10px] font-semibold uppercase tracking-[.14em] text-grey-500">Seat {i + 1}</span>
                {s ? <TakenSeat seat={s} you={s.id === me} owner={s.id === owner} />
                  : <OpenSeat code={roomId} isHost={isHost} first={i === n} onAddBot={onAddBot} />}
              </li>
            );
          })}
        </ol>

        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="text-sm text-grey-300 numerals" role="status">
            <b className="text-white">{n}/{MAX}</b> seated · {n < MIN ? `need ${MIN - n} more to start` : 'ready to deal'}
          </p>
          {isHost
            ? <Button variant="cabo" size="lg" className="min-w-56" disabled={n < MIN} onClick={onStart}>START GAME</Button>
            : <p className="text-sm text-grey-400">Waiting for {ownerName} to start the game…</p>}
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        </div>
      </main>
    </div>
  );
}

function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  return (
    <div className="flex flex-col items-center">
      <span className="text-xs font-semibold uppercase tracking-[.3em] text-grey-400">Room code</span>
      <div className="mt-2 flex items-center gap-3">
        <span className="font-display text-5xl font-extrabold tracking-[.25em] text-white md:text-6xl">{code}</span>
        <Button variant="secondary" size="sm" onClick={copy} aria-label="Copy room code">
          {copied ? <><Check className="size-4" />Copied</> : <><Copy className="size-4" />Copy</>}
        </Button>
      </div>
    </div>
  );
}

function TakenSeat({ seat, you, owner }: { seat: Seat; you: boolean; owner: boolean }) {
  return (
    <div className={cn('relative flex h-44 flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl bg-panel/90 px-3 pt-4 shadow-panel',
      you && 'ring-2 ring-white/70')}>
      <AnimSlot name="seatJoin" fire={seat.id} props={{ name: seat.name, bot: !!seat.bot, you }} />
      <Avatar name={seat.name} bot={!!seat.bot} size="lg" />
      <span className="max-w-full truncate text-base font-semibold">{seat.name}{you && <span className="font-normal text-grey-400"> (you)</span>}</span>
      <div className="flex flex-wrap justify-center gap-1">
        {owner && <Chip><Crown className="size-3" />Host</Chip>}
        {seat.bot && <Chip tone="dark"><Bot className="size-3" />BOT · {seat.bot}</Chip>}
        {!seat.bot && !owner && <Chip tone="dark">Player</Chip>}
      </div>
    </div>
  );
}

/** An open chair. The host can seat a bot from any open card (bots always take the next free seat). */
function OpenSeat({ code, isHost, first, onAddBot }: { code: string; isHost: boolean; first: boolean; onAddBot: (b: BotName) => void }) {
  const [bot, setBot] = useState<BotName>('steady');
  return (
    <div className={cn('flex h-44 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-3 pt-4',
      first ? 'border-white/25 bg-white/[.04]' : 'border-white/10 bg-white/[.015]')}>
      <span className="text-sm font-semibold text-grey-300">Open seat</span>
      <span className="text-xs text-grey-500">Share code <b className="tracking-widest text-grey-300">{code}</b></span>
      {isHost && (
        <div className="mt-1 flex items-center gap-1.5">
          <select value={bot} onChange={(e) => setBot(e.target.value as BotName)} aria-label="Bot style"
            className="h-8 rounded-full bg-ink-800 px-2.5 text-[13px] text-grey-100 ring-1 ring-white/15 focus:outline-none focus:ring-2 focus:ring-royal-400">
            {BOT_NAMES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <Button size="sm" onClick={() => onAddBot(bot)}><Plus className="size-3.5" />Bot</Button>
        </div>
      )}
    </div>
  );
}
