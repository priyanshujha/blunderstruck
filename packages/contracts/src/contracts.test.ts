import { describe, expect, it } from "vitest";
import {
  ANALYSIS_VERSION,
  AnalyzedGame,
  AnalyzedMove,
  BEST_LINE_MAX_PLIES,
  PATTERN_IDS,
  PATTERNS_VERSION,
  PatternFinding,
  PatternId,
  PatternStat,
  PatternSummary,
  TopHabit,
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

  it("caps top habits at three and examples at two", () => {
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
      top: [habit, habit, habit],
    };
    expect(PatternSummary.safeParse(summary).success).toBe(true);
    expect(PatternSummary.safeParse({ ...summary, top: [habit, habit, habit, habit] }).success).toBe(false);
  });
});
