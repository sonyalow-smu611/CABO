# 15: Power cards (peek, spy, swap): one pick flow

**What to build:** After drawing a 7-12 from the draw pile, the player chooses the power (**Peek**, **Spy** or **Swap**) and then picks cards on the table using the same flow as matching. Highlighted picks can be unselected, there's a prompt saying what to pick, and Cancel leaves pick mode.
- Peek: pick one of your own cards.
- Spy: pick one card of another player.
- Swap: pick any two cards on the table, from anyone (yours and someone else's, two of one other player's, or two different players').

The power fires when the last required card is picked. Cards that can't be picked for this power are not clickable. Clicking a card while a power is available never silently keeps the drawn card instead. Reproduce the current swap bug first.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Reproduce and describe the current swap failure
- [x] Peek, spy and swap all use the shared pick mode (prompt, highlight, unselect, Cancel)
- [x] Only cards valid for the power are clickable; swap allows any two cards from any hands
- [x] Power fires on the last required pick; no accidental keep
- [x] Socket test: a scripted client swaps two cards belonging to two other players, and both hands change
