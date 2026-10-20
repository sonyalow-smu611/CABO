import type { ComponentType } from 'react';
import { cn } from '@/lib/cn.ts';

/**
 * Mount points for UI animation components. Every slot is empty until you register a component below; the static
 * design is complete without them. A slot remounts its component whenever `fire` changes, so a component can
 * simply animate on mount (and should clean up after itself, or fade out).
 *
 * Overlay slots sit above the table with pointer-events off; give your component its own positioning inside.
 * Card movement (draw, swap, match, reveal flip) is already animated by GSAP Flip in App.tsx and CardView.
 */
export interface SlotProps {
  /** Entry screen, behind the CABO wordmark. In flow, not an overlay. */
  titleHero: Record<string, never>;
  /** Lobby: a seat card was just filled. Rendered inside that seat card. */
  seatJoin: { name: string; bot: boolean; you: boolean };
  /** Table overlay: the turn moved to another seat. */
  turnChange: { name: string; mine: boolean };
  /** Table overlay: someone used a power (its notice and card highlights are already shown). */
  powerPlayed: { power: 'peek' | 'spy' | 'swap'; name: string; mine: boolean };
  /** Table overlay: someone called Cabo; the final round starts. */
  caboCall: { name: string; mine: boolean };
  /** Table overlay: the game ended and every card is turning over. */
  reveal: { reason: 'cabo' | 'empty' };
  /** Summary panel: winners of the game (or of the session when final). */
  winner: { names: string[]; mine: boolean; final: boolean };
}
export type SlotName = keyof SlotProps;

/** Register your components here, e.g. `turnChange: MyTurnSweep`. */
export const slots: { [K in SlotName]?: ComponentType<SlotProps[K]> } = {};

export function AnimSlot<K extends SlotName>({ name, fire, props, overlay = true, className }: {
  name: K; fire: string | number; props: SlotProps[K]; overlay?: boolean; className?: string;
}) {
  const Comp = slots[name] as ComponentType<SlotProps[K]> | undefined;
  if (!Comp) return null;
  return (
    <div data-anim-slot={name} aria-hidden className={cn(overlay && 'pointer-events-none absolute inset-0 z-30', className)}>
      <Comp key={fire} {...props} />
    </div>
  );
}
