import { describe, expect, it } from "vitest";
import {
  ANALYSIS_VERSION,
  BLIND_SPOT_FAMILIES,
  BLIND_SPOT_IDS,
  BLIND_SPOT_TOKENS,
  BLIND_SPOTS,
  BlindSpot,
  Coverage,
  ExampleStory,
  FocusExample,
  GAMES_TENTHS_FROM,
  GameGoal,
  MAX_BLIND_SPOTS,
  MoveDetail,
  blindSpotFamilyOf,
  blindSpotInfo,
  blindSpotTokenValues,
  gameGoalOf,
  meetsGoal,
  AnalyzedGame,
  AnalyzedMove,
  BEST_LINE_MAX_PLIES,
  ExportLine,
  FOCUS_TOKENS,
  FocusChoice,
  FocusItem,
  MAX_FOCUS_ITEMS,
  PATTERN_IDS,
  PATTERNS_VERSION,
  PatternFinding,
  PatternId,
  PatternStat,
  PatternSummary,
  Persistence,
  ReportDraft,
  SUMMARY_TOKENS,
  TopHabit,
  WeeklyReport,
  focusTokenValues,
  renderText,
  settingsKey,
  summaryTokenValues,
  trackKey,
} from "./index";

const move = {
  ply: 1,
  color: "white",
  san: "e4",
  uci: "e2e4",
  fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  fenAfter: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  bestUci: "e2e4",
  scoreBefore: { cp: 20 },
  scoreAfter: { cp: 20 },
  winPctBefore: 52,
  winPctAfter: 52,
  winPctLoss: 0,
  judgment: "ok",
};

const finding = { patternId: "hung-piece", gameId: "g1", ply: 9, winPctLoss: 30 };

describe("analysis contracts", () => {
  it("is version 3 and caps the stored main line", () => {
    expect(ANALYSIS_VERSION).toBe(3);
    expect(AnalyzedMove.safeParse(move).success).toBe(true);
    expect(AnalyzedMove.safeParse({ ...move, bestLine: ["e2e4", "e7e5"] }).success).toBe(true);
    const tooLong = Array.from({ length: BEST_LINE_MAX_PLIES + 1 }, () => "e2e4");
    expect(AnalyzedMove.safeParse({ ...move, bestLine: tooLong }).success).toBe(false);

    const game = { gameId: "g1", analysisVersion: 2, engine: { name: "stub", depth: 12 }, moves: [move] };
    expect(AnalyzedGame.safeParse(game).success).toBe(true);
    expect(AnalyzedGame.safeParse({ ...game, finalLine: ["e7e5"] }).success).toBe(true);
    expect(AnalyzedGame.safeParse({ ...game, finalLine: tooLong }).success).toBe(false);
  });

  it("accepts an optional deeper check on moves and games", () => {
    const check = {
      depth: 18,
      scoreBefore: { cp: 20 },
      scoreAfter: { cp: -300 },
      bestUci: "e2e4",
      bestLine: ["e2e4", "e7e5"],
      answerLine: ["d7d5"],
      winPctBefore: 52,
      winPctAfter: 20,
      winPctLoss: 32,
      judgment: "blunder",
    };
    expect(AnalyzedMove.safeParse({ ...move, check }).success).toBe(true);
    expect(AnalyzedMove.safeParse({ ...move, check: { ...check, depth: 0 } }).success).toBe(false);
    const tooLong = Array.from({ length: BEST_LINE_MAX_PLIES + 1 }, () => "e2e4");
    expect(AnalyzedMove.safeParse({ ...move, check: { ...check, answerLine: tooLong } }).success).toBe(false);

    const game = { gameId: "g1", analysisVersion: 3, engine: { name: "stub", depth: 12 }, moves: [move] };
    expect(AnalyzedGame.safeParse({ ...game, check: { depth: 18, colors: ["white"] } }).success).toBe(true);
    expect(AnalyzedGame.safeParse({ ...game, check: { depth: 18, colors: ["white", "black"] } }).success).toBe(true);
    expect(AnalyzedGame.safeParse({ ...game, check: { depth: 18, colors: [] } }).success).toBe(false);
    expect(AnalyzedGame.safeParse({ ...game, check: { depth: 18, colors: ["white", "black", "white"] } }).success).toBe(
      false,
    );
  });
});

