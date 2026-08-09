# Backgammon Studio invariants

## State

- The board always has 24 points. Each point has one owner or is empty; counts are non-negative integers and an empty point has count zero.
- Each player always owns exactly 15 checkers across the board, bar, and borne-off tray.
- Bar and borne-off counts stay between 0 and 15. Dice values stay between 1 and 6.
- A winner exists only after that player has borne off all 15 checkers.

## Legal movement

- Human checkers move toward lower point numbers; AI checkers move toward higher numbers.
- A player with checkers on the bar must enter them before moving any board checker.
- A checker cannot land on a point occupied by two or more opposing checkers.
- Landing on one opposing checker captures it and transfers exactly that checker to the opponent’s bar.
- Every atomic move consumes exactly one matching available die and conserves both players’ 15 checkers.
- A displayed destination is reachable by a sequence of individually legal atomic moves by the selected checker.
- Intermediate landings apply captures and blocks; a multi-step destination never jumps through an illegal intermediate landing.

## Destination and dice choice

- The UI never asks the player to choose dice. It shows every reachable destination for the selected checker.
- When one die reaches a destination, that single die always wins over every multi-die combination.
- Otherwise the route consuming fewer dice wins; equal-length combinations use larger dice first. Captures break only otherwise-equal ties.
- The destination label lists the exact dice that will be consumed, and each listed die is consumed once.
- Power repeats double every die belonging to a matching group: two matches create 4 plays, three create 6, and four create 8. Non-matching dice remain single plays.
- In Director Dice mode, every selector independently accepts a fixed value or Random; Random is resolved to a valid 1–6 roll before it enters game state.

## Bearing off

- Bearing off opens only when the player has no checker on the bar and every checker still on the board is inside that player’s six-point home board.
- Exact rolls bear off. Oversized rolls bear off only from the farthest occupied home point.
- A legal multi-die sequence may move one checker through the home board and then bear it off.

## Turns, AI, undo, and scoring

- Non-deterministic human turns roll automatically; deterministic turns wait for confirmation of the selected dice.
- AI choices are members of the legal move set. A turn ends only when its dice are exhausted or no legal move remains.
- Undo restores a complete prior snapshot without changing checker totals.
- Normal wins award 1 point; Mars/Gammon awards 2 when the loser bore off none; Backgammon awards 3 when that loser also remains on the bar or in the winner’s home board.
- Match points are recorded once per completed game and persisted locally.
