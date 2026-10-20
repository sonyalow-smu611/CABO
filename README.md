# Cabo

npm workspaces monorepo. Needs Node 22.18+ (runs TypeScript directly, no build step).

- `packages/engine`: pure rules (apply, legalActions, view, eventsFor) and the multi-game session scoring
- `packages/bots`: `Bot` interface (`choose(view, legal, rng)`; the view already shows every card the seat has seen), `random` and `steady` bots
- `packages/web`: React + Tailwind v4 client; renders the update it is sent, buttons come from your legal moves. Design tokens live in `src/styles.css` (shadcn-style names plus Cabo's `--felt`, `--turn`, `--win`, `--danger`, `--select`); animation components plug into the empty slots in `src/anim/slots.tsx`; `/gallery.html` (dev only) shows every card face and state
- `packages/server`: `index.ts` Socket.IO wiring (create/join/resume/addBot/start/act/next/endGame/newSession/leave/replaceWithBot, each acked; seats are taken back with a token); `Room` — seats (occupied or vacant; any vacant seat pauses the game until it is filled or the owner ends the game or brings in a bot), the owner, the session, one `act()` entry point for humans and bots (bots run in-process), per-seat updates with the game summary between games
- `scripts/simulate.ts`: bot-vs-bot soak test (3-6 players, includes blind match attempts)

```
npm install
npm test                 # engine, bots, room and socket tests
npm run typecheck
npm run simulate -- 300  # bot-vs-bot stress run

npm run dev:server       # game server on :3001
npm run dev:web          # page on http://localhost:5173 (proxies the socket to :3001)
```

Tickets live in `.scratch/cabo/issues/`.

## Deploy

The game server holds the live rooms, so it runs on a host that keeps a process up (Railway); the page is static (Vercel).

1. **Push this folder to a GitHub repo.**
2. **Upstash** (optional but recommended): create a Redis database and copy its REST URL and token.
   Without them the server still works but rooms are lost on restart.
3. **Railway**: new project from the repo, root directory = repo root. It runs `npm start`.
   Variables: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `WEB_ORIGIN` = your Vercel URL
   (e.g. `https://cabo.vercel.app`). Railway sets `PORT`. Generate a public domain for the service.
4. **Vercel**: import the same repo, root directory = repo root (it reads `vercel.json`).
   Variable: `VITE_SERVER_URL` = the Railway URL (e.g. `https://cabo-server.up.railway.app`). Redeploy after setting it.
5. Open the Vercel URL on two devices, create a room on one, join with the code on the other.
