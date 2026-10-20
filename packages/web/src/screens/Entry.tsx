import { useState } from 'react';
import { AnimSlot } from '@/anim/slots.tsx';
import { CardArt } from '@/components/PlayingCard.tsx';
import { Button, Panel, Wordmark } from '@/components/ui.tsx';
import { cn } from '@/lib/cn.ts';

/** The title screen: wordmark over a fanned hand, then one panel to create a table or join one by code. */
export function Entry({ name, setName, code, setCode, onCreate, onJoin, error }: {
  name: string; setName: (s: string) => void; code: string; setCode: (s: string) => void;
  onCreate: () => void; onJoin: () => void; error: string;
}) {
  return (
    <div className="felt relative flex min-h-full flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="table-rail pointer-events-none absolute inset-x-[-10%] top-[8%] bottom-[-30%] hidden md:block" />
      <AnimSlot name="titleHero" fire="title" props={{}} />

      <div className="relative flex flex-col items-center">
        <div aria-hidden className="relative mb-6 h-24 w-56 md:h-28">
          {[-24, -12, 0, 12, 24].map((deg, i) => (
            <CardArt key={deg} card={i === 2 ? 0 : null} suit="s" size="md"
              className="absolute bottom-0 left-1/2 -ml-[30px] origin-bottom md:-ml-[35px]"
              style={{ rotate: `${deg}deg`, translate: `${(i - 2) * 6}px ${Math.abs(i - 2) * 4}px`, zIndex: i === 2 ? 5 : i }} />
          ))}
        </div>
        <h1><Wordmark className="text-6xl text-white drop-shadow-[0_4px_24px_rgb(0_0_0/.5)] md:text-8xl" /></h1>
        <p className="mt-3 text-center text-sm text-grey-300 md:text-base">Remember your cards. Keep your score low. Call it before they do.</p>
      </div>

      <Panel className="relative mt-10 w-full max-w-md p-6">
        <label className="block text-xs font-semibold uppercase tracking-[.14em] text-grey-400" htmlFor="name">Your name</label>
        <input id="name" placeholder="e.g. Ana" maxLength={20} value={name} autoComplete="nickname"
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onCreate()}
          className="mt-2 h-12 w-full rounded-xl bg-ink-800 px-4 text-base text-white ring-1 ring-white/15 placeholder:text-grey-500 focus:outline-none focus:ring-2 focus:ring-royal-400" />
        <Button variant="primary" size="lg" className="mt-4 w-full" onClick={onCreate}>Create a table</Button>

        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[.14em] text-grey-500">
          <span className="h-px flex-1 bg-white/10" />or join a table<span className="h-px flex-1 bg-white/10" />
        </div>
        <div className="flex items-center gap-3">
          <CodeInput value={code} onChange={setCode} onEnter={() => code.length === 4 && onJoin()} />
          <Button size="lg" className="flex-1" disabled={code.length !== 4} onClick={onJoin}>Join</Button>
        </div>
        {error && <p role="alert" className="mt-4 rounded-lg bg-danger/15 px-3 py-2 text-sm text-red-300 ring-1 ring-danger/40">{error}</p>}
      </Panel>
    </div>
  );
}

/** Four letter boxes over one real input, so typing, pasting and screen readers all just work. */
function CodeInput({ value, onChange, onEnter }: { value: string; onChange: (s: string) => void; onEnter: () => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <label className="relative flex gap-1.5">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} aria-hidden className={cn('flex h-12 w-10 items-center justify-center rounded-xl bg-ink-800 font-display text-2xl font-bold text-white ring-1 ring-white/15',
          focused && i === Math.min(value.length, 3) && 'ring-2 ring-royal-400')}>{value[i] ?? ''}</span>
      ))}
      <input aria-label="Room code" value={value} maxLength={4} autoCapitalize="characters" autoComplete="off" spellCheck={false}
        onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
        onKeyDown={(e) => e.key === 'Enter' && onEnter()} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        className="absolute inset-0 cursor-text opacity-0" />
    </label>
  );
}
