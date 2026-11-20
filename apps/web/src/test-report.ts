/**
 * Test helpers, not part of the app: invented players and fixture positions, with stories built
 * by the real story builder from scripted engine answers (no Stockfish, no network).
 */
import {
  type ExampleStory,
  type FocusExample,
  type FocusItem,
  type GameRecord,
  PATTERN_IDS,
  type PatternStat,
  type PeriodStats,
  WeeklyReport,
} from "@blunderstruck/contracts";
import { storyOf } from "../../../packages/patterns/src/story";
import { type ScriptedEval, fixtureGame } from "../../../packages/patterns/src/test-fixtures";

export const PLAYER = "tidy_rookling";
export const SETTINGS = { analysisVersion: 2, patternsVersion: 1, engine: { name: "Stub 1", depth: 12 }, checkDepth: 18 };
export const END = "2026-12-07T00:00:00.000Z";
const DAY = 86_400_000;
export const weekEnd = (i: number, from = END): string => new Date(Date.parse(from) - i * 7 * DAY).toISOString();

const fenPgn = (fen: string, moves: string): string => `[Event "fixture"]\n[SetUp "1"]\n[FEN "${fen}"]\n\n${moves} *`;

// F1: Qd2? allows Ne4+ forking king and queen. Scores from White's side.
const F1 = "r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2Q3R w - - 0 1";
const F1_EVALS: Record<string, ScriptedEval> = {
  1: { cp: 778, pv: ["h1e1", "c7c5", "d1f3", "b7b6", "f2g1", "h7h6", "f3b7", "a8b8", "b7a6", "f6d5"] },
  2: { cp: -283, pv: ["f6e4", "f2e1", "e4d2", "e1d2", "f8e8", "a1d1", "a8d8", "d2c3", "f7f5", "h1e1"] },
  "r4rk1/ppp2pp1/5n1p/8/8/8/PPPQ1KPP/R6R w - - 0 2": { cp: 763, pv: ["h1e1", "a8d8", "d2b4", "f6d5", "b4b7", "a7a5", "f2g1", "d5b4", "b7e4", "d8d2"] },
};
// Qc1? allows Ne2+ and Nxc1.
const QC1 = "r4rk1/ppp2ppp/8/8/3n4/8/PPPQ1PPP/5RK1 w - - 0 1";
const QC1_EVALS: Record<string, ScriptedEval> = {
  1: { cp: 765, pv: ["d2d4", "b7b6", "d4a4", "c7c5", "h2h4", "h7h6", "f1e1", "f8c8", "c2c3", "c8c7"] },
  2: { cp: -750, pv: ["d4e2", "g1h1", "e2c1", "f1c1", "a8d8", "g2g3", "f7f5", "c1e1", "g8f7", "h1g2"] },
};
// F3: ...h6? misses the same fork, from Black's side.
const F3 = "r4rk1/ppp2ppp/5n2/8/8/8/PPPQ1KPP/R6R b - - 1 1";

export interface Sample {
  fen: string;
  story: ExampleStory;
  played: string;
  best?: string;
  ply: number;
  gameId: string;
  record: GameRecord;
  winPctLoss: number;
}

async function sample(o: { pgn: string; as: "white" | "black"; evals: Record<string, ScriptedEval>; ply: number; patternId: string; id: string; opening?: string }): Promise<Sample> {
  const g = await fixtureGame({ pgn: o.pgn, as: o.as, evals: o.evals, id: o.id, ...(o.opening ? { opening: { name: o.opening } } : {}) });
  const story = storyOf(g, { gameId: g.analysis.gameId, ply: o.ply, patternId: o.patternId });
  if (!story) throw new Error(`no story for ${o.id}`);
  const m = g.analysis.moves[o.ply - 1]!;
  const record: GameRecord = {
    id: o.id,
    platform: "lichess",
    url: `https://lichess.org/${o.id.split(":")[1]}`,
    playedAt: weekEnd(0),
    rated: true,
    timeClass: "rapid",
    timeControl: "600+5",
    white: { name: o.as === "white" ? PLAYER : "opponent_a" },
    black: { name: o.as === "black" ? PLAYER : "opponent_b" },
    result: "draw",
    ...(o.opening ? { opening: { name: o.opening } } : {}),
    pgn: o.pgn,
  };
  return {
    fen: m.fenBefore,
    story,
    played: m.san,
    ...(story.better[0] ? { best: story.better[0].san } : {}),
    ply: o.ply,
    gameId: o.id,
    record,
    winPctLoss: Math.max(1, m.winPctBefore - m.winPctAfter),
  };
}

