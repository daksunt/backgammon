export type Player = "human" | "ai";
export type Difficulty = "easy" | "medium" | "hard";
export type Point = { owner: Player | null; count: number };
export type Move = { from: number | "bar"; to: number | "off"; die: number; hit?: boolean };
export type GameState = {
  points: Point[];
  bar: Record<Player, number>;
  off: Record<Player, number>;
  turn: Player;
  dice: number[];
  remaining: number[];
  winner: Player | null;
  turnNumber: number;
  message: string;
};
export type Settings = { difficulty: Difficulty; customDice: boolean; humanDice: number; aiDice: number; powerRepeats: boolean; deterministic: boolean; undo: boolean };
export type RouteOption = { to: number | "off"; moves: Move[]; hits: number };

export const DEFAULT_SETTINGS: Settings = { difficulty: "medium", customDice: true, humanDice: 2, aiDice: 2, powerRepeats: true, deterministic: false, undo: true };
export const PLAYER_LABEL: Record<Player, string> = { human: "You", ai: "Rival" };
export const opponent = (player: Player): Player => player === "human" ? "ai" : "human";
export const direction = (player: Player) => player === "human" ? -1 : 1;
export const entryPoint = (player: Player, die: number) => player === "human" ? 24 - die : die - 1;
export const uniqueDice = (dice: number[]) => [...new Set(dice)];

export function emptyPoints(): Point[] { return Array.from({ length: 24 }, () => ({ owner: null, count: 0 })); }

export function initialGame(): GameState {
  const points = emptyPoints();
  const place = (index: number, owner: Player, count: number) => (points[index] = { owner, count });
  place(23, "human", 2); place(12, "human", 5); place(7, "human", 3); place(5, "human", 5);
  place(0, "ai", 2); place(11, "ai", 5); place(16, "ai", 3); place(18, "ai", 5);
  return { points, bar: { human: 0, ai: 0 }, off: { human: 0, ai: 0 }, turn: "human", dice: [], remaining: [], winner: null, turnNumber: 1, message: "Your opening roll." };
}

export function cloneGame(game: GameState): GameState {
  return { ...game, points: game.points.map(point => ({ ...point })), bar: { ...game.bar }, off: { ...game.off }, dice: [...game.dice], remaining: [...game.remaining] };
}

export function canBearOff(game: GameState, player: Player) {
  if (game.bar[player] > 0) return false;
  return game.points.every((point, index) => point.owner !== player || (player === "human" ? index <= 5 : index >= 18));
}

export function legalMovesForDie(game: GameState, player: Player, die: number): Move[] {
  if (!Number.isInteger(die) || die < 1 || die > 6) return [];
  const rival = opponent(player);
  if (game.bar[player] > 0) {
    const to = entryPoint(player, die), target = game.points[to];
    if (target.owner === rival && target.count >= 2) return [];
    return [{ from: "bar", to, die, hit: target.owner === rival && target.count === 1 }];
  }
  const moves: Move[] = [], bearing = canBearOff(game, player);
  for (let from = 0; from < 24; from += 1) {
    const source = game.points[from];
    if (source.owner !== player || source.count === 0) continue;
    const to = from + direction(player) * die;
    if (to >= 0 && to < 24) {
      const target = game.points[to];
      if (!(target.owner === rival && target.count >= 2)) moves.push({ from, to, die, hit: target.owner === rival && target.count === 1 });
      continue;
    }
    if (!bearing) continue;
    const exact = player === "human" ? from === die - 1 : 24 - from === die;
    const fartherChecker = game.points.some((point, index) => point.owner === player && (player === "human" ? index > from : index < from));
    if (exact || !fartherChecker) moves.push({ from, to: "off", die });
  }
  return moves;
}

function sameMove(a: Move, b: Move) { return a.from === b.from && a.to === b.to && a.die === b.die; }

