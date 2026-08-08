"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./game.css";

import {
  DEFAULT_SETTINGS,
  PLAYER_LABEL,
  allRoutesFromSource,
  anyLegalMove,
  applyMove,
  canBearOff,
  chooseAiMove,
  cloneGame,
  initialGame,
  opponent,
  pipCount,
  rollDice,
  victoryName,
  victoryPoints,
} from "./game-engine";
import type { Difficulty, GameState, Move, Player, Point, RouteOption, Settings } from "./game-engine";
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
      <input type="checkbox" aria-label={label} checked={checked} onChange={(event) => onChange(event.target.checked)} />
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

  const diceCount = useCallback((player: Player) => settings.customDice ? (player === "human" ? settings.humanDice : settings.aiDice) : 2, [settings.aiDice, settings.customDice, settings.humanDice]);
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
        const combination = moves.map((move) => move.die).join(" + ");
        next.message = `You used ${combination} to move ${distance} spaces${hits ? ` and captured ${hits} checker${hits > 1 ? "s" : ""}` : ""}.`;
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
  }, [aiPreset, diceCount, endTurn, humanPreset, settings.deterministic, settings.powerRepeats]);

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
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const saved = window.localStorage.getItem("backgammon-studio-score");
      if (saved) {
        const parsed = JSON.parse(saved) as { human?: number; ai?: number };
        timer = setTimeout(() => setMatchScore({ human: Math.max(0, parsed.human ?? 0), ai: Math.max(0, parsed.ai ?? 0) }), 0);
      }
    } catch {
      // A match still works when browser storage is unavailable.
    }
    return () => { if (timer) clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!game.winner || scoreRecorded.current) return;
    scoreRecorded.current = true;
    setMatchScore((score) => {
      const points = victoryPoints(game, game.winner!);
      const next = { ...score, [game.winner!]: score[game.winner!] + points };
      try { window.localStorage.setItem("backgammon-studio-score", JSON.stringify(next)); } catch { /* local-only persistence is optional */ }
      return next;
    });
  }, [game]);

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
  const resultPoints = game.winner ? victoryPoints(game, game.winner) : 0;
  const bearOffRoute = destinationRoutes.get("off");
  const bearingOffOpen = canBearOff(game, "human");
  const pointButton = (index: number, position: "top" | "bottom", visualIndex: number) => {
    const point = game.points[index];
    const canMove = routeSources.has(index);
    const landingRoute = destinationRoutes.get(index);
    const landsHere = Boolean(landingRoute);
    const isSelected = selectedSource === index;
    const diceLabel = landingRoute?.moves.map((move) => move.die).join(" + ");
    return <button key={index} className={`board-point ${position} ${visualIndex % 2 ? "dark" : "light"} ${canMove ? "source" : ""} ${isSelected ? "selected-source" : ""} ${landsHere ? "landing" : ""}`} onClick={() => handlePoint(index)} aria-label={`Point ${index + 1}, ${point.count} ${point.owner ?? "empty"}${canMove ? ", selectable checker" : ""}${landsHere ? `, reachable using ${diceLabel}` : ""}`}><span className="triangle" /><CheckerStack point={point} selected={isSelected} />{canMove && !landsHere && <span className="move-badge">{isSelected ? "SELECTED" : "SELECT PIECE"}</span>}{landsHere && <span className="landing-badge">MOVE HERE <b>{diceLabel}</b></span>}<small>{index + 1}</small></button>;
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
            {game.winner && <div className="victory-card" role="status">
              <span>{victoryName(resultPoints)}</span>
              <h2>{PLAYER_LABEL[game.winner]} win!</h2>
              <strong>+{resultPoints} {resultPoints === 1 ? "POINT" : "POINTS"}</strong>
              <p>{resultPoints === 3 ? "The loser bore off nothing and still had a checker in the winner’s home board or on the bar." : resultPoints === 2 ? "The loser did not bear off a single checker." : "Both players bore off at least one checker."}</p>
              <button onClick={startMatch}>PLAY NEXT GAME</button>
            </div>}
          </div>
          <div className="borne-off-row" aria-label="Borne-off checker totals">
            <section className="off-tray rival-off">
              <div className="off-tray-title"><span>RIVAL HOME</span><strong>{game.off.ai}<small>/15</small></strong></div>
              <div className="off-slots" aria-label={`${game.off.ai} rival checkers borne off`}>{Array.from({ length: 15 }, (_, index) => <i key={index} className={index < game.off.ai ? "filled" : ""} />)}</div>
            </section>
            <button type="button" className={`off-tray your-off ${bearOffRoute ? "can-bear" : ""}`} onClick={handleOffDestination} disabled={!bearOffRoute} aria-label={bearOffRoute ? `Bear off using ${bearOffRoute.moves.map((move) => move.die).join(" plus ")}` : `${game.off.human} of your checkers borne off`}>
              <div className="off-tray-title"><span>YOUR HOME</span><strong>{game.off.human}<small>/15</small></strong></div>
              <div className="off-slots" aria-label={`${game.off.human} of your checkers borne off`}>{Array.from({ length: 15 }, (_, index) => <i key={index} className={index < game.off.human ? "filled" : ""} />)}</div>
              {bearOffRoute ? <span className="off-action"><b>BEAR OFF HERE</b> Uses {bearOffRoute.moves.map((move) => move.die).join(" + ")}</span> : bearingOffOpen && <span className="home-ready">BEARING OFF IS OPEN · SELECT A CHECKER</span>}
            </button>
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
