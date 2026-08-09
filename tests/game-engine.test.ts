import assert from "node:assert/strict";
import test from "node:test";
import {
  allRoutesFromSource, anyLegalMove, applyMove, canBearOff, chooseAiMove, cloneGame,
  emptyPoints, expandDice, initialGame, invariantErrors, legalMovesForDie, opponent,
  rollDice, victoryPoints,
  type GameState, type Player,
} from "../app/game-engine.ts";

function state(options: {
  human?: Record<number, number>; ai?: Record<number, number>;
  humanBar?: number; aiBar?: number; humanOff?: number; aiOff?: number;
  remaining?: number[]; turn?: Player;
}): GameState {
  const points = emptyPoints();
  for (const [raw, count] of Object.entries(options.human ?? {})) points[Number(raw)] = { owner: "human", count };
  for (const [raw, count] of Object.entries(options.ai ?? {})) {
    const index = Number(raw); assert.equal(points[index].owner, null, `point ${index} occupied twice`);
    points[index] = { owner: "ai", count };
  }
  const humanBar = options.humanBar ?? 0, aiBar = options.aiBar ?? 0;
  const humanOnBoard = points.reduce((sum, point) => sum + (point.owner === "human" ? point.count : 0), 0);
  const aiOnBoard = points.reduce((sum, point) => sum + (point.owner === "ai" ? point.count : 0), 0);
  return {
    points, bar: { human: humanBar, ai: aiBar },
    off: { human: options.humanOff ?? 15 - humanOnBoard - humanBar, ai: options.aiOff ?? 15 - aiOnBoard - aiBar },
    turn: options.turn ?? "human", dice: [...(options.remaining ?? [])], remaining: [...(options.remaining ?? [])],
    winner: null, turnNumber: 1, message: "test",
  };
}

test("initial state and deep clones preserve all state invariants", () => {
  const game = initialGame();
  assert.deepEqual(invariantErrors(game), []);
  const copy = cloneGame(game); copy.points[23].count -= 1; copy.bar.human += 1;
  assert.equal(game.points[23].count, 2); assert.equal(game.bar.human, 0);
});

test("bar entry is mandatory, blocked points reject entry, and blots are captured", () => {
  const open = state({ human: { 23: 14 }, ai: { 18: 1, 0: 14 }, humanBar: 1, remaining: [6] });
  const moves = legalMovesForDie(open, "human", 6);
  assert.deepEqual(moves.map(move => move.from), ["bar"]);
  const after = applyMove(open, "human", moves[0]);
  assert.equal(after.bar.human, 0); assert.equal(after.bar.ai, 1); assert.deepEqual(invariantErrors(after), []);
  const blocked = state({ human: { 23: 14 }, ai: { 18: 2, 0: 13 }, humanBar: 1, remaining: [6] });
  assert.deepEqual(legalMovesForDie(blocked, "human", 6), []);
});

test("ordinary hits transfer exactly one rival checker to the bar", () => {
  const game = state({ human: { 6: 1, 23: 14 }, ai: { 5: 1, 0: 14 }, remaining: [1] });
  const move = legalMovesForDie(game, "human", 1).find(candidate => candidate.from === 6)!;
  const after = applyMove(game, "human", move);
  assert.equal(after.points[5].owner, "human"); assert.equal(after.points[5].count, 1); assert.equal(after.bar.ai, 1);
  assert.deepEqual(invariantErrors(after), []);
});

test("bearing off requires the complete home board and supports exact and legal oversized rolls", () => {
  const exact = state({ human: { 5: 1, 0: 14 }, ai: { 12: 15 }, remaining: [6] });
  assert.equal(canBearOff(exact, "human"), true);
  assert.ok(legalMovesForDie(exact, "human", 6).some(move => move.from === 5 && move.to === "off"));
  const oversized = state({ human: { 2: 15 }, ai: { 12: 15 }, remaining: [6] });
  assert.ok(legalMovesForDie(oversized, "human", 6).some(move => move.from === 2 && move.to === "off"));
  const farther = state({ human: { 5: 1, 2: 14 }, ai: { 12: 15 }, remaining: [6] });
  assert.ok(!legalMovesForDie(farther, "human", 6).some(move => move.from === 2 && move.to === "off"));
  const outside = state({ human: { 6: 1, 2: 14 }, ai: { 12: 15 }, remaining: [3] });
  assert.equal(canBearOff(outside, "human"), false);
});

test("AI bearing off is the exact mirror of human bearing off", () => {
  const game = state({ human: { 8: 15 }, ai: { 18: 14, 23: 1 }, remaining: [1], turn: "ai" });
  assert.equal(canBearOff(game, "ai"), true);
  assert.ok(legalMovesForDie(game, "ai", 1).some(move => move.from === 23 && move.to === "off"));
});

