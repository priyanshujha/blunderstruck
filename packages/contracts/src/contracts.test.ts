import { describe, expect, it } from "vitest";
import {
  ANALYSIS_VERSION,
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
  it("is version 2 and caps the stored main line", () => {
    expect(ANALYSIS_VERSION).toBe(2);
    expect(AnalyzedMove.safeParse(move).success).toBe(true);
    expect(AnalyzedMove.safeParse({ ...move, bestLine: ["e2e4", "e7e5"] }).success).toBe(true);
    const tooLong = Array.from({ length: BEST_LINE_MAX_PLIES + 1 }, () => "e2e4");
    expect(AnalyzedMove.safeParse({ ...move, bestLine: tooLong }).success).toBe(false);

    const game = { gameId: "g1", analysisVersion: 2, engine: { name: "stub", depth: 12 }, moves: [move] };
    expect(AnalyzedGame.safeParse(game).success).toBe(true);
    expect(AnalyzedGame.safeParse({ ...game, finalLine: ["e7e5"] }).success).toBe(true);
    expect(AnalyzedGame.safeParse({ ...game, finalLine: tooLong }).success).toBe(false);
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
  });

  it("formats token values with two-decimal rates", () => {
    const values = focusTokenValues(choice as FocusChoice, report as WeeklyReport);
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
    const summary = summaryTokenValues(report as WeeklyReport);
    expect(Object.keys(summary).sort()).toEqual([...SUMMARY_TOKENS].sort());
    expect(summary).toEqual({ games: "30", mistakeRate: "4.26", focusCount: "1" });
    expect(renderText(report.summary, summary)).toBe("30 games, 1 thing to work on.");
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