describe("pattern contracts", () => {
  it("lists nine patterns in priority order", () => {
    expect(PATTERN_IDS).toEqual([
      "missed-mate",
      "allowed-mate",
      "hung-piece",
      "allowed-tactic",
      "missed-capture",
      "missed-tactic",
      "thrown-win",
      "time-trouble",
      "opening-trouble",
    ]);
    expect(PatternId.safeParse("opening-trouble").success).toBe(true);
    expect(PATTERNS_VERSION).toBe(1);
  });

  it("keeps patternId a plain string and accepts motif and subject", () => {
    expect(PatternFinding.safeParse({ ...finding, patternId: "some-future-pattern" }).success).toBe(true);
    expect(PatternFinding.safeParse({ ...finding, motif: "fork", subject: "x" }).success).toBe(true);
    expect(PatternFinding.safeParse({ ...finding, motif: "pin" }).success).toBe(false);
  });

  it("requires sample size on PatternStat", () => {
    const stat = { patternId: "hung-piece", games: 3, occurrences: 2, per100Moves: 1, avgWinPctLoss: 20 };
    expect(PatternStat.safeParse(stat).success).toBe(false);
    expect(PatternStat.safeParse({ ...stat, moves: 200, gamesAffected: 2 }).success).toBe(true);
    expect(PatternStat.safeParse({ ...stat, moves: -1, gamesAffected: 2 }).success).toBe(false);
  });

  it("caps top habits at MAX_FOCUS_ITEMS and examples at two", () => {
    expect(MAX_FOCUS_ITEMS).toBe(2);
    const habit = { patternId: "hung-piece", costPer100Moves: 4.2, gamesAffected: 2, examples: [finding, finding] };
    expect(TopHabit.safeParse(habit).success).toBe(true);
    expect(TopHabit.safeParse({ ...habit, examples: [finding, finding, finding] }).success).toBe(false);

    const summary = {
      player: "testplayer",
      patternsVersion: PATTERNS_VERSION,
      analysisVersion: ANALYSIS_VERSION,
      engine: { name: "stub", depth: 12 },
      games: 2,
      moves: 60,
      mistakesPer100Moves: 5,
      stats: [],
      findings: [finding],
      openings: [
        {
          positionKey: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -",
          color: "black",
          line: ["e4", "e5", "Nf3"],
          games: 2,
          reached: 2,
          movesPlayed: ["Bc5", "Bc5"],
          avgWinPctLoss: 12,
          gameIds: ["g1", "g2"],
        },
      ],
      top: [habit, habit],
    };
    expect(PatternSummary.safeParse(summary).success).toBe(true);
    expect(PatternSummary.safeParse({ ...summary, top: [habit, habit, habit] }).success).toBe(false);
  });
});

const example = {
  ...finding,
  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  played: "Nf6",
  best: "e5",
};

const stat = (patternId: string, per100Moves: number) => ({
  patternId,
  games: 30,
  moves: 1000,
  gamesAffected: 9,
  occurrences: 12,
  per100Moves,
  avgWinPctLoss: 30,
});

/** Settings as a milestone 2 report stored them: no check depth. */
const settings = { analysisVersion: 2, patternsVersion: 1, engine: { name: "stockfish", depth: 12 } };

const periodStats = (start: string, end: string) => ({
  start,
  end,
  games: 30,
  moves: 1000,
  mistakesPer100Moves: 4.256,
  settings,
  stats: [stat("hung-piece", 1.2)],
});

const weeks = [true, false, null, true, true, false];

const reason = {
  kind: "new",
  previousRank: null,
  score: 28.5,
  recentCost: 14.3,
  naiveCostThisPeriod: 12,
  rate: 1.4,
  severity: 30,
  chronicity: 0.6,
  weeksRecurred: 3,
  weeksCounted: 5,
  weeks,
};

const choice = {
  patternId: "hung-piece",
  exampleGameIds: ["g1"],
  baseline: stat("hung-piece", 1.6),
  target: 1.2,
  since: "2026-11-19T00:00:00Z",
  reason,
  examples: [example],
};

