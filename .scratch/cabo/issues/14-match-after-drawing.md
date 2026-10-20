# 14: Match after drawing: a clear Match button and pick flow

**What to build:** After drawing a card (from either pile), the player sees a **Match** button. Pressing it enters pick mode with a prompt to pick the cards to pair off. Clicked cards are highlighted and can be clicked again to unselect. A confirm button ("Match these N") sends the match; Cancel leaves pick mode. A correct match of the player's own cards discards them and puts the drawn card into their hand. A wrong match explains why it failed and that a penalty card was taken. While picking, clicking a card never triggers "keep the drawn card" by accident.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Match button shown after drawing, whenever matching is still allowed this turn (not after a failed match)
- [x] Pick mode: prompt, highlighted picks, click again to unselect, Cancel
- [x] Confirm button stays (2+ cards, including at most one other player's card, as the rules allow), disabled below 2 picks
- [x] Correct own-pair match: both cards go to the discard pile, the drawn card ends up in the hand
- [x] Wrong match: the player is told it failed and that they took a penalty card
- [x] Clicking a card in pick mode never keeps the drawn card
- [x] Socket test: a scripted client draws, matches its own pair, and ends with the drawn card in hand and both pair cards discarded
