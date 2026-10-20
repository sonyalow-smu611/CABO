import type { GameEvent } from '@cabo/engine';
import { label } from './cards.ts';

/** One line of the table log. Secrets show only for the player they were meant for. */
export function describe(e: GameEvent, n: (id?: string) => string): string {
  const what: Record<GameEvent['type'], string> = {
    start: 'starts', end: 'Game over', reshuffle: 'Discard pile reshuffled into the draw pile',
    draw: `drew from the ${e.from === 'discard' ? 'discard pile' : 'draw pile'}`,
    discard: `discarded ${label(e.card)}`, keep: 'kept the card', peek: 'peeked at a card',
    spy: `spied on ${n(e.target)}`, swap: `swapped a card of ${n(e.owners?.[0])} with one of ${n(e.owners?.[1])}`,
    match: e.ok ? 'matched!' : 'failed a match', give: `gave the held card to ${n(e.to)}`,
    penalty: 'took a penalty card', cabo: 'called CABO',
  };
  const seen = e.secret ? ` (you saw ${label(e.secret.card)})` : '';
  return e.player && e.type !== 'end' && e.type !== 'reshuffle' ? `${n(e.player)} ${what[e.type]}${seen}` : what[e.type];
}
