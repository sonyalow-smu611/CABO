import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Suit } from '@cabo/engine';
import { CardView } from '@/components/PlayingCard.tsx';
import type { CardSize } from '@/components/PlayingCard.tsx';
import { Seat } from '@/components/Seat.tsx';
import type { SeatInfo } from '@/components/Seat.tsx';
import { Button, Chip } from '@/components/ui.tsx';
import '@/styles.css';

/** Dev-only reference sheet: every face at every size, every card state, seats, buttons and chips. */
const VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const suitOf = (v: number, i: number): Suit => (v === 0 ? 's' : v === 13 ? 'h' : (['s', 'h', 'd', 'c'] as const)[i % 4]!);
const seat = (over: Partial<SeatInfo>): SeatInfo =>
  ({ name: 'Ana', you: false, bot: false, owner: false, total: 24, turn: false, caller: false, vacant: false, ...over });

const Row = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mb-10">
    <h2 className="mb-3 text-xs font-bold uppercase tracking-[.2em] text-grey-400">{title}</h2>
    <div className="flex flex-wrap items-end gap-3">{children}</div>
  </section>
);

function Gallery() {
  return (
    <div className="felt min-h-full p-6 md:p-10">
      <h1 className="mb-8 font-display text-4xl font-bold">Cabo design system</h1>
      {(['lg', 'md', 'sm'] as CardSize[]).map((size) => (
        <Row key={size} title={`Faces · ${size}`}>
          {VALUES.map((v, i) => <CardView key={v} flipId={`${size}${v}`} card={v} suit={suitOf(v, i)} size={size} disabled />)}
          <CardView flipId={`${size}-back`} card={null} size={size} disabled />
        </Row>
      ))}
      <Row title="States">
        <CardView flipId="s1" card={null} pickable disabled />
        <CardView flipId="s2" card={null} picked={1} disabled />
        <CardView flipId="s3" card={7} suit="d" picked={2} disabled />
        <CardView flipId="s4" card={null} dimmed disabled />
        <CardView flipId="s5" card={4} suit="c" known disabled />
        <CardView flipId="s6" card={9} suit="s" faceUp disabled />
        <CardView flipId="s7" card={5} suit="h" failed disabled />
      </Row>
      <Row title="Seats">
        <Seat info={seat({})}><span /></Seat>
        <Seat info={seat({ name: 'Bo', bot: true, turn: true })}><span /></Seat>
        <Seat info={seat({ name: 'Cy', caller: true, owner: true })}><span /></Seat>
        <Seat info={seat({ name: 'Dee', vacant: true })}><span /></Seat>
        <Seat info={seat({ name: 'Eve', result: { hand: 4, winner: true } })}><span /></Seat>
        <Seat info={seat({ name: 'Fin', result: { hand: 21, winner: false }, caller: true })}><span /></Seat>
      </Row>
      <Row title="Buttons">
        <Button variant="primary">Draw</Button><Button>Discard it</Button><Button variant="select">Match these 2</Button>
        <Button variant="cabo" size="sm">CABO</Button><Button variant="danger">End game</Button><Button variant="ghost">Leave</Button>
        <Button variant="primary" disabled>Disabled</Button>
      </Row>
      <Row title="Chips">
        <Chip>12 pts</Chip><Chip tone="dark">BOT</Chip><Chip tone="gold">YOUR TURN</Chip><Chip tone="green">Winner</Chip>
        <Chip tone="red">Left</Chip><Chip tone="royal">2</Chip>
      </Row>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Gallery /></StrictMode>);