test("destination choice always prefers one large die over combinations", () => {
  const game = state({ human: { 10: 1, 23: 14 }, ai: { 0: 15 }, remaining: [6, 4, 2] });
  const route = allRoutesFromSource(game, "human", 10).find(option => option.to === 4)!;
  assert.deepEqual(route.moves.map(move => move.die), [6]);
});

test("when combination is required, fewer dice and larger values come first", () => {
  const game = state({ human: { 10: 1, 23: 14 }, ai: { 0: 15 }, remaining: [4, 3, 3, 2] });
  const route = allRoutesFromSource(game, "human", 10).find(option => option.to === 4)!;
  assert.deepEqual(route.moves.map(move => move.die), [4, 2]);
});

test("a destination route consumes its listed dice exactly once and preserves checker totals", () => {
  const game = state({ human: { 10: 1, 23: 14 }, ai: { 6: 1, 0: 14 }, remaining: [4, 2, 1] });
  const route = allRoutesFromSource(game, "human", 10).find(option => option.to === 4)!;
  let after = game;
  for (const move of route.moves) after = applyMove(after, "human", move);
  assert.equal(after.points[4].owner, "human"); assert.equal(after.bar.ai, 1);
  assert.equal(after.remaining.length, game.remaining.length - route.moves.length);
  assert.deepEqual(invariantErrors(after), []);
});

test("power-repeat expansion is deterministic for singles, pairs, triples, and four-of-a-kind", () => {
  assert.deepEqual(expandDice([2, 5], true), [2, 5]);
  assert.deepEqual(expandDice([4, 4], true), [4, 4, 4, 4]);
  assert.deepEqual(expandDice([3, 3, 3], true), [3, 3, 3, 3, 3, 3]);
  assert.deepEqual(expandDice([6, 6, 6, 6], true), [6, 6, 6, 6, 6, 6, 6, 6]);
  assert.deepEqual(expandDice([5, 5, 2], true), [5, 5, 5, 5, 2]);
  assert.deepEqual(rollDice(3, [6, 2, 4], true, false).raw, [6, 2, 4]);
  assert.deepEqual(rollDice(4, [6, 0, 2, 0], true, false, () => 0.5).raw, [6, 4, 2, 4]);
  assert.deepEqual(rollDice(2, [6, 6], false, false, () => 0).raw, [1, 1]);
});

test("win scoring distinguishes single, Mars/Gammon, and Backgammon", () => {
  assert.equal(victoryPoints(state({ humanOff: 15, aiOff: 1, ai: { 12: 14 } }), "human"), 1);
  assert.equal(victoryPoints(state({ humanOff: 15, aiOff: 0, ai: { 12: 15 } }), "human"), 2);
  assert.equal(victoryPoints(state({ humanOff: 15, aiOff: 0, ai: { 2: 1, 12: 14 } }), "human"), 3);
  assert.equal(victoryPoints(state({ humanOff: 15, aiOff: 0, ai: { 12: 14 }, aiBar: 1 }), "human"), 3);
});

test("illegal moves are rejected instead of corrupting state", () => {
  const game = initialGame(); game.remaining = [1];
  assert.throws(() => applyMove(game, "human", { from: 23, to: 17, die: 6 }), /not available/);
  assert.throws(() => applyMove(game, "human", { from: 23, to: 21, die: 1 }), /Illegal move/);
  assert.deepEqual(invariantErrors(game), []);
});

test("bearing off the fifteenth checker creates exactly one winner", () => {
  const game = state({ human: { 5: 1 }, humanOff: 14, ai: { 12: 15 }, remaining: [6] });
  const move = legalMovesForDie(game, "human", 6).find(candidate => candidate.from === 5 && candidate.to === "off")!;
  const after = applyMove(game, "human", move);
  assert.equal(after.off.human, 15); assert.equal(after.winner, "human");
  assert.deepEqual(invariantErrors(after), []);
});

test("random legal play preserves every state invariant and AI always returns a legal move", () => {
  for (let simulation = 0; simulation < 40; simulation += 1) {
    let game = initialGame();
    for (let turn = 0; turn < 80 && !game.winner; turn += 1) {
      game.remaining = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]; game.dice = [...game.remaining];
      while (anyLegalMove(game, game.turn) && game.remaining.length && !game.winner) {
        const candidates = [...new Set(game.remaining)].flatMap(die => legalMovesForDie(game, game.turn, die));
        const chosen = game.turn === "ai" ? chooseAiMove(game, ["easy", "medium", "hard"][simulation % 3] as "easy" | "medium" | "hard") : candidates[Math.floor(Math.random() * candidates.length)];
        assert.ok(chosen); assert.ok(candidates.some(move => move.from === chosen!.from && move.to === chosen!.to && move.die === chosen!.die));
        game = applyMove(game, game.turn, chosen!); assert.deepEqual(invariantErrors(game), []);
      }
      game = { ...game, turn: opponent(game.turn), dice: [], remaining: [], turnNumber: game.turnNumber + 1 };
      assert.deepEqual(invariantErrors(game), []);
    }
  }
});
