# 04: New matching rules

**What to build:** Matches target only cards in hands, never the held card, and must include at least one of your own cards and at most one opponent. Own-only success: you keep the held card. Success with an opponent: they receive the held card face down, unknown to them, known to you. Failure: the tried cards are revealed to everyone, you take a penalty card, and you must keep the held card. Black and red 13 match.

**Blocked by:** 01 (Card knowledge travels with the card)

**Status:** done

- [x] Illegal target sets are rejected (no own card, two opponents, held card, fewer than two)
- [x] Held card routing on success matches the rule above
- [x] After a failure only keep is legal
- [x] Emptying your hand by giving the held card away ends the game
