# Spec: Seat vacancy & pause, game HUD, game/session summaries

## Problem Statement

When a human leaves mid-game, their seat stays occupied by nobody and the game cannot continue. Players also lack basic in-game controls and orientation (whose turn it is, what round it is, current standings, a way to call Cabo, leave or end), and nothing tells them what happened when a game or the whole session ends.

## Solution

- A player leaving (or disconnecting) vacates their seat and pauses the room. The owner decides: end the game or replace the player with a bot. Until the owner decides, the original player can rejoin or anyone can join by room code to take the seat.
- The game screen gets corner controls and info: round number, scores panel, Cabo button, Leave, End game (owner), and a gold highlight on the active player's name.
- After each game, a Game Summary screen shows the player's final hand and each player's points gained, with winners in green. When the session ends, the same screen shows final results with games won and final scores.

## User Stories

1. As a player, I want to leave a game, so that I can stop playing without breaking the game for others.
2. As a player, I want the game to pause when someone leaves, so that nobody acts on an incomplete table.
3. As a player, I want to see which seat is vacant while paused, so that I know what we are waiting on.
4. As a room owner, I want to be prompted to end the game or replace a leaver with a bot, so that play can continue.
5. As a player who left or dropped, I want to rejoin my seat with my guest token, so that I can resume where I was.
6. As a new player, I want to join a paused room by code and take the vacant seat, so that the remaining players can continue.
7. As a player taking over a seat, I want to inherit its hand, total and known cards, so that I can play it sensibly.
8. As a room owner, I want the first claim on a vacant seat to win, so that seat ownership is never ambiguous.
9. As a player, I want ownership to pass to the next human seat clockwise when the owner leaves, so that someone can still decide.
10. As a player, I want a disconnect treated the same as Leave, so that a flaky connection is recoverable by rejoining.
11. As a player, I want game actions rejected while the room is paused, so that state cannot change behind a vacancy.
12. As a player, I want the current round number (and game number) shown in a corner, so that I know where we are.
13. As a player, I want a Scores button opening everyone's session totals sorted lowest first, so that I know the standings.
14. As a player, I want a Cabo button that is only enabled when calling Cabo is legal for me, so that I cannot misclick it.
15. As a player, I want the Cabo button disabled after I have drawn or after someone else called Cabo, so that the rules are enforced visibly.
16. As a player, I want a Leave button with a confirm dialog, so that I do not pause everyone by accident.
17. As a room owner, I want an End game button with a confirm dialog, so that I can stop the session deliberately.
18. As a non-owner, I do not want to see End game, so that only the owner controls it.
19. As a player, I want the active player's name highlighted in golden yellow, so that I can see whose turn it is.
20. As a colour-blind or screen-reader player, I want a non-colour turn cue (marker / "Your turn" banner / aria-current), so that I can follow turns too.
21. As a player, after a game I want a "Game N summary" screen, so that I see the outcome.
22. As a player, I want to see my own final hand face up on the summary, so that I understand my score.
23. As a player, I want each player's points gained this game, sorted lowest first, so that I can compare.
24. As a player, I want the game winner(s) shown in green with a "Winner" label, so that winners are clear; ties all win.
25. As a player, I want each player's session total shown beside their gain, so that I know the stakes.
26. As a Cabo caller who was not lowest, I want my gain shown as "+N (incl. +10 Cabo)", so that I understand the penalty.
27. As a player landing on exactly 100, I want "total 100 → 50" shown, so that the halving does not look like a bug.
28. As a room owner, I want a Next game button on the summary, so that I can start the next deal.
29. As a player, I want a Leave game button on the summary, so that I can exit between games.
30. As a player, when the session ends I want a final results screen in the same layout, so that it feels consistent.
31. As a player, on the final screen I want each player's games won and final score, sorted by final score lowest first, so that I see the overall result.
32. As a player, I want the session winner(s) in green on the final screen, so that the overall winner is clear; ties all win.
33. As a room owner, I want a New session button on the final screen that keeps seats and bots and resets totals, games won and the game counter, so that we can play again quickly.

## Implementation Decisions

- Engine stays pure and unaware of vacancy or pausing. Pause is a server room concern.
- Room record gains per-seat status `occupied | vacant` and a derived `paused` flag (paused while any seat is vacant). The action handler rejects every game action while paused.
- Leave and socket disconnect take the same path: vacate seat, pause, emit a paused event naming the seat, prompt the owner.
- Seat claims and owner decisions are processed one at a time by the server; a request for a seat that is no longer vacant is ignored.
- Rejoin uses the existing guest token. A newcomer joining by room code is placed in the vacant seat and inherits it completely, including what that seat has peeked or spied (knowledge belongs to the seat, so view(state, seat) is unchanged).
- Replace with bot attaches a bot to the seat via the existing spawner; its memory rebuilds from the action list.
- Owner leaving: ownership passes to the next human seat clockwise.
- End game (HUD button and pause prompt share one handler) ends the whole session and records scores as they stand.
- Cabo button enabled iff legalActions for the viewer contains the Cabo call. No separate client rule.
- Turn highlight driven by the view's turn field. Paused state highlights the vacant seat.
- Scores panel = session totals from the view, sorted ascending.
- Scoring step emits a GameResult and maintains per-seat gamesWon in session state (+1 for every game winner, ties included). Type shape (from discussion prototype):

  ```ts
  type GameResult = {
    game: number; sessionOver: boolean; hands: Record<Seat, Card[]>;
    players: { seat: Seat; name: string; gained: number; total: number;
               winner: boolean; caboPenalty: boolean; halved: boolean;
               gamesWon: number; sessionWinner: boolean }[];
  };
  ```

- Game winner = lowest hand that game (ties all win), independent of gained points. Session winner = lowest final total (ties all win).
- One summary component serves both per-game and final screens, switched by sessionOver: title, sort key (gained vs total), green meaning (game winner vs session winner), extra games-won column, Next game vs New session button.
- Next game and New session are owner-only. New session keeps seats and bots, resets totals, gamesWon and the game counter.

## Testing Decisions

- Test external behaviour only, through the highest seams.
- Seam 1, Socket.IO protocol: a real server with scripted clients using the same client the bots use. Covers pause/vacancy (leave and disconnect pause, actions rejected while paused, rejoin by token, newcomer claim, owner end/bot choice, first claim wins, owner handover), Cabo legality as seen by clients, GameResult delivery, owner-only Next game and New session.
- Seam 2, scripts/simulate.ts: asserts at session end that the sum of gamesWon is at least the number of games played; halving only on exactly 100; caboPenalty only when the caller is not lowest; sessionOver only once someone exceeds 100.
- No UI tests: the HUD and summary screens are thin views over view() and GameResult.

## Out of Scope

- Everyone-presses-Ready for Next game (owner-only chosen).
- Per-game score breakdown history in the Scores panel.
- Wiping inherited seat knowledge for newcomers.
- Turn timers or automatic bot replacement on timeout.

## Further Notes

- Assumed, not confirmed: End game ends the whole session; owner leaving passes ownership clockwise.
- Still open: whether a returning original player can reclaim their seat from a bot (default: bot keeps it until session end); whether the round label also shows the game number (default: show "Game N · Round M").
