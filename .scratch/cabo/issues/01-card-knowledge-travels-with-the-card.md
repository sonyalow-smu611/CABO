# 01: Card knowledge travels with the card

**What to build:** Each card records which players have seen it, and that knowledge moves with the card through swaps, keeps and gives. A player's view shows every card they have seen. Bots decide from their view alone; the separate bot memory is gone.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Opening peek, kept draws, peek/spy, failed matches and penalty cards show in the right players' views only
- [x] A swapped card stays visible to whoever knew it
- [x] Cards entering the discard pile carry no stored knowledge
- [x] Bots take (view, legal, rng); bot memory deleted; simulation and tests green