const item = {
  ...choice,
  title: "Count the defenders",
  why: "Pieces hung in {gamesAffected} of {games} games.",
  drill: "Before each move, check what is undefended.",
};

const progress = {
  patternId: "hung-piece",
  previous: stat("hung-piece", 1.6),
  current: stat("hung-piece", 1.2),
  verdict: "flat",
  pValue: 0.196,
};

const report = {
  player: "TestPlayer",
  track: { platform: "lichess", username: "TestPlayer", timeClass: "blitz" },
  kind: "weekly",
  revision: 0,
  periodStart: "2026-11-12T00:00:00Z",
  periodEnd: "2026-11-19T00:00:00Z",
  rating: 1650,
  band: "club",
  bandSource: "ratings",
  settings,
  gamesFound: 30,
  gamesAnalyzed: 30,
  gameIds: ["g1"],
  coverage: { sampled: 30, analysed: 30, total: 30, complete: true, sampleOnly: false },
  current: periodStats("2026-11-12T00:00:00Z", "2026-11-19T00:00:00Z"),
  comparison: null,
  weeks: Array.from({ length: 6 }, () => periodStats("2026-11-12T00:00:00Z", "2026-11-19T00:00:00Z")),
  trends: [],
  priorities: [
    {
      patternId: "hung-piece",
      eligible: true,
      rank: 1,
      rate: 1.4,
      severity: 30,
      recentCost: 14.3,
      naiveCostThisPeriod: 12,
      chronicity: 0.6,
      score: 28.5,
      persistence: { weeksRecurred: 3, weeksCounted: 5, weeks, chronicity: 0.6 },
    },
  ],
  focus: [item],
  progress: [progress],
  retired: [],
  summary: "{games} games, {focusCount} thing to work on.",
  wording: { source: "template", wordedFor: [], calls: 0 },
  notes: ["no-key"],
};

