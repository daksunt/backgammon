"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./game.css";

type Player = "human" | "ai";
type Difficulty = "easy" | "medium" | "hard";
type Point = { owner: Player | null; count: number };
type Move = { from: number | "bar"; to: number | "off"; die: number; hit?: boolean };
type GameState = {
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
type Settings = {
  difficulty: Difficulty;
  customDice: boolean;
  humanDice: number;
  aiDice: number;
  powerRepeats: boolean;
  deterministic: boolean;
  undo: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  difficulty: "medium",
  customDice: true,
  humanDice: 2,
  aiDice: 2,
  powerRepeats: true,
  deterministic: false,
  undo: true,
};

const PLAYER_LABEL: Record<Player, string> = { human: "You", ai: "Rival" };

function emptyPoints(): Point[] {
  return Array.from({ length: 24 }, () => ({ owner: null, count: 0 }));
}

function initialGame(): GameState {
  const points = emptyPoints();
  const place = (index: number, owner: Player, count: number) => (points[index] = { owner, count });
  place(23, "human", 2);
  place(12, "human", 5);
  place(7, "human", 3);
  place(5, "human", 5);
  place(0, "ai", 2);
  place(11, "ai", 5);
  place(16, "ai", 3);
  place(18, "ai", 5);
  return {
    points,
    bar: { human: 0, ai: 0 },
    off: { human: 0, ai: 0 },
    turn: "human",
    dice: [],
    remaining: [],
    winner: null,
    turnNumber: 1,
    message: "Your opening roll.",
  };
}

function cloneGame(game: GameState): GameState {
  return {
    ...game,
    points: game.points.map((point) => ({ ...point })),
    bar: { ...game.bar },
    off: { ...game.off },
    dice: [...game.dice],
    remaining: [...game.remaining],
  };
}

const opponent = (player: Player): Player => (player === "human" ? "ai" : "human");
const direction = (player: Player) => (player === "human" ? -1 : 1);
const entryPoint = (player: Player, die: number) => (player === "human" ? 24 - die : die - 1);

function canBearOff(game: GameState, player: Player) {
  if (game.bar[player] > 0) return false;
  return game.points.every((point, index) => {
    if (point.owner !== player) return true;
    return player === "human" ? index <= 5 : index >= 18;
  });
}

function legalMovesForDie(game: GameState, player: Player, die: number): Move[] {
  const rival = opponent(player);
  if (game.bar[player] > 0) {
    const to = entryPoint(player, die);
    const target = game.points[to];
    if (target.owner === rival && target.count >= 2) return [];
    return [{ from: "bar", to, die, hit: target.owner === rival && target.count === 1 }];
  }

  const moves: Move[] = [];
  const bearing = canBearOff(game, player);
  for (let from = 0; from < 24; from += 1) {
    const source = game.points[from];
    if (source.owner !== player || source.count === 0) continue;
    const to = from + direction(player) * die;
    if (to >= 0 && to < 24) {
      const target = game.points[to];
      if (!(target.owner === rival && target.count >= 2)) {
        moves.push({ from, to, die, hit: target.owner === rival && target.count === 1 });
      }
      continue;
    }
    if (!bearing) continue;
    const exact = player === "human" ? from === die - 1 : 24 - from === die;
    const fartherChecker = game.points.some((point, index) => {
      if (point.owner !== player) return false;
      return player === "human" ? index > from : index < from;
    });
    if (exact || !fartherChecker) moves.push({ from, to: "off", die });
  }
  return moves;
}

function applyMove(game: GameState, player: Player, move: Move): GameState {
  const next = cloneGame(game);
  const rival = opponent(player);
  if (move.from === "bar") next.bar[player] -= 1;
  else {
    const source = next.points[move.from];
    source.count -= 1;
    if (source.count === 0) source.owner = null;
  }
  if (move.to === "off") next.off[player] += 1;
  else {
    const target = next.points[move.to];
    if (target.owner === rival && target.count === 1) {
      next.bar[rival] += 1;
      target.owner = player;
      target.count = 1;
    } else {
      target.owner = player;
      target.count += 1;
    }
  }
  const dieIndex = next.remaining.indexOf(move.die);
  if (dieIndex >= 0) next.remaining.splice(dieIndex, 1);
  if (next.off[player] === 15) {
    next.winner = player;
    next.message = `${PLAYER_LABEL[player]} bear off all 15 checkers.`;
  } else if (move.hit) {
    next.message = `${PLAYER_LABEL[player]} hit a blot with ${move.die}.`;
  } else if (move.to === "off") {
    next.message = `${PLAYER_LABEL[player]} bear off a checker.`;
  } else {
    next.message = `${PLAYER_LABEL[player]} played ${move.die}.`;
  }
  return next;
}

function uniqueDice(dice: number[]) {
  return [...new Set(dice)];
}

function anyLegalMove(game: GameState, player: Player) {
  return uniqueDice(game.remaining).some((die) => legalMovesForDie(game, player, die).length > 0);
}

function maxPlayableDice(game: GameState, player: Player, memo = new Map<string, number>()): number {
  if (!game.remaining.length) return 0;
  const boardKey = game.points.map((point) => point.owner ? `${point.owner[0]}${point.count}` : "-").join("|");
  const key = `${boardKey}/${game.bar.human},${game.bar.ai}/${game.remaining.slice().sort().join("")}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;
  let best = 0;
  for (const die of uniqueDice(game.remaining)) {
    for (const move of legalMovesForDie(game, player, die)) {
      best = Math.max(best, 1 + maxPlayableDice(applyMove(game, player, move), player, memo));
    }
  }
  memo.set(key, best);
  return best;
}

function ruleCompliantMoves(game: GameState, player: Player): Move[] {
  const candidates = uniqueDice(game.remaining).flatMap((die) => legalMovesForDie(game, player, die));
  if (candidates.length < 2 || game.remaining.length > 4) return candidates;
  const memo = new Map<string, number>();
  const scored = candidates.map((move) => ({ move, plays: 1 + maxPlayableDice(applyMove(game, player, move), player, memo) }));
  const maximum = Math.max(...scored.map(({ plays }) => plays));
  let allowed = scored.filter(({ plays }) => plays === maximum).map(({ move }) => move);
  if (maximum === 1 && uniqueDice(game.remaining).length > 1) {
    const highest = Math.max(...allowed.map((move) => move.die));
    allowed = allowed.filter((move) => move.die === highest);
  }
  return allowed;
}

function buildQuickRoute(game: GameState, player: Player, dice: number[], source: number | "bar"): Move[] | null {
  if (!dice.length) return null;
  let preview = cloneGame(game);
  let currentSource: number | "bar" | "off" = source;
  const route: Move[] = [];
  for (const die of dice) {
    if (currentSource === "off") break;
    const move = legalMovesForDie(preview, player, die).find((candidate) => candidate.from === currentSource);
    if (!move) return null;
    route.push(move);
    preview = applyMove(preview, player, move);
    currentSource = move.to;
    if (preview.winner) break;
  }
  return route.length ? route : null;
}

type RouteOption = { to: number | "off"; moves: Move[]; hits: number };

function allRoutesFromSource(game: GameState, player: Player, source: number | "bar"): RouteOption[] {
  const bestByDestination = new Map<string, RouteOption>();
  const visit = (preview: GameState, currentSource: number | "bar", route: Move[], hits: number) => {
    for (const die of uniqueDice(preview.remaining)) {
      const move = legalMovesForDie(preview, player, die).find((candidate) => candidate.from === currentSource);
      if (!move) continue;
      const moves = [...route, move];
      const nextHits = hits + (move.hit ? 1 : 0);
      const option: RouteOption = { to: move.to, moves, hits: nextHits };
      const key = String(move.to);
      const existing = bestByDestination.get(key);
      if (!existing || option.hits > existing.hits || (option.hits === existing.hits && option.moves.length > existing.moves.length)) {
        bestByDestination.set(key, option);
      }
      if (move.to !== "off") {
        const next = applyMove(preview, player, move);
        if (!next.winner) visit(next, move.to, moves, nextHits);
      }
    }
  };
  visit(game, source, [], 0);
  return [...bestByDestination.values()];
}

function expandDice(raw: number[], powerRepeats: boolean) {
  if (!powerRepeats) return raw;
  const counts = raw.reduce<Record<number, number>>((all, die) => ({ ...all, [die]: (all[die] || 0) + 1 }), {});
  const expanded: number[] = [];
  for (const die of raw) {
    const repeats = counts[die] > 1 ? counts[die] : 1;
    for (let i = 0; i < repeats; i += 1) expanded.push(die);
  }
  return expanded;
}

function rollDice(count: number, preset: number[], deterministic: boolean, powerRepeats: boolean) {
  const raw = Array.from({ length: count }, (_, index) =>
    deterministic ? preset[index] ?? 1 : Math.floor(Math.random() * 6) + 1,
  );
  return { raw, expanded: expandDice(raw, powerRepeats) };
}

function positionScore(game: GameState, player: Player) {
  const rival = opponent(player);
  let score = game.off[player] * 120 - game.off[rival] * 110;
  score -= game.bar[player] * 42;
  score += game.bar[rival] * 38;
  game.points.forEach((point, index) => {
    if (!point.owner) return;
    const progress = point.owner === "human" ? 23 - index : index;
    const value = progress * point.count;
    score += point.owner === player ? value : -value * 0.9;
    if (point.count >= 2) score += point.owner === player ? 8 : -7;
    if (point.count === 1) score += point.owner === player ? -5 : 4;
  });
  return score;
}

function chooseAiMove(game: GameState, difficulty: Difficulty): Move | null {
  const moves = ruleCompliantMoves(game, "ai");
  if (!moves.length) return null;
  if (difficulty === "easy") return moves[Math.floor(Math.random() * moves.length)];
  const scored = moves.map((move) => {
    const after = applyMove(game, "ai", move);
    let score = positionScore(after, "ai") + (move.hit ? 24 : 0) + (move.to === "off" ? 32 : 0);
    if (difficulty === "hard") {
      const possibleReplies = [1, 2, 3, 4, 5, 6].flatMap((die) => legalMovesForDie(after, "human", die));
      const worstReply = possibleReplies.reduce((worst, reply) => {
        const replyState = applyMove({ ...after, remaining: [reply.die] }, "human", reply);
        return Math.max(worst, positionScore(replyState, "human"));
      }, 0);
      score -= worstReply * 0.14;
    }
    return { move, score: score + Math.random() * 0.4 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].move;
}

function pipCount(game: GameState, player: Player) {
  let total = game.bar[player] * 25;
  game.points.forEach((point, index) => {
    if (point.owner === player) total += point.count * (player === "human" ? index + 1 : 24 - index);
  });
  return total;
}

function DieFace({ value, active, spent, onClick, label, order }: { value: number; active?: boolean; spent?: boolean; onClick?: () => void; label?: string; order?: number }) {
  const dots: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  return (
    <button className={`die ${active ? "active" : ""} ${spent ? "spent" : ""}`} onClick={onClick} disabled={!onClick || spent} aria-label={label ?? `Die ${value}`}>
      {Array.from({ length: 9 }, (_, i) => <span key={i} className={dots[value]?.includes(i) ? "pip" : ""} />)}
      {order && <b className="die-order">{order}</b>}
    </button>
  );
}

function CheckerStack({ point, selected }: { point: Point; selected?: boolean }) {
  if (!point.owner || point.count === 0) return null;
  const visible = Math.min(point.count, 5);
  return (
    <span className={`checker-stack ${point.owner} ${selected ? "selected" : ""}`}>
      {Array.from({ length: visible }, (_, index) => <i key={index} />)}
      {point.count > 5 && <b>{point.count}</b>}
    </span>
  );
}

function Toggle({ checked, onChange, label, note }: { checked: boolean; onChange: (value: boolean) => void; label: string; note: string }) {
  return (
    <label className="toggle-row">
      <span><strong>{label}</strong><small>{note}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

function Setup({ settings, setSettings, onStart }: { settings: Settings; setSettings: (settings: Settings) => void; onStart: () => void }) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings({ ...settings, [key]: value });
  return (
    <main className="setup-shell">
      <header className="brand"><span className="brand-mark"><i /><i /></span><b>BACK<span>GAMMON</span></b><em>STUDIO</em></header>
      <section className="setup-hero">
        <div className="hero-copy">
          <p className="eyebrow">CLASSIC STRATEGY · YOUR RULES</p>
          <h1>Every roll tells<br />a <em>story.</em></h1>
          <p>Play a beautifully focused game of backgammon against an adaptive rival, or bend the rules and build your own.</p>
          <div className="hero-proof"><span><b>3</b> AI levels</span><span><b>4</b> dice max</span><span><b>∞</b> rematches</span></div>
        </div>
        <div className="setup-card">
          <div className="setup-title"><div><span>NEW MATCH</span><h2>Set the table</h2></div><span className="solo-pill">SOLO</span></div>
          <fieldset>
            <legend>RIVAL STRENGTH</legend>
            <div className="segmented three">
              {(["easy", "medium", "hard"] as Difficulty[]).map((level) => <button key={level} className={settings.difficulty === level ? "chosen" : ""} onClick={() => set("difficulty", level)}>{level}</button>)}
            </div>
          </fieldset>
          <div className="setup-options">
            <Toggle checked={settings.customDice} onChange={(value) => set("customDice", value)} label="Custom dice count" note="Choose 2–4 dice for each side" />
            {settings.customDice && <div className="dice-counts">
              <label><span>Your dice</span><select value={settings.humanDice} onChange={(e) => set("humanDice", Number(e.target.value))}>{[2, 3, 4].map(n => <option key={n}>{n}</option>)}</select></label>
              <label><span>Rival dice</span><select value={settings.aiDice} onChange={(e) => set("aiDice", Number(e.target.value))}>{[2, 3, 4].map(n => <option key={n}>{n}</option>)}</select></label>
            </div>}
            <Toggle checked={settings.powerRepeats} onChange={(value) => set("powerRepeats", value)} label="Power repeats" note="Pairs play 4× · triples play 9×" />
            <Toggle checked={settings.deterministic} onChange={(value) => set("deterministic", value)} label="Director dice" note="Set both rolls before they happen" />
            <Toggle checked={settings.undo} onChange={(value) => set("undo", value)} label="Undo controls" note="Rewind one move or the whole turn" />
          </div>
          <button className="start-button" onClick={onStart}>START MATCH <span>→</span></button>
          <button className="room-button" disabled><span>◇</span> ROOM CODES <small>COMING NEXT</small></button>
        </div>
      </section>
      <footer><span>15 CHECKERS. 24 POINTS. ONE WAY HOME.</span><span>Designed for thoughtful play.</span></footer>
    </main>
  );
}

export default function Home() {
  const [screen, setScreen] = useState<"setup" | "game">("setup");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [game, setGame] = useState<GameState>(() => initialGame());
  const [selectedSource, setSelectedSource] = useState<number | "bar" | null>(null);
  const [humanPreset, setHumanPreset] = useState([6, 3, 4, 2]);
  const [aiPreset, setAiPreset] = useState([5, 2, 3, 1]);
  const [moveHistory, setMoveHistory] = useState<GameState[]>([]);
  const [turnHistory, setTurnHistory] = useState<GameState[]>([]);
  const [matchScore, setMatchScore] = useState({ human: 0, ai: 0 });
  const turnStart = useRef<GameState | null>(null);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scoreRecorded = useRef(false);

  const diceCount = (player: Player) => settings.customDice ? (player === "human" ? settings.humanDice : settings.aiDice) : 2;
  const routePreview = useMemo(() => {
    const sourceRoutes = new Map<number | "bar", RouteOption[]>();
    if (game.turn !== "human" || !game.remaining.length) return sourceRoutes;
    if (game.bar.human > 0) {
      const routes = allRoutesFromSource(game, "human", "bar");
      if (routes.length) sourceRoutes.set("bar", routes);
      return sourceRoutes;
    }
    game.points.forEach((point, index) => {
      if (point.owner !== "human") return;
      const routes = allRoutesFromSource(game, "human", index);
      if (routes.length) sourceRoutes.set(index, routes);
    });
    return sourceRoutes;
  }, [game]);
  const routeSources = new Set(routePreview.keys());
  const selectedRoutes = selectedSource === null ? [] : routePreview.get(selectedSource) ?? [];
  const destinationRoutes = new Map(selectedRoutes.map((route) => [route.to, route]));
  const routeDestinations = new Set(destinationRoutes.keys());

  const endTurn = useCallback((current: GameState) => {
    if (current.winner) return current;
    const next = cloneGame(current);
    next.turn = opponent(current.turn);
    next.dice = [];
    next.remaining = [];
    next.turnNumber += 1;
    next.message = `${PLAYER_LABEL[next.turn]} to roll.`;
    turnStart.current = null;
    setSelectedSource(null);
    return next;
  }, []);

  const performMove = useCallback((move: Move, player: Player) => {
    setGame((current) => {
      setMoveHistory((history) => [...history.slice(-39), cloneGame(current)]);
      let next = applyMove(current, player, move);
      if (!next.winner && (next.remaining.length === 0 || !anyLegalMove(next, player))) next = endTurn(next);
      return next;
    });
    setSelectedSource(null);
  }, [endTurn]);

  const performQuickRoute = useCallback((moves: Move[]) => {
    setGame((current) => {
      setMoveHistory((history) => [...history.slice(-39), cloneGame(current)]);
      let next = current;
      let hits = 0;
      for (const move of moves) {
        if (move.hit) hits += 1;
        next = applyMove(next, "human", move);
        if (next.winner) break;
      }
      if (!next.winner) {
        const distance = moves.reduce((total, move) => total + move.die, 0);
        next.message = `You moved ${distance} in one route${hits ? ` and captured ${hits} checker${hits > 1 ? "s" : ""}` : ""}.`;
        if (next.remaining.length === 0 || !anyLegalMove(next, "human")) next = endTurn(next);
      }
      setSelectedSource(null);
      return next;
    });
  }, [endTurn]);

  const roll = useCallback((player: Player) => {
    setGame((current) => {
      if (current.turn !== player || current.dice.length || current.winner) return current;
      const snapshot = cloneGame(current);
      turnStart.current = snapshot;
      setTurnHistory((history) => [...history.slice(-19), snapshot]);
      const preset = player === "human" ? humanPreset : aiPreset;
      const result = rollDice(diceCount(player), preset, settings.deterministic, settings.powerRepeats);
      const next = { ...cloneGame(current), dice: result.raw, remaining: result.expanded, message: `${PLAYER_LABEL[player]} rolled ${result.raw.join(" · ")}.` };
      if (!anyLegalMove(next, player)) {
        next.message += " No legal move.";
        return endTurn(next);
      }
      return next;
    });
  }, [aiPreset, endTurn, humanPreset, settings]);

  useEffect(() => {
    if (screen !== "game" || game.turn !== "ai" || game.winner) return;
    if (aiTimer.current) clearTimeout(aiTimer.current);
    aiTimer.current = setTimeout(() => {
      if (!game.dice.length) roll("ai");
      else {
        const move = chooseAiMove(game, settings.difficulty);
        if (move) performMove(move, "ai");
        else setGame((current) => endTurn(current));
      }
    }, game.dice.length ? 460 : 650);
    return () => { if (aiTimer.current) clearTimeout(aiTimer.current); };
  }, [endTurn, game, performMove, roll, screen, settings.difficulty]);

  useEffect(() => {
    if (screen !== "game" || game.turn !== "human" || game.dice.length || game.winner || settings.deterministic) return;
    const timer = setTimeout(() => roll("human"), 350);
    return () => clearTimeout(timer);
  }, [game.dice.length, game.turn, game.winner, roll, screen, settings.deterministic]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("backgammon-studio-score");
      if (saved) {
        const parsed = JSON.parse(saved) as { human?: number; ai?: number };
        setMatchScore({ human: Math.max(0, parsed.human ?? 0), ai: Math.max(0, parsed.ai ?? 0) });
      }
    } catch {
      // A match still works when browser storage is unavailable.
    }
  }, []);

  useEffect(() => {
    if (!game.winner || scoreRecorded.current) return;
    scoreRecorded.current = true;
    setMatchScore((score) => {
      const next = { ...score, [game.winner!]: score[game.winner!] + 1 };
      try { window.localStorage.setItem("backgammon-studio-score", JSON.stringify(next)); } catch { /* local-only persistence is optional */ }
      return next;
    });
  }, [game.winner]);

  const startMatch = () => {
    scoreRecorded.current = false;
    setGame(initialGame());
    setMoveHistory([]);
    setTurnHistory([]);
    setSelectedSource(null);
    setScreen("game");
  };

  const resetMatchScore = () => {
    const empty = { human: 0, ai: 0 };
    setMatchScore(empty);
    try { window.localStorage.setItem("backgammon-studio-score", JSON.stringify(empty)); } catch { /* local-only persistence is optional */ }
  };

  const handlePoint = (index: number) => {
    if (game.turn !== "human" || !game.remaining.length) return;
    if (selectedSource !== null) {
      const route = destinationRoutes.get(index);
      if (route) return performQuickRoute(route.moves);
      if (selectedSource === index) return setSelectedSource(null);
    }
    if (routeSources.has(index)) setSelectedSource(index);
  };

  const handleBar = () => {
    if (game.turn !== "human" || !game.remaining.length) return;
    setSelectedSource((source) => source === "bar" ? null : "bar");
  };

  const handleOffDestination = () => {
    const route = destinationRoutes.get("off");
    if (route) performQuickRoute(route.moves);
  };

  const undoMove = () => {
    const previous = moveHistory.at(-1);
    if (!previous) return;
    if (aiTimer.current) clearTimeout(aiTimer.current);
    setGame(cloneGame(previous));
    setMoveHistory((history) => history.slice(0, -1));
    setSelectedSource(null);
  };

  const undoTurn = () => {
    const previous = turnHistory.at(-1);
    if (!previous) return;
    if (aiTimer.current) clearTimeout(aiTimer.current);
    setGame(cloneGame(previous));
    setTurnHistory((history) => history.slice(0, -1));
    setMoveHistory([]);
    setSelectedSource(null);
  };

  if (screen === "setup") return <Setup settings={settings} setSettings={setSettings} onStart={startMatch} />;

  const top = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  const bottom = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
  const pointButton = (index: number, position: "top" | "bottom", visualIndex: number) => {
    const point = game.points[index];
    const canMove = routeSources.has(index);
    const landsHere = routeDestinations.has(index);
    const isSelected = selectedSource === index;
    return <button key={index} className={`board-point ${position} ${visualIndex % 2 ? "dark" : "light"} ${canMove ? "source" : ""} ${isSelected ? "selected-source" : ""} ${landsHere ? "landing" : ""}`} onClick={() => handlePoint(index)} aria-label={`Point ${index + 1}, ${point.count} ${point.owner ?? "empty"}${canMove ? ", selectable checker" : ""}${landsHere ? ", reachable destination" : ""}`}><span className="triangle" /><CheckerStack point={point} selected={isSelected} />{canMove && !landsHere && <span className="move-badge">{isSelected ? "SELECTED" : "SELECT PIECE"}</span>}{landsHere && <span className="landing-badge">MOVE HERE</span>}<small>{index + 1}</small></button>;
  };

  const presetEditor = (player: Player, values: number[], setValues: (values: number[]) => void) => (
    <div className="preset-row"><span>{PLAYER_LABEL[player]}</span>{values.slice(0, diceCount(player)).map((value, index) => <select key={index} value={value} onChange={(e) => { const next = [...values]; next[index] = Number(e.target.value); setValues(next); }}>{[1, 2, 3, 4, 5, 6].map(n => <option key={n}>{n}</option>)}</select>)}</div>
  );

  return (
    <main className="game-shell">
      <nav className="game-nav">
        <button className="brand compact" onClick={() => setScreen("setup")}><span className="brand-mark"><i /><i /></span><b>BACK<span>GAMMON</span></b></button>
        <div className="match-score" aria-label={`Match score: You ${matchScore.human}, Rival ${matchScore.ai}`}>
          <span>MATCH SCORE</span>
          <div><small>YOU</small><b>{matchScore.human}</b><i>—</i><b>{matchScore.ai}</b><small>RIVAL</small></div>
          <button onClick={resetMatchScore} disabled={matchScore.human === 0 && matchScore.ai === 0}>RESET</button>
        </div>
        <button className="new-match" onClick={() => setScreen("setup")}>NEW MATCH</button>
      </nav>
      <section className="play-layout">
        <aside className="player-card rival">
          <div className="player-head"><span className="avatar">R</span><div><small>YOUR RIVAL</small><h2>{settings.difficulty === "easy" ? "Mira" : settings.difficulty === "hard" ? "Kaspar" : "Arden"}</h2></div><i className={game.turn === "ai" ? "status live" : "status"} /></div>
          <div className="metric"><span>PIP COUNT</span><b>{pipCount(game, "ai")}</b></div>
          <div className="metric"><span>BAR / HOME</span><b>{game.bar.ai} <em>/</em> {game.off.ai}</b></div>
          <div className="difficulty-badge">{settings.difficulty.toUpperCase()} AI</div>
          {game.turn === "ai" && <p className="thinking"><i /><i /><i /> considering the table</p>}
        </aside>

        <section className="table-wrap">
          <div className="turn-banner"><span>{game.winner ? `${PLAYER_LABEL[game.winner]} WON` : game.turn === "human" ? "YOUR TURN" : "RIVAL'S TURN"}</span><p>{game.message}</p></div>
          <div className={`move-console ${selectedSource !== null ? "piece-chosen" : ""}`}>
            <div className="move-guide">
              <span className={game.dice.length ? "done" : "current"}><b>1</b> Auto roll</span>
              <i>›</i>
              <span className={game.dice.length && selectedSource === null ? "current" : selectedSource !== null ? "done" : ""}><b>2</b> Select a piece</span>
              <i>›</i>
              <span className={selectedSource !== null ? "current" : ""}><b>3</b> Select destination</span>
            </div>
            <div className="dice-controls">
              {game.turn === "human" && !game.dice.length && !game.winner && settings.deterministic && <button className="roll-button primary-roll" onClick={() => roll("human")}><span>ROLL</span> SELECTED DICE</button>}
              {game.turn === "human" && !game.dice.length && !game.winner && !settings.deterministic && <div className="auto-roll-status"><i /><strong>Rolling automatically…</strong></div>}
              {game.turn === "human" && game.remaining.length > 0 && <>
                <div className="dice-choice" aria-label="Available dice">
                  {game.remaining.map((die, index) => <DieFace key={`${die}-${index}`} value={die} label={`Available die ${die}`} />)}
                </div>
                <div className="move-instruction">
                  {selectedSource !== null ? <><strong>Now choose the destination</strong><span>Every reachable final point is marked in teal. Dice and captures are handled automatically.</span></> : <><strong>Select any marked checker</strong><span>We will show every place it can reach using any dice combination.</span></>}
                </div>
                {selectedSource !== null && <button className="change-piece" onClick={() => setSelectedSource(null)}>CHANGE PIECE</button>}
              </>}
              {game.turn === "ai" && <div className="move-instruction waiting"><strong>Rival is playing</strong><span>Your controls will return in a moment.</span></div>}
              {game.winner && <button className="roll-button primary-roll" onClick={startMatch}>REMATCH</button>}
            </div>
          </div>
          <div className="board-frame">
            <div className="board top-row">{top.slice(0, 6).map((n, i) => pointButton(n, "top", i))}<div className="bar-lane"><button className={`bar-checkers ai ${routeSources.has("bar") ? "source" : ""} ${selectedSource === "bar" ? "selected" : ""}`} onClick={handleBar}>{game.bar.ai > 0 && <><i />{game.bar.ai > 1 && <b>{game.bar.ai}</b>}</>}</button></div>{top.slice(6).map((n, i) => pointButton(n, "top", i + 6))}</div>
            <div className="board-mid"><span>{game.off.ai} OFF</span><b>BACKGAMMON</b><span>{game.off.human} OFF</span></div>
            <div className="board bottom-row">{bottom.slice(0, 6).map((n, i) => pointButton(n, "bottom", i))}<div className="bar-lane"><button className={`bar-checkers human ${routeSources.has("bar") ? "source" : ""} ${selectedSource === "bar" ? "selected" : ""}`} onClick={handleBar}>{game.bar.human > 0 && <><i />{game.bar.human > 1 && <b>{game.bar.human}</b>}</>}</button></div>{bottom.slice(6).map((n, i) => pointButton(n, "bottom", i + 6))}</div>
            {routeDestinations.has("off") && <button className="route-off-preview" onClick={handleOffDestination}><b>BEAR OFF HERE</b><span>Final destination</span></button>}
          </div>
          <div className="borne-off-row" aria-label="Borne-off checker totals">
            <section className="off-tray rival-off">
              <div className="off-tray-title"><span>RIVAL HOME</span><strong>{game.off.ai}<small>/15</small></strong></div>
              <div className="off-slots" aria-label={`${game.off.ai} rival checkers borne off`}>{Array.from({ length: 15 }, (_, index) => <i key={index} className={index < game.off.ai ? "filled" : ""} />)}</div>
            </section>
            <section className="off-tray your-off">
              <div className="off-tray-title"><span>YOUR HOME</span><strong>{game.off.human}<small>/15</small></strong></div>
              <div className="off-slots" aria-label={`${game.off.human} of your checkers borne off`}>{Array.from({ length: 15 }, (_, index) => <i key={index} className={index < game.off.human ? "filled" : ""} />)}</div>
            </section>
          </div>
        </section>

        <aside className="control-card">
          <div className="player-head you"><span className="avatar">Y</span><div><small>PLAYING AS</small><h2>You</h2></div><i className={game.turn === "human" ? "status live" : "status"} /></div>
          <div className="metric"><span>PIP COUNT</span><b>{pipCount(game, "human")}</b></div>
          <div className="metric"><span>BAR / HOME</span><b>{game.bar.human} <em>/</em> {game.off.human}</b></div>
          {settings.deterministic && <div className="director-panel"><div><span>DIRECTOR DICE</span><small>Set the next rolls</small></div>{presetEditor("human", humanPreset, setHumanPreset)}{presetEditor("ai", aiPreset, setAiPreset)}</div>}
          {settings.undo && <div className="undo-panel"><button onClick={undoMove} disabled={!moveHistory.length}>↶ <span>UNDO MOVE</span></button><button onClick={undoTurn} disabled={!turnHistory.length}>↶ <span>UNDO TURN</span></button></div>}
          <div className="rules-note"><span>i</span><p><b>{settings.customDice ? `${settings.humanDice} vs ${settings.aiDice} dice` : "Classic dice"}</b>{settings.powerRepeats ? "Power repeats are on." : "Standard rolls."} Bar entry always comes first.</p></div>
        </aside>
      </section>
    </main>
  );
}