/** The game played the engine's line for one move, then left it (quietly, so "From there …"). */
export const partway = (): Promise<Sample> =>
  sample({ pgn: fenPgn(F1, "1. Qd2 Ne4+ 2. Ke1 h6 3. a3 a6 4. h3 b6"), as: "white", evals: F1_EVALS, ply: 1, patternId: "allowed-tactic", id: "lichess:fxpart01", opening: "Four Knights Game" });
/** The game ended on the move. */
export const ended = (): Promise<Sample> =>
  sample({ pgn: fenPgn(F1, "1. Qd2"), as: "white", evals: F1_EVALS, ply: 1, patternId: "allowed-tactic", id: "lichess:fxend001", opening: "Four Knights Game" });
/** The game played the whole line. */
export const followed = (): Promise<Sample> =>
  sample({ pgn: fenPgn(QC1, "1. Qc1 Ne2+ 2. Kh1 Nxc1 3. Rxc1 Rad8 4. a3 a6"), as: "white", evals: QC1_EVALS, ply: 1, patternId: "hung-piece", id: "lichess:fxfoll01", opening: "Italian Game" });
/** The opponent played something else at once. */
export const other = (): Promise<Sample> =>
  sample({ pgn: fenPgn(QC1, "1. Qc1 Rad8 2. a3 a6 3. h3 h6"), as: "white", evals: QC1_EVALS, ply: 1, patternId: "hung-piece", id: "lichess:fxothr01", opening: "Italian Game" });
/** A missed fork, from Black's side. */
export const missed = (): Promise<Sample> =>
  sample({
    pgn: fenPgn(F3, "1... h6 2. Rhe1 Rad8"),
    as: "black",
    evals: { 2: F1_EVALS[2]!, "r4rk1/ppp2pp1/5n1p/8/8/8/PPPQ1KPP/R6R w - - 0 2": F1_EVALS["r4rk1/ppp2pp1/5n1p/8/8/8/PPPQ1KPP/R6R w - - 0 2"]! },
    ply: 2,
    patternId: "missed-tactic",
    id: "lichess:fxmiss01",
    opening: "Four Knights Game",
  });

export const example = (s: Sample, patternId: string, over: Partial<FocusExample> = {}): FocusExample => ({
  patternId,
  gameId: s.gameId,
  ply: s.ply,
  winPctLoss: s.winPctLoss,
  fen: s.fen,
  played: s.played,
  ...(s.best ? { best: s.best } : {}),
  story: s.story,
  ...over,
});

export const stat = (patternId: string, games: number, affected: number): PatternStat => ({
  patternId,
  games,
  moves: games * 35,
  gamesAffected: affected,
  occurrences: affected + 1,
  per100Moves: Number((((affected + 1) * 100) / (games * 35)).toFixed(2)),
  avgWinPctLoss: 30,
});

const AFFECTED: Record<string, number> = { "allowed-tactic": 5, "hung-piece": 4, "missed-tactic": 3, "thrown-win": 2, "time-trouble": 1 };

export function period(end: string, games: number, scale = 1): PeriodStats {
  return {
    start: new Date(Date.parse(end) - 7 * DAY).toISOString(),
    end,
    games,
    moves: games * 35,
    mistakesPer100Moves: 9.8,
    settings: SETTINGS,
    stats: PATTERN_IDS.map((id) => stat(id, games, Math.min(games, Math.round((AFFECTED[id] ?? 0) * scale)))),
  };
}

export const reason = (kind: FocusItem["reason"]["kind"], weeks: (boolean | null)[] = [true, true, false, true, true, null]): FocusItem["reason"] => ({
  kind,
  previousRank: kind === "kept" ? 1 : null,
  score: 10,
  recentCost: 5,
  naiveCostThisPeriod: 5,
  rate: 1,
  severity: 30,
  chronicity: 0.8,
  weeksRecurred: weeks.filter((w) => w === true).length,
  weeksCounted: weeks.filter((w) => w !== null).length,
  weeks,
});

export function focusItem(patternId: string, examples: FocusExample[], over: Partial<FocusItem> = {}): FocusItem {
  return {
    patternId,
    title: patternId === "allowed-tactic" ? "Moves that let a fork in" : "Pieces left to be taken",
    why: "In {gamesAffected} of your {games} games a move of yours handed the other side something for free.",
    drill: "Before each move, look for the opponent's checks, captures and double attacks.",
    exampleGameIds: examples.map((e) => e.gameId),
    baseline: stat(patternId, 64, 22),
    target: 0.96,
    since: weekEnd(3),
    reason: reason("new"),
    examples,
    blindSpots: [],
    steps: [],
    goal: { per: 1, of: 4 },
    ...over,
  };
}