export function applyMove(game: GameState, player: Player, move: Move): GameState {
  if (!game.remaining.includes(move.die)) throw new Error(`Die ${move.die} is not available`);
  const legal = legalMovesForDie(game, player, move.die).find(candidate => sameMove(candidate, move));
  if (!legal) throw new Error("Illegal move");
  const next = cloneGame(game), rival = opponent(player);
  if (move.from === "bar") next.bar[player] -= 1;
  else { const source = next.points[move.from]; source.count -= 1; if (source.count === 0) source.owner = null; }
  if (move.to === "off") next.off[player] += 1;
  else {
    const target = next.points[move.to];
    if (target.owner === rival && target.count === 1) { next.bar[rival] += 1; target.owner = player; target.count = 1; }
    else { target.owner = player; target.count += 1; }
  }
  next.remaining.splice(next.remaining.indexOf(move.die), 1);
  if (next.off[player] === 15) { next.winner = player; next.message = `${PLAYER_LABEL[player]} bear off all 15 checkers.`; }
  else if (legal.hit) next.message = `${PLAYER_LABEL[player]} hit a blot with ${move.die}.`;
  else if (move.to === "off") next.message = `${PLAYER_LABEL[player]} bear off a checker.`;
  else next.message = `${PLAYER_LABEL[player]} played ${move.die}.`;
  return next;
}

export function anyLegalMove(game: GameState, player: Player) { return uniqueDice(game.remaining).some(die => legalMovesForDie(game, player, die).length > 0); }

export function maxPlayableDice(game: GameState, player: Player, memo = new Map<string, number>()): number {
  if (!game.remaining.length) return 0;
  const boardKey = game.points.map(point => point.owner ? `${point.owner[0]}${point.count}` : "-").join("|");
  const key = `${player}/${boardKey}/${game.bar.human},${game.bar.ai}/${game.off.human},${game.off.ai}/${game.remaining.slice().sort().join("")}`;
  const cached = memo.get(key); if (cached !== undefined) return cached;
  let best = 0;
  for (const die of uniqueDice(game.remaining)) for (const move of legalMovesForDie(game, player, die)) best = Math.max(best, 1 + maxPlayableDice(applyMove(game, player, move), player, memo));
  memo.set(key, best); return best;
}

export function ruleCompliantMoves(game: GameState, player: Player): Move[] {
  const candidates = uniqueDice(game.remaining).flatMap(die => legalMovesForDie(game, player, die));
  if (candidates.length < 2 || game.remaining.length > 4) return candidates;
  const memo = new Map<string, number>();
  const scored = candidates.map(move => ({ move, plays: 1 + maxPlayableDice(applyMove(game, player, move), player, memo) }));
  const maximum = Math.max(...scored.map(item => item.plays));
  let allowed = scored.filter(item => item.plays === maximum).map(item => item.move);
  if (maximum === 1 && uniqueDice(game.remaining).length > 1) { const highest = Math.max(...allowed.map(move => move.die)); allowed = allowed.filter(move => move.die === highest); }
  return allowed;
}

export function prefersRoute(candidate: RouteOption, existing: RouteOption) {
  if ((candidate.moves.length === 1) !== (existing.moves.length === 1)) return candidate.moves.length === 1;
  if (candidate.moves.length !== existing.moves.length) return candidate.moves.length < existing.moves.length;
  for (let index = 0; index < candidate.moves.length; index += 1) if (candidate.moves[index].die !== existing.moves[index].die) return candidate.moves[index].die > existing.moves[index].die;
  return candidate.hits > existing.hits;
}

export function allRoutesFromSource(game: GameState, player: Player, source: number | "bar"): RouteOption[] {
  const best = new Map<string, RouteOption>();
  const visit = (preview: GameState, current: number | "bar", moves: Move[], hits: number) => {
    for (const die of uniqueDice(preview.remaining).sort((a, b) => b - a)) {
      const move = legalMovesForDie(preview, player, die).find(candidate => candidate.from === current);
      if (!move) continue;
      const route = [...moves, move], option = { to: move.to, moves: route, hits: hits + (move.hit ? 1 : 0) } satisfies RouteOption;
      const previous = best.get(String(move.to)); if (!previous || prefersRoute(option, previous)) best.set(String(move.to), option);
      if (move.to !== "off") { const next = applyMove(preview, player, move); if (!next.winner) visit(next, move.to, route, option.hits); }
    }
  };
  visit(game, source, [], 0); return [...best.values()];
}