describe("report contracts", () => {
  it("accepts a full report and its draft", () => {
    expect(WeeklyReport.safeParse(report).success).toBe(true);
    const { summary: _s, wording: _w, ...draft } = report;
    expect(ReportDraft.safeParse({ ...draft, focus: [choice] }).success).toBe(true);
    expect(FocusChoice.safeParse(choice).success).toBe(true);
    expect(FocusItem.safeParse(choice).success).toBe(false);
  });

  it("rejects three focus items", () => {
    expect(WeeklyReport.safeParse({ ...report, focus: [item, item] }).success).toBe(true);
    expect(WeeklyReport.safeParse({ ...report, focus: [item, item, item] }).success).toBe(false);
    const { summary: _s, wording: _w, ...draft } = report;
    expect(ReportDraft.safeParse({ ...draft, focus: [choice, choice, choice] }).success).toBe(false);
  });

  it("requires six weeks, newest first", () => {
    const p = { weeksRecurred: 3, weeksCounted: 5, weeks, chronicity: 0.6 };
    expect(Persistence.safeParse(p).success).toBe(true);
    expect(Persistence.safeParse({ ...p, weeks: weeks.slice(0, 5) }).success).toBe(false);
    expect(Persistence.safeParse({ ...p, weeks: [...weeks, true] }).success).toBe(false);
    expect(Persistence.safeParse({ ...p, chronicity: 1.2 }).success).toBe(false);
    expect(FocusItem.safeParse({ ...item, reason: { ...reason, weeks: weeks.slice(1) } }).success).toBe(false);
    expect(WeeklyReport.safeParse({ ...report, weeks: report.weeks.slice(1) }).success).toBe(false);
  });

  it("caps wording calls and examples", () => {
    expect(WeeklyReport.safeParse({ ...report, wording: { ...report.wording, calls: 4 } }).success).toBe(false);
    expect(FocusItem.safeParse({ ...item, examples: [example, example, example] }).success).toBe(false);
    expect(FocusItem.safeParse({ ...item, examples: [finding] }).success).toBe(false);
    const { best: _b, ...noBest } = example;
    expect(FocusItem.safeParse({ ...item, examples: [noBest] }).success).toBe(true);
    expect(WeeklyReport.safeParse({ ...report, notes: ["unknown-note"] }).success).toBe(false);
  });

  it("builds track and settings keys", () => {
    expect(trackKey({ platform: "lichess", username: "TestPlayer", timeClass: "blitz" })).toBe(
      "lichess:testplayer:blitz",
    );
    expect(settingsKey(settings)).toBe("a2.p1.d12.stockfish");
    expect(settingsKey({ ...settings, checkDepth: 0 })).toBe("a2.p1.d12.stockfish");
    expect(settingsKey({ ...settings, analysisVersion: 3, checkDepth: 18 })).toBe("a3.p1.d12.stockfish.c18");
    expect(settingsKey({ ...settings, checkDepth: 18 }).endsWith(".c18")).toBe(true);
  });

  it("renders known tokens and throws on unknown ones", () => {
    expect(renderText("in {gamesAffected} of {games} games", { gamesAffected: "9", games: "30" })).toBe(
      "in 9 of 30 games",
    );
    expect(renderText("no tokens", {})).toBe("no tokens");
    expect(() => renderText("{bogus} here", { games: "30" })).toThrow("bogus");
    expect(() => renderText("{games_affected} games", { gamesAffected: "9" })).toThrow("games_affected");
    expect(() => renderText("{ games } games", { games: "30" })).toThrow();
    expect(() => renderText("{} games", { games: "30" })).toThrow();
    expect(() => renderText("{toString}", {})).toThrow();
    for (const bad of ["{{games}}", "{games}}", "{games", "games}"]) {
      expect(() => renderText(bad, { games: "30" })).toThrow();
    }
    expect(renderText("{games}", { games: "{x}" })).toBe("{x}");
  });

  it("formats token values with two-decimal rates", () => {
    const values = focusTokenValues(FocusChoice.parse(choice), WeeklyReport.parse(report));
    expect(Object.keys(values).sort()).toEqual([...FOCUS_TOKENS].sort());
    expect(values).toMatchObject({
      games: "30",
      gamesAffected: "9",
      occurrences: "12",
      rate: "1.20",
      baselineRate: "1.60",
      target: "1.20",
      weeksRecurred: "3",
      weeksCounted: "5",
    });
    const summary = summaryTokenValues(WeeklyReport.parse(report));
    expect(Object.keys(summary).sort()).toEqual([...SUMMARY_TOKENS].sort());
    // round(4.256 * 1000 / 100) = 43 mistakes over 30 games.
    expect(summary).toEqual({ games: "30", mistakeRate: "4.26", mistakesPerGame: "1.4", focusCount: "1" });
    expect(renderText(report.summary, summary)).toBe("30 games, 1 thing to work on.");

    const big = WeeklyReport.parse({
      ...report,
      current: {
        ...report.current,
        games: 1500,
        stats: [{ ...stat("hung-piece", 1.2), games: 1500, gamesAffected: 1234, occurrences: 2048 }],
      },
    });
    expect(focusTokenValues(FocusChoice.parse(choice), big)).toMatchObject({
      games: "1,500",
      gamesAffected: "1,234",
      occurrences: "2,048",
      rate: "1.20",
    });
    expect(summaryTokenValues(big)).toMatchObject({ games: "1,500", mistakeRate: "4.26", mistakesPerGame: "0.0" });
    const busy = WeeklyReport.parse({
      ...report,
      current: { ...report.current, games: 2, moves: 1_000_000, mistakesPer100Moves: 0.5 },
    });
    expect(summaryTokenValues(busy).mistakesPerGame).toBe("2,500.0");
    const empty = WeeklyReport.parse({ ...report, current: { ...report.current, games: 0, moves: 0 } });
    expect(summaryTokenValues(empty).mistakesPerGame).toBe("0.0");
  });

  it("parses every export line kind", () => {
    const header = {
      type: "header",
      format: "blunderstruck-export",
      schemaVersion: 1,
      exportedAt: "2026-11-19T00:00:00Z",
    };
    expect(ExportLine.safeParse(header).success).toBe(true);
    expect(ExportLine.safeParse({ ...header, format: "other" }).success).toBe(false);
    expect(
      ExportLine.safeParse({ type: "track", data: { ...report.track, createdAt: "2026-11-19T00:00:00Z" } }).success,
    ).toBe(true);
    expect(ExportLine.safeParse({ type: "report", data: report }).success).toBe(true);
    expect(ExportLine.safeParse({ type: "game", data: {} }).success).toBe(false);
    expect(ExportLine.safeParse({ type: "other", data: {} }).success).toBe(false);
  });
});