/** A weekly report of `PLAYER` with the given focus items; everything else plausible and invented. */
export function sampleReport(focus: FocusItem[], over: Record<string, unknown> = {}): WeeklyReport {
  return WeeklyReport.parse({
    player: PLAYER,
    track: { platform: "lichess", username: PLAYER, timeClass: "rapid" },
    kind: "weekly",
    revision: 1,
    periodStart: weekEnd(1),
    periodEnd: END,
    rating: 1240,
    band: "club",
    bandSource: "ratings",
    settings: SETTINGS,
    gamesFound: 18,
    gamesAnalyzed: 18,
    gameIds: focus.flatMap((f) => f.examples.map((e) => e.gameId)),
    coverage: { sampled: 18, analysed: 18, total: 18, complete: true, sampleOnly: false, checked: 18 },
    current: period(END, 18),
    comparison: null,
    weeks: [0, 1, 2, 3, 4, 5].map((i) => period(weekEnd(i), 15)),
    trends: [],
    priorities: [],
    focus,
    progress: [],
    retired: [],
    summary: "Over {games} games you made about {mistakesPerGame} mistakes a game.",
    wording: { source: "model", provider: "anthropic", model: "stub-model", wordedFor: focus.map((f) => f.patternId), calls: 1 },
    notes: [],
    ...over,
  });
}

/** Two focus items with blind spots, steps, and four examples that follow, leave and end the engine's line. */
export async function fullReport(over: Record<string, unknown> = {}): Promise<{ report: WeeklyReport; games: Map<string, GameRecord> }> {
  const [p, e, f, o] = await Promise.all([partway(), ended(), followed(), other()]);
  const spot = (id: string, count: number, of: number, bc: number, extra: object = {}) => ({
    id,
    basis: id.includes("fork") ? ("motif" as const) : ("line" as const),
    count,
    games: count - 1,
    of,
    baselineCount: bc,
    baselineOf: 230,
    examples: [],
    ...extra,
  });
  const item1 = focusItem("allowed-tactic", [example(p, "allowed-tactic", { motif: "fork", traits: ["answer-check", "answer-fork"] }), example(e, "allowed-tactic", { motif: "fork", traits: ["answer-check", "moved-piece-lost"] })], {
    reason: reason("kept", [true, true, true, true, true, true]),
    since: weekEnd(3),
    blindSpots: [spot("answer-check", 11, 27, 29, { refinement: { id: "answer-knight-check", count: 6 } }), spot("moved-piece-lost", 10, 27, 52)],
    blindSpotWindow: { start: weekEnd(6), end: END, games: 96, mistakes: 230 },
    steps: [
      { blindSpot: "answer-check", text: "Before you let go of the piece, find every check they would have, knight checks first." },
      { blindSpot: "moved-piece-lost", text: "Look at the square you are moving to. Count what attacks the piece there and what guards it." },
    ],
  });
  const item2 = focusItem("hung-piece", [example(f, "hung-piece", { traits: ["lost-queen", "answer-check"] }), example(o, "hung-piece", { traits: ["lost-queen"] })], {
    baseline: stat("hung-piece", 64, 16),
    goal: { per: 1, of: 5 },
    blindSpots: [spot("lost-queen", 7, 19, 20)],
    blindSpotWindow: { start: weekEnd(6), end: END, games: 96, mistakes: 230 },
    steps: [{ blindSpot: "lost-queen", text: "When the move is a queen move, slow down. Name one safe square for her after their best reply." }],
  });
  const report = sampleReport([item1, item2], {
    progress: [
      { patternId: "allowed-tactic", previous: stat("allowed-tactic", 69, 20), current: stat("allowed-tactic", 18, 5), verdict: "flat", pValue: 0.47 },
      { patternId: "thrown-win", previous: stat("thrown-win", 69, 17), current: stat("thrown-win", 18, 1), verdict: "improved", pValue: 0.03 },
    ],
    retired: [{ patternId: "thrown-win", why: "graduated", since: weekEnd(3), baseline: stat("thrown-win", 64, 16), current: stat("thrown-win", 18, 1) }],
    comparison: period(weekEnd(1), 69),
    ...over,
  });
  return { report, games: new Map([p, e, f, o].map((s) => [s.gameId, s.record])) };
}

/**
 * The demo's data, built through the real story builder: this week's report with two habits
 * and four examples (one the game paid for, three it did not), last month's first report, and
 * six weeks of counts. `demo-data.ts` is this, written out by `demo.test.ts`.
 */
export async function demoData(): Promise<{ reports: WeeklyReport[]; weeks: PeriodStats[] }> {
  const { report } = await fullReport();
  const { report: first } = await fullReport({ kind: "first", periodEnd: weekEnd(1), periodStart: weekEnd(5), progress: [], retired: [], comparison: null });
  const weeks = [0, 1, 2, 3, 4, 5].map((i) => period(weekEnd(i), 14 + i, i === 5 ? 0.3 : 1));
  return JSON.parse(JSON.stringify({ reports: [first, report], weeks }));
}