export function expandDice(raw: number[], powerRepeats: boolean) {
  if (!powerRepeats) return [...raw];
  const counts = raw.reduce<Record<number, number>>((all, die) => ({ ...all, [die]: (all[die] || 0) + 1 }), {}), expanded: number[] = [];
  for (const die of raw) for (let index = 0; index < (counts[die] > 1 ? 2 : 1); index += 1) expanded.push(die);
  return expanded;
}

export function rollDice(count: number, preset: number[], deterministic: boolean, powerRepeats: boolean) {
  const raw = Array.from({ length: count }, (_, index) => deterministic ? preset[index] ?? 1 : Math.floor(Math.random() * 6) + 1);
  return { raw, expanded: expandDice(raw, powerRepeats) };
}

export function positionScore(game: GameState, player: Player) {
  const rival = opponent(player); let score = game.off[player] * 120 - game.off[rival] * 110 - game.bar[player] * 42 + game.bar[rival] * 38;
  game.points.forEach((point, index) => { if (!point.owner) return; const value = (point.owner === "human" ? 23 - index : index) * point.count; score += point.owner === player ? value : -value * .9; if (point.count >= 2) score += point.owner === player ? 8 : -7; if (point.count === 1) score += point.owner === player ? -5 : 4; });
  return score;
}

export function chooseAiMove(game: GameState, difficulty: Difficulty): Move | null {
  const moves = ruleCompliantMoves(game, "ai"); if (!moves.length) return null;
  if (difficulty === "easy") return moves[Math.floor(Math.random() * moves.length)];
  const scored = moves.map(move => { const after = applyMove(game, "ai", move); let score = positionScore(after, "ai") + (move.hit ? 24 : 0) + (move.to === "off" ? 32 : 0); if (difficulty === "hard") { const replies = [1,2,3,4,5,6].flatMap(die => legalMovesForDie(after, "human", die)); const worst = replies.reduce((value, reply) => Math.max(value, positionScore(applyMove({ ...after, remaining: [reply.die] }, "human", reply), "human")), 0); score -= worst * .14; } return { move, score: score + Math.random() * .4 }; });
  scored.sort((a, b) => b.score - a.score); return scored[0].move;
}

export function pipCount(game: GameState, player: Player) { let total = game.bar[player] * 25; game.points.forEach((point, index) => { if (point.owner === player) total += point.count * (player === "human" ? index + 1 : 24 - index); }); return total; }
export function victoryPoints(game: GameState, winner: Player) { const loser = opponent(winner); if (game.off[loser] > 0) return 1; const home = game.bar[loser] > 0 || game.points.some((point, index) => point.owner === loser && (winner === "human" ? index <= 5 : index >= 18)); return home ? 3 : 2; }
export function victoryName(points: number) { return points === 3 ? "BACKGAMMON" : points === 2 ? "MARS · GAMMON" : "SINGLE WIN"; }

export function invariantErrors(game: GameState): string[] {
  const errors: string[] = [];
  if (game.points.length !== 24) errors.push("board must contain 24 points");
  game.points.forEach((point, index) => { if (!Number.isInteger(point.count) || point.count < 0) errors.push(`point ${index} has invalid count`); if ((point.count === 0) !== (point.owner === null)) errors.push(`point ${index} ownership/count mismatch`); });
  for (const player of ["human", "ai"] as Player[]) { const total = game.points.reduce((sum, point) => sum + (point.owner === player ? point.count : 0), 0) + game.bar[player] + game.off[player]; if (total !== 15) errors.push(`${player} owns ${total}, expected 15`); if (![game.bar[player], game.off[player]].every(value => Number.isInteger(value) && value >= 0 && value <= 15)) errors.push(`${player} bar/off invalid`); }
  if (![...game.dice, ...game.remaining].every(die => Number.isInteger(die) && die >= 1 && die <= 6)) errors.push("dice values must be 1..6");
  if (game.winner && game.off[game.winner] !== 15) errors.push("winner must have 15 borne off");
  if (!Number.isInteger(game.turnNumber) || game.turnNumber < 1) errors.push("turn number must be positive");
  return errors;
}
