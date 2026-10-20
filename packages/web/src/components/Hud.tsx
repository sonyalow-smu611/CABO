import { useEffect, useRef, useState } from 'react';
import { Flag, LogOut, ScrollText, Settings, Trophy } from 'lucide-react';
import { cn } from '@/lib/cn.ts';
import { Button, Wordmark } from './ui.tsx';

export type Rail = 'log' | 'scores';

/**
 * The black bar over the table. Left: where we are. Right: the Cabo call (gold, enabled only when it's legal for
 * you), the rail toggles, settings, End game (owner only) and Leave.
 */
export function Hud({ roomId, gameNo, round, canCabo, onCabo, rail, setRail, easy, toggleEasy, onEnd, onLeave }: {
  roomId: string; gameNo?: number; round?: number; canCabo: boolean; onCabo: () => void;
  rail: Rail | null; setRail: (r: Rail | null) => void; easy: boolean; toggleEasy: () => void;
  /** Absent for non-owners and once the session is over. */
  onEnd?: () => void; onLeave: () => void;
}) {
  const toggle = (r: Rail) => setRail(rail === r ? null : r);
  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-chrome px-2 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Wordmark className="hidden text-lg text-white sm:inline" />
        <span className="hidden h-5 w-px bg-white/15 sm:block" />
        <div className="flex min-w-0 flex-col leading-tight sm:flex-row sm:items-baseline sm:gap-2">
          <span className="truncate text-sm font-semibold numerals">
            {gameNo ? `Game ${gameNo}` : 'Session'}{round ? <> · <span className="sm:hidden">R</span><span className="hidden sm:inline">Round </span>{round}</> : ''}
          </span>
          <span className="whitespace-nowrap text-xs text-grey-400">Room <b className="tracking-widest text-grey-300">{roomId}</b></span>
        </div>
      </div>
      <div className="flex items-center gap-0.5 sm:gap-1">
        <Button variant="cabo" size="sm" className="mr-0.5 px-3 sm:mr-2 sm:px-4" disabled={!canCabo} onClick={onCabo}
          title={canCabo ? 'Call Cabo: this is your whole turn' : 'You can call Cabo at the start of your turn, before drawing, if nobody has yet'}>CABO</Button>
        <Button variant="ghost" size="sm" aria-pressed={rail === 'scores'} onClick={() => toggle('scores')} className={cn(rail === 'scores' && 'bg-white/10 text-white')}>
          <Trophy className="size-4" /><span className="hidden md:inline">Scores</span>
        </Button>
        <Button variant="ghost" size="sm" aria-pressed={rail === 'log'} onClick={() => toggle('log')} className={cn(rail === 'log' && 'bg-white/10 text-white')}>
          <ScrollText className="size-4" /><span className="hidden md:inline">Log</span>
        </Button>
        <SettingsMenu easy={easy} toggleEasy={toggleEasy} />
        {onEnd && <Button variant="ghost" size="sm" onClick={onEnd}><Flag className="size-4" /><span className="hidden lg:inline">End game</span></Button>}
        <Button variant="ghost" size="sm" onClick={onLeave}><LogOut className="size-4" /><span className="hidden lg:inline">Leave</span></Button>
      </div>
    </header>
  );
}

function SettingsMenu({ easy, toggleEasy }: { easy: boolean; toggleEasy: () => void }) {
  const [open, setOpen] = useState(false), ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" size="sm" aria-label="Settings" aria-expanded={open} onClick={() => setOpen((o) => !o)}><Settings className="size-4" /></Button>
      {open && (
        <div className="absolute right-0 top-10 w-72 rounded-xl bg-panel p-4 shadow-panel">
          <label className="flex cursor-pointer items-start justify-between gap-4">
            <span>
              <span className="block text-sm font-semibold">Show cards I've seen</span>
              <span className="mt-0.5 block text-xs text-grey-400">Off: a peeked card shows for a moment, then you must remember it.</span>
            </span>
            <input type="checkbox" role="switch" checked={easy} onChange={toggleEasy} className="peer sr-only" />
            <span aria-hidden className={cn('relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-royal-400',
              easy ? 'bg-select' : 'bg-white/15')}>
              <span className={cn('absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left]', easy ? 'left-[18px]' : 'left-0.5')} />
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
