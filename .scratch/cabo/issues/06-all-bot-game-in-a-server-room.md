# 06: An all-bot game runs inside a server room

**What to build:** A room holds a session and seats; every move (human or bot) goes through one submit entry point. Bots run in-process after a short delay. A test plays a full session with no UI.

**Blocked by:** 01 (Card knowledge travels with the card)

**Status:** done

- [x] Room plays deal to reveal to score with only bots
- [x] Bot moves use the same submit path humans will
- [x] Each seat is only ever sent its own view
