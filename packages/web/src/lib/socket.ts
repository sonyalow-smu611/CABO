import { io } from 'socket.io-client';

export const socket = io(import.meta.env.VITE_SERVER_URL); // unset = same origin (Vite proxies /socket.io in dev)
export const call = (ev: string, body: object = {}) =>
  new Promise<{ error?: string; roomId?: string; seat?: string; token?: string }>((res) => socket.emit(ev, body, res));

/** Storage can be unavailable (private mode), so every access is guarded. */
const store = {
  get: (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } },
  set: (k: string, v: string) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* not kept */ } },
};
/** The seat token survives refreshes. */
export const saved = { get: () => store.get('cabo-seat'), set: (t: string) => store.set('cabo-seat', t) };
export const savedEasy = { get: () => store.get('cabo-easy') === '1', set: (on: boolean) => store.set('cabo-easy', on ? '1' : '0') };
