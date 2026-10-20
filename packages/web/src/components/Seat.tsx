import type { CSSProperties, ReactNode } from 'react';
import { Crown, Star } from 'lucide-react';
import { cn } from '@/lib/cn.ts';
import { Avatar, Chip } from './ui.tsx';

export interface SeatInfo {
  name: string;
  you: boolean;
  bot: boolean;
  owner: boolean;
  /** Session total before this game. */
  total: number;
  /** Their turn, or (while paused) the empty seat everyone is waiting on. */
  turn: boolean;
  caller: boolean;
  vacant: boolean;
  /** At the reveal: hand total and whether it won. */
  result?: { hand: number; winner: boolean };
}

/**
 * A player's place at the table: name plate above their cards. The turn shows as a gold ring, a ▶ marker and
 * aria-current, so colour is never the only cue; an empty seat is a dashed chair.
 */
export function Seat({ info, children, plateBelow, notice, className, style }: {
  info: SeatInfo; children: ReactNode; plateBelow?: boolean; className?: string; style?: CSSProperties;
  /** A short-lived announcement by this seat (a power they just used). */
  notice?: ReactNode;
}) {
  const { name, you, bot, owner, total, turn, caller, vacant, result } = info;
  return (
    <section aria-label={`${name}${you ? ' (you)' : ''}`} style={style} className={cn('relative flex items-center gap-2', plateBelow ? 'flex-col-reverse' : 'flex-col', className)}>
      {notice && (
        // Opponents: just below their cards, towards the middle. You: beside your plate (above your hand on phones).
        <div className={cn('pointer-events-none absolute z-30', plateBelow
          ? 'bottom-full left-1/2 mb-2 -translate-x-1/2 md:bottom-0 md:left-full md:mb-0 md:ml-4 md:translate-x-0'
          : 'left-1/2 top-full mt-2 -translate-x-1/2')}>{notice}</div>
      )}
      <div aria-current={turn ? 'true' : undefined}
        className={cn('flex max-w-full items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-[box-shadow,background-color]',
          vacant ? 'bg-transparent outline-2 outline-dashed outline-danger/80' : 'bg-chrome/80 ring-1 ring-white/10',
          turn && !vacant && 'bg-chrome ring-2 ring-turn shadow-[0_0_24px_-4px_rgb(243_201_74/.55)]',
          result?.winner && 'ring-2 ring-win')}>
        <Avatar name={name} bot={bot} size="sm" className={cn(vacant && 'opacity-40')} />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className={cn('flex items-center gap-1 truncate text-[13px] font-semibold', turn && !vacant && 'text-turn')}>
            {turn && <span aria-hidden className="text-[10px]">▶</span>}
            <span className="truncate">{name}</span>
            {you && <span className="font-normal text-grey-400">(you)</span>}
            {owner && <Crown aria-label="Room owner" className="size-3 shrink-0 text-grey-300" />}
          </span>
          <span className="text-[11px] text-grey-400 numerals">
            {vacant ? <span className="font-semibold text-danger">Left · waiting</span> : <>{total} pts</>}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {bot && <Chip tone="dark">BOT</Chip>}
          {caller && <Chip tone="gold">CABO</Chip>}
          {result && <Chip tone={result.winner ? 'green' : 'dark'}>{result.winner && <Star className="size-3 fill-current" aria-label="Winner" />}{result.hand}</Chip>}
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5 md:gap-2 [perspective:600px]">{children}</div>
    </section>
  );
}
