import { X } from 'lucide-react';
import type { Seat } from '@cabo/server';
import { cn } from '@/lib/cn.ts';
import type { Rail } from './Hud.tsx';
import { Avatar } from './ui.tsx';

/**
 * The right edge of the table: the event feed, or the session scores (lowest first). Docked on wide screens,
 * a drawer over the table on narrow ones.
 */
export function SideRail({ rail, setRail, log, seats, totals, me }: {
  rail: Rail | null; setRail: (r: Rail | null) => void; log: string[]; seats: Seat[]; totals: Record<string, number>; me: string;
}) {
  if (!rail) return null;
  const scores = [...seats].sort((a, b) => (totals[a.id] ?? 0) - (totals[b.id] ?? 0));
  return <>
    <div aria-hidden className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setRail(null)} />
    <aside className="fixed inset-y-0 right-0 z-40 flex w-[85%] max-w-xs flex-col border-l border-white/10 bg-chrome lg:static lg:z-auto lg:w-72 lg:max-w-none lg:bg-chrome/85">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-white/10 px-2">
        {(['log', 'scores'] as const).map((r) => (
          <button key={r} onClick={() => setRail(r)} aria-pressed={rail === r}
            className={cn('h-8 rounded-full px-3 text-[13px] font-semibold capitalize transition-colors', rail === r ? 'bg-white/10 text-white' : 'text-grey-400 hover:text-white')}>
            {r === 'log' ? 'Table log' : 'Scores'}
          </button>
        ))}
        <button onClick={() => setRail(null)} aria-label="Close panel" className="ml-auto flex size-8 items-center justify-center rounded-full text-grey-400 hover:bg-white/10 hover:text-white">
          <X className="size-4" />
        </button>
      </div>

      {rail === 'log' ? (
        <ol aria-label="Table log" aria-live="polite" className="flex-1 space-y-1 overflow-y-auto p-3">
          {log.length === 0 && <li className="text-sm text-grey-500">Moves will appear here.</li>}
          {log.map((l, i) => (
            <li key={log.length - i} className={cn('rounded-lg px-2.5 py-1.5 text-[13px] leading-snug', i === 0 ? 'bg-white/[.06] text-grey-100' : 'text-grey-400')}>{l}</li>
          ))}
        </ol>
      ) : (
        <div className="flex-1 overflow-y-auto p-3">
          <ol aria-label="Session scores" className="space-y-1">
            {scores.map((x, i) => (
              <li key={x.id} className={cn('flex items-center gap-3 rounded-xl px-3 py-2', x.id === me ? 'bg-white/[.07]' : '')}>
                <span className="w-4 text-right text-xs text-grey-500 numerals">{i + 1}</span>
                <Avatar name={x.name} bot={!!x.bot} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{x.name}{x.id === me && <span className="text-grey-400"> (you)</span>}</span>
                <span className="font-display text-lg font-bold numerals">{totals[x.id] ?? 0}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 px-3 text-xs leading-relaxed text-grey-500">Lowest total wins. Going over 100 ends the session; landing on exactly 100 halves you to 50.</p>
        </div>
      )}
    </aside>
  </>;
}