const queenMove = {
  san: "Qd2",
  uci: "d1d2",
  from: "d1",
  to: "d2",
  piece: "queen",
  color: "white",
  check: false,
  mate: false,
  fenAfter: "r4rk1/ppp2ppp/5n2/8/8/8/PPPQ1KPP/R6R b - - 1 1",
};

const knightCheck = {
  san: "Ne4+",
  uci: "f6e4",
  from: "f6",
  to: "e4",
  piece: "knight",
  color: "black",
  check: true,
  mate: false,
  fenAfter: "r4rk1/ppp2ppp/8/8/4n3/8/PPPQ1KPP/R6R w - - 2 2",
};

const story = {
  played: queenMove,
  punish: [knightCheck],
  replyFound: true,
  actualReply: knightCheck,
  better: [{ ...queenMove, san: "Re1", uci: "h1e1", from: "h1", to: "e1", piece: "rook" }],
  targets: [
    { square: "f2", piece: "king", color: "white" },
    { square: "d2", piece: "queen", color: "white" },
  ],
  lost: { square: "d2", piece: "queen", color: "white" },
  gain: -6,
  betterReason: { kind: "covers-square", square: "e4" },
  winPctBefore: 94,
  winPctAfter: 26,
  depth: 18,
};

const spot = {
  id: "answer-check",
  basis: "line",
  count: 23,
  games: 17,
  of: 62,
  baselineCount: 30,
  baselineOf: 240,
  refinement: { id: "answer-knight-check", count: 9 },
  examples: [{ gameId: "g1", ply: 9 }],
};

const spotWindow = { start: "2026-10-08T00:00:00Z", end: "2026-11-19T00:00:00Z", games: 162, mistakes: 240 };

describe("story contracts", () => {
  it("accepts move details with their flags", () => {
    expect(MoveDetail.safeParse(queenMove).success).toBe(true);
    expect(
      MoveDetail.safeParse({ ...queenMove, san: "O-O", uci: "e1g1", from: "e1", to: "g1", piece: "king", castle: "king" })
        .success,
    ).toBe(true);
    expect(MoveDetail.safeParse({ ...queenMove, piece: "pawn", captured: "pawn", enPassant: true }).success).toBe(true);
    expect(MoveDetail.safeParse({ ...queenMove, piece: "pawn", promotion: "queen" }).success).toBe(true);
    expect(MoveDetail.safeParse({ ...queenMove, enPassant: false }).success).toBe(false);
    expect(MoveDetail.safeParse({ ...queenMove, castle: "long" }).success).toBe(false);
    expect(MoveDetail.safeParse({ ...queenMove, to: "i9" }).success).toBe(false);
    expect(MoveDetail.safeParse({ ...queenMove, piece: "amazon" }).success).toBe(false);
  });

  it("accepts a story and caps its lines and targets", () => {
    expect(ExampleStory.safeParse(story).success).toBe(true);
    expect(ExampleStory.safeParse({ ...story, punish: Array.from({ length: 9 }, () => knightCheck) }).success).toBe(
      false,
    );
    expect(ExampleStory.safeParse({ ...story, targets: Array.from({ length: 5 }, () => story.lost) }).success).toBe(
      false,
    );
    expect(ExampleStory.safeParse({ ...story, betterReason: { kind: "because" } }).success).toBe(false);
    expect(
      ExampleStory.safeParse({ ...story, betterReason: { kind: "wins", piece: "queen", gave: "knight", gain: 6 } })
        .success,
    ).toBe(true);
    expect(FocusExample.safeParse({ ...example, story, traits: ["answer-check", "lost-queen"] }).success).toBe(true);
  });
});

