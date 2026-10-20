import { useLayoutEffect, useRef } from 'react';
import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import { gsap } from 'gsap';
import { ArrowLeftRight, Eye, Search } from 'lucide-react';
import type { Card, Power, Suit } from '@cabo/engine';
import { cn } from '@/lib/cn.ts';
import { PIPS, POWER_LABEL, SUIT_GLYPH, index, isRed, powerHint, spoken, suitFor } from '@/lib/cards.ts';
import { paced, reduced } from '@/lib/motion.ts';

export type CardSize = 'sm' | 'md' | 'lg';
const SIZE: Record<CardSize, string> = {
  sm: 'w-10 h-14 rounded-[6px] md:w-12 md:h-[67px]',
  md: 'w-[60px] h-[84px] rounded-lg md:w-[70px] md:h-[98px]',
  lg: 'w-[62px] h-[87px] rounded-lg md:w-[84px] md:h-[118px]',
};
const POWER_ICON: Record<Power, typeof Eye> = { peek: Eye, spy: Search, swap: ArrowLeftRight };

export type CardViewProps = {
  /** The card's uid. data-flip-id lets GSAP Flip glide it between hands, the held spot and the discard pile. */
  flipId: number | string;
  /** null = drawn face down (the navy back). */
  card: Card | null;
  suit?: Suit | null;
  size?: CardSize;
  /** Pick mode: this card can be chosen. */
  pickable?: boolean;
  /** Pick mode: chosen, in this order (1, 2). */
  picked?: number;
  /** Pick mode: this card can't be chosen. */
  dimmed?: boolean;
  /** Face up on the table for good (taken from the discard pile). */
  faceUp?: boolean;
  /** Face down, but you've seen it: shown for a moment (or always in "show cards I've seen"). */
  known?: boolean;
  /** Part of a failed match a moment ago. */
  failed?: boolean;
  /** Just peeked at, spied on or swapped: lit up for everyone at the table. */
  spotlight?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;

/**
 * One card on the table: a button, so pick mode works by keyboard as well.
 * Two animations, on two elements: GSAP Flip glides the button (data-flip-id) between hands and piles, and the inner
 * span turns over when the face changes. On one shared element they fight over `transform` (a reveal or a new deal
 * does both at once): Flip takes over mid-turn and the card is left edge-on.
 */
export function CardView({ flipId, card, suit, size = 'lg', pickable, picked, dimmed, faceUp, known, failed, spotlight, className, ...rest }: CardViewProps) {
  const turner = useRef<HTMLSpanElement>(null);
  const shows = card === null ? '?' : `${card}${suit ?? ''}`, last = useRef(shows);
  useLayoutEffect(() => { // turn the card over when what it shows changes
    if (last.current !== shows && !reduced) gsap.fromTo(turner.current, { rotateY: 90 }, { rotateY: 0, duration: paced(0.25), ease: 'power1.out' });
    last.current = shows;
  }, [shows]);

  return (
    <button data-flip-id={flipId} type="button"
      aria-label={rest['aria-label'] ?? (card === null ? 'Face-down card' : spoken(card, suit))}
      className={cn('relative shrink-0 select-none [perspective:600px] transition-[translate,opacity,box-shadow,outline-color] duration-150 ease-out',
        SIZE[size],
        faceUp && 'outline-1 outline-offset-2 outline-dashed outline-grey-300/60',
        spotlight && '-translate-y-1 ring-[3px] ring-turn shadow-[0_0_24px_-2px_rgb(243_201_74/.75)]',
        pickable && 'cursor-pointer outline-2 outline-offset-2 outline-solid outline-white/90 -translate-y-1 hover:-translate-y-2',
        picked && 'outline-none -translate-y-3 shadow-lift ring-[3px] ring-select',
        failed && 'ring-[3px] ring-danger',
        dimmed && 'opacity-45',
        className)}
      {...rest}>
      <span ref={turner} className="absolute inset-0 rounded-[inherit] shadow-card">
        {card === null ? <Back size={size} /> : <Face card={card} suit={suitFor(card, suit)} size={size} />}
      </span>
      {picked != null && (
        <span className="absolute -top-2.5 left-1/2 flex size-5 -translate-x-1/2 items-center justify-center rounded-full bg-select text-[11px] font-bold text-white shadow ring-2 ring-navy-900">{picked}</span>
      )}
      {known && !faceUp && card !== null && (
        <span title="Only you can see this" className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-ink-900 text-grey-200 ring-1 ring-white/20">
          <Eye className="size-3" aria-hidden />
        </span>
      )}
    </button>
  );
}

/** The navy back: a white lattice inside a white border, with the monogram. */
function Back({ size }: { size: CardSize }) {
  return (
    <span aria-hidden className="card-back absolute inset-0 overflow-hidden rounded-[inherit] ring-1 ring-black/40">
      <span className={cn('absolute rounded-[4px] border border-white/75', size === 'sm' ? 'inset-[2px]' : 'inset-[4px]')} />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className={cn('flex items-center justify-center rounded-full bg-navy-800 font-display font-extrabold text-white ring-1 ring-white/80',
          size === 'sm' ? 'size-4 text-[9px]' : 'size-7 text-sm md:size-8 md:text-base')}>C</span>
      </span>
    </span>
  );
}

/** A face: value indices in two corners, pips for 1-10, one large suit for 11, 12, 13 and 0, and the power in the free bottom-left corner on 7-12. */
function Face({ card, suit, size }: { card: Card; suit: Suit; size: CardSize }) {
  const red = isRed(suit), glyph = SUIT_GLYPH[suit], power = powerHint(card), Icon = power && POWER_ICON[power];
  const pips = PIPS[card];
  const corner = size === 'sm' ? 'text-[10px] md:text-[12px]' : size === 'md' ? 'text-[11px] md:text-[13px]' : 'text-[12px] md:text-[15px]';
  return (
    <span aria-hidden className={cn('absolute inset-0 overflow-hidden rounded-[inherit] bg-face ring-1 ring-black/10', red ? 'text-face-red' : 'text-face-ink')}>
      <Corner value={index(card)} glyph={glyph} className={cn('left-[6%] top-[4%]', corner)} />
      {size !== 'sm' && <Corner value={index(card)} glyph={glyph} className={cn('bottom-[4%] right-[6%] rotate-180', corner)} />}

      {size === 'sm' ? (
        <span className="absolute inset-x-0 bottom-[12%] top-[34%] flex items-center justify-center text-[22px] md:text-[26px] leading-none">{glyph}</span>
      ) : pips ? (
        <span className="absolute inset-x-[33%] bottom-[19%] top-[19%]">
          {pips.map(([col, row], i) => (
            <span key={i} className={cn('absolute -translate-x-1/2 -translate-y-1/2 leading-none',
              card === 1 ? 'text-[30px] md:text-[40px]' : size === 'md' ? 'text-[10px] md:text-[12px]' : 'text-[11px] md:text-[15px]',
              row > 3 && 'rotate-180')}
              style={{ left: `${col * 50}%`, top: `${(row / 6) * 100}%` }}>{glyph}</span>
          ))}
        </span>
      ) : (
        <span className={cn('absolute inset-0 flex items-center justify-center leading-none',
          size === 'md' ? 'text-[34px] md:text-[42px]' : 'text-[36px] md:text-[52px]')}>{glyph}</span>
      )}

      {power && Icon && (size === 'sm' ? (
        <span className="absolute inset-x-0 bottom-[6%] flex justify-center"><Icon className="size-2.5 text-grey-500 md:size-3" /></span>
      ) : (
        <span className="absolute bottom-[4%] left-[6%] flex items-center gap-[2px] font-sans text-[7px] font-bold uppercase tracking-[.06em] text-grey-500 md:text-[8px]">
          <Icon className="size-2 md:size-2.5" strokeWidth={2.5} />{POWER_LABEL[power]}
        </span>
      ))}
    </span>
  );
}

const Corner = ({ value, glyph, className }: { value: string; glyph: string; className: string }) => (
  <span className={cn('absolute flex flex-col items-center leading-[.9]', className)}>
    <span className={cn('font-sans font-bold numerals', value.length > 1 ? 'tracking-[-.09em]' : '')}>{value}</span>
    <span className="text-[.8em]">{glyph}</span>
  </span>
);

/** A card picture that isn't on the table: the title screen fan, the summary hand. Not a Flip target. */
export const CardArt = ({ card, suit, size = 'md', className, style }: {
  card: Card | null; suit?: Suit | null; size?: CardSize; className?: string; style?: CSSProperties;
}) => (
  <span role="img" aria-label={card === null ? 'Card back' : spoken(card, suit)} style={style} className={cn('relative block shrink-0 shadow-card', SIZE[size], className)}>
    {card === null ? <Back size={size} /> : <Face card={card} suit={suitFor(card, suit)} size={size} />}
  </span>
);

/** An empty spot on the table (an empty discard pile). */
export const CardSpot = ({ size = 'md', label }: { size?: CardSize; label?: string }) => (
  <span className={cn('flex items-center justify-center border border-dashed border-white/20 text-[10px] uppercase tracking-wider text-grey-400', SIZE[size])}>{label}</span>
);
