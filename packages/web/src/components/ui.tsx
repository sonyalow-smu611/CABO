import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn.ts';

/**
 * primary: the main move (white on black chrome) · secondary: the other choices · ghost: HUD and quiet controls
 * cabo / start: gold, the table's signal colour · danger: destructive confirms · select: confirm a pick (royal)
 */
const VARIANT = {
  primary: 'bg-primary text-primary-foreground enabled:hover:bg-white shadow-[0_1px_0_rgb(255_255_255/.4)_inset]',
  secondary: 'bg-white/[.06] text-foreground ring-1 ring-inset ring-white/15 enabled:hover:bg-white/[.12]',
  ghost: 'text-grey-300 enabled:hover:bg-white/[.08] enabled:hover:text-foreground',
  cabo: 'bg-turn text-turn-ink font-bold tracking-[.18em] enabled:hover:brightness-105 shadow-[0_0_0_1px_rgb(0_0_0/.2)_inset,0_6px_20px_-6px_rgb(243_201_74/.55)]',
  danger: 'bg-danger text-white enabled:hover:brightness-110',
  select: 'bg-select text-white enabled:hover:bg-royal-400',
} as const;
const SIZE = { sm: 'h-8 px-3 text-[13px] gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-12 px-6 text-base gap-2' } as const;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANT; size?: keyof typeof SIZE };
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ variant = 'secondary', size = 'md', className, ...rest }, ref) => (
  <button ref={ref} className={cn(
    'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full font-semibold transition-[background-color,color,filter,opacity]',
    'disabled:opacity-35 disabled:saturate-50',
    VARIANT[variant], SIZE[size], className)} {...rest} />
));

/** Black chrome panel: dock, dialogs, summary, rail. */
export const Panel = ({ className, ...rest }: HTMLAttributes<HTMLDivElement>) =>
  <div className={cn('rounded-2xl bg-panel/95 text-card-foreground shadow-panel backdrop-blur', className)} {...rest} />;

/** A small rounded label on seats and rows. */
export const Chip = ({ tone = 'grey', className, children }: { tone?: 'grey' | 'gold' | 'green' | 'red' | 'royal' | 'dark'; className?: string; children: ReactNode }) => (
  <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4 numerals', {
    grey: 'bg-white/10 text-grey-200', dark: 'bg-black/50 text-grey-200 ring-1 ring-white/10',
    gold: 'bg-turn text-turn-ink', green: 'bg-win text-ink-950', red: 'bg-danger text-white', royal: 'bg-select text-white',
  }[tone], className)}>{children}</span>
);

/** A centred modal over everything, for confirms. */
export function Dialog({ title, children, actions, tone }: { title: string; children: ReactNode; actions: ReactNode; tone?: 'danger' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <Panel role="dialog" aria-modal="true" aria-labelledby="dialog-title"
        className={cn('w-full max-w-sm p-6', tone === 'danger' && 'border-t-4 border-danger')}>
        <h2 id="dialog-title" className="font-display text-xl font-bold">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-grey-300">{children}</div>
        <div className="mt-6 flex justify-end gap-2">{actions}</div>
      </Panel>
    </div>
  );
}

/** The player's initial in a disc. Bots get the navy disc, humans white. */
export const Avatar = ({ name, bot, size = 'md', className }: { name: string; bot?: boolean; size?: 'sm' | 'md' | 'lg'; className?: string }) => (
  <span aria-hidden className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold',
    bot ? 'bg-navy-600 text-grey-100 ring-1 ring-white/20' : 'bg-grey-100 text-ink-950',
    { sm: 'size-7 text-sm', md: 'size-9 text-base', lg: 'size-14 text-2xl' }[size], className)}>
    {(name.trim()[0] ?? '?').toUpperCase()}
  </span>
);

export const Wordmark = ({ className }: { className?: string }) =>
  <span className={cn('font-display font-extrabold tracking-[.12em]', className)}>CABO</span>;