describe("blind-spot contracts", () => {
  it("lists every property with its family, parent and basis, in tie-break order", () => {
    expect(BLIND_SPOTS.map((s) => s.id)).toEqual([...BLIND_SPOT_IDS]);
    expect(BLIND_SPOT_IDS).toHaveLength(24);
    const children = BLIND_SPOTS.filter((s) => s.parent).map((s) => [s.id, s.parent]);
    expect(children).toEqual([
      ["answer-knight-check", "answer-check"],
      ["moved-onto-attacked", "moved-piece-lost"],
      ["moved-after-capture", "moved-piece-lost"],
      ["best-knight", "best-check"],
    ]);
    expect(BLIND_SPOTS.filter((s) => s.basis === "motif").map((s) => s.id)).toEqual([
      "answer-fork",
      "answer-discovered",
      "best-fork",
      "best-discovered",
    ]);
    for (const s of BLIND_SPOTS) {
      if (s.parent) expect(blindSpotInfo(s.parent)!.family).toBe(s.family);
    }
    expect(BLIND_SPOTS.filter((s) => s.family === "both").map((s) => s.id)).toEqual([
      "moves-1-10",
      "moves-11-20",
      "moves-21-30",
      "moves-31-plus",
    ]);
    expect(blindSpotInfo("lost-queen")).toEqual({ id: "lost-queen", family: "allowed", basis: "line" });
    expect(blindSpotInfo("some-future-property")).toBeUndefined();
  });

  it("puts six patterns in the two families and leaves the rest out", () => {
    expect(BLIND_SPOT_FAMILIES.allowed).toEqual(["allowed-tactic", "hung-piece", "allowed-mate"]);
    expect(BLIND_SPOT_FAMILIES.missed).toEqual(["missed-tactic", "missed-capture", "missed-mate"]);
    expect(blindSpotFamilyOf("hung-piece")).toBe("allowed");
    expect(blindSpotFamilyOf("missed-mate")).toBe("missed");
    for (const id of ["thrown-win", "time-trouble", "opening-trouble", "unknown"]) {
      expect(blindSpotFamilyOf(id)).toBeNull();
    }
  });

  it("accepts a blind spot and caps its examples", () => {
    expect(BlindSpot.safeParse(spot).success).toBe(true);
    expect(BlindSpot.safeParse({ ...spot, id: "some-future-property" }).success).toBe(true);
    expect(BlindSpot.safeParse({ ...spot, basis: "guess" }).success).toBe(false);
    expect(BlindSpot.safeParse({ ...spot, count: 1.5 }).success).toBe(false);
    expect(BlindSpot.safeParse({ ...spot, examples: [...spot.examples, ...spot.examples, ...spot.examples] }).success).toBe(
      false,
    );
  });

  it("fills habit-step tokens from the blind spot", () => {
    const values = blindSpotTokenValues(BlindSpot.parse(spot));
    expect(Object.keys(values).sort()).toEqual([...BLIND_SPOT_TOKENS].sort());
    expect(values).toEqual({ count: "23", of: "62", games: "17" });
    expect(renderText("In {count} of your {of}, across {games} games, it was a check.", values)).toBe(
      "In 23 of your 62, across 17 games, it was a check.",
    );
    expect(() => renderText("{count} of {gamesAffected}", values)).toThrow("gamesAffected");
    expect(blindSpotTokenValues({ count: 1234, of: 5678, games: 1500 })).toEqual({
      count: "1,234",
      of: "5,678",
      games: "1,500",
    });
  });
});

