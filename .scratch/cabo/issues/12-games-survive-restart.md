# 12: Games survive a server restart

**What to build:** Active rooms are stored in Redis (Upstash) and restored after a restart.

**Blocked by:** 08 (Friends join by room code and can reconnect)

**Status:** done

- [x] Restarting the server mid-game loses no state
- [x] Players reconnect into the same game