describe("game goals", () => {
  const goalOf = (gamesAffected: number, games: number) => gameGoalOf({ ...stat("hung-piece", 1), gamesAffected, games });

  it("states the goal in whole games", () => {
    expect(GAMES_TENTHS_FROM).toBe(9 / 20);
    expect(goalOf(51, 162)).toEqual({ per: 1, of: 4 });
    expect(goalOf(8, 10)).toEqual({ per: 6, of: 10 });
    expect(goalOf(5, 10)).toEqual({ per: 1, of: 3 });
    expect(goalOf(4, 40)).toEqual({ per: 1, of: 13 });
    // t = 0.45 exactly: tenths from there.
    expect(goalOf(6, 10)).toEqual({ per: 4, of: 10 });
    expect(goalOf(10, 10)).toEqual({ per: 7, of: 10 });
    expect(goalOf(0, 10)).toEqual({ per: 0, of: 1 });
    expect(goalOf(0, 0)).toEqual({ per: 0, of: 1 });
    for (const [a, g] of [
      [51, 162],
      [8, 10],
      [5, 10],
      [4, 40],
      [1, 3],
      [7, 9],
    ] as const) {
      expect(GameGoal.safeParse(goalOf(a, g)).success).toBe(true);
      // Every goal asks for fewer games than the baseline.
      expect(meetsGoal({ gamesAffected: a, games: g }, goalOf(a, g))).toBe(false);
    }
  });

  it("judges a stat against the goal in games", () => {
    const goal = { per: 1, of: 4 };
    expect(meetsGoal({ ...stat("hung-piece", 1), gamesAffected: 40, games: 162 }, goal)).toBe(true);
    expect(meetsGoal({ ...stat("hung-piece", 1), gamesAffected: 41, games: 162 }, goal)).toBe(false);
    expect(GameGoal.safeParse({ per: 1, of: 0 }).success).toBe(false);
    expect(GameGoal.safeParse({ per: -1, of: 4 }).success).toBe(false);
  });
});

describe("milestone 2b report fields", () => {
  it("still parses a report stored before blind spots, steps and goals", () => {
    const parsed = WeeklyReport.parse(report);
    expect(parsed.focus[0]!.blindSpots).toEqual([]);
    expect(parsed.focus[0]!.steps).toEqual([]);
    expect(parsed.focus[0]!.goal).toBeUndefined();
    expect(parsed.focus[0]!.blindSpotWindow).toBeUndefined();
    expect(parsed.cappedGameIds).toBeUndefined();
    expect(parsed.coverage.checked).toBeUndefined();
    expect(parsed.settings.checkDepth).toBeUndefined();
    expect(ExportLine.safeParse({ type: "report", data: report }).success).toBe(true);
    const { summary: _s, wording: _w, ...draft } = report;
    expect(ReportDraft.parse({ ...draft, focus: [choice] }).focus[0]!.blindSpots).toEqual([]);
  });

  it("accepts the new fields and caps blind spots and steps", () => {
    const steps = [{ blindSpot: "answer-check", text: "In {count} of your {of}, the answer was a check." }];
    const full = {
      ...item,
      examples: [{ ...example, story, traits: ["answer-check"] }],
      blindSpots: [spot],
      blindSpotWindow: spotWindow,
      steps,
      goal: { per: 1, of: 4 },
    };
    expect(FocusItem.safeParse(full).success).toBe(true);
    expect(MAX_BLIND_SPOTS).toBe(3);
    expect(FocusItem.safeParse({ ...full, blindSpots: [spot, spot, spot, spot] }).success).toBe(false);
    expect(FocusItem.safeParse({ ...full, steps: [...steps, ...steps, ...steps, ...steps] }).success).toBe(false);
    expect(FocusItem.safeParse({ ...full, goal: { per: 1, of: 0 } }).success).toBe(false);

    const { title: _t, why: _y, drill: _d, steps: _st, ...chosen } = full;
    const parsedChoice = FocusChoice.parse({ ...chosen, steps });
    expect("steps" in parsedChoice).toBe(false);
    expect(parsedChoice.blindSpots).toHaveLength(1);

    const next = {
      ...report,
      settings: { ...settings, analysisVersion: 3, checkDepth: 18 },
      coverage: { ...report.coverage, checked: 30 },
      focus: [full],
      cappedGameIds: ["g1"],
    };
    expect(WeeklyReport.safeParse(next).success).toBe(true);
    expect(Coverage.safeParse({ ...report.coverage, checked: -1 }).success).toBe(false);
    expect(WeeklyReport.safeParse({ ...next, settings: { ...next.settings, checkDepth: -1 } }).success).toBe(false);
    expect(ExportLine.safeParse({ type: "report", data: next }).success).toBe(true);
    expect(
      ExportLine.safeParse({
        type: "header",
        format: "blunderstruck-export",
        schemaVersion: 2,
        exportedAt: "2026-11-19T00:00:00Z",
      }).success,
    ).toBe(true);
  });
});
