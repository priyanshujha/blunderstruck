import { PATTERN_IDS, type PatternFinding, type PatternSummary } from "@blunderstruck/contracts";
import { patternStats } from "@blunderstruck/patterns";
import { describe, expect, it } from "vitest";
import { priorities, type WeekFindings } from "./priority";

const GAMES_PER_WEEK = 25;
const MOVES_PER_WEEK = 1000;

const finding = (patternId: string, gameId: string, ply: number, winPctLoss: number): PatternFinding => ({
  patternId,
  gameId,
  ply,
  winPctLoss,
});

/** `counts[a]` findings of the pattern in week `a`, each in its own game and on its own ply. */
const spread = (patternId: string, counts: readonly number[], loss: number): PatternFinding[][] =>
  counts.map((n, a) => Array.from({ length: n }, (_, i) => finding(patternId, `${patternId}-w${a}-g${i}`, 10 + i, loss)));

function makeWeeks(
  perWeek: readonly PatternFinding[][][],
  games: readonly number[] = Array(6).fill(GAMES_PER_WEEK),
  moves: readonly number[] = Array(6).fill(MOVES_PER_WEEK),
): WeekFindings[] {
  return Array.from({ length: 6 }, (_, a) => ({
    start: `2026-10-${String(1 + a).padStart(2, "0")}T00:00:00.000Z`,
    end: `2026-10-${String(2 + a).padStart(2, "0")}T00:00:00.000Z`,
    games: games[a]!,
    moves: moves[a]!,
    findings: perWeek.flatMap((p) => p[a] ?? []),
  }));
}

function summaryOf(week: WeekFindings): PatternSummary {
  return {
    player: "test-player",
    patternsVersion: 1,
    analysisVersion: 1,
    engine: { name: "stub", depth: 12 },
    games: week.games,
    moves: week.moves,
    mistakesPer100Moves: 0,
    stats: patternStats(week.games, week.moves, week.findings),
    findings: [...week.findings],
    openings: [],
    top: [],
  };
}

const byId = (ps: ReturnType<typeof priorities>, id: string) => {
  const p = ps.find((x) => x.patternId === id);
  if (!p) throw new Error(`no priority for ${id}`);
  return p;
};

/** Weighted moves and findings, recomputed here for the terms the result does not expose. */
const W = [0, 1, 2, 3, 4, 5].map((a) => 2 ** (-a / 3));
const weighted = (xs: readonly number[]) => xs.reduce((s, x, a) => s + W[a]! * x, 0);

describe("priorities: three patterns over six full weeks", () => {
  const thrown = spread("thrown-win", [6, 0, 1, 0, 0, 0], 40);
  const tactic = spread("missed-tactic", [3, 4, 1, 2, 3, 4], 25);
  const hung = spread("hung-piece", [4, 5, 3, 4, 5, 4], 30);
  const weeks = makeWeeks([thrown, tactic, hung]);
  const result = priorities({ weeks, current: summaryOf(weeks[0]!), band: "club", cooldown: new Set() });

  it("weights the moves and findings as the plan says", () => {
    const N = weighted(Array(6).fill(MOVES_PER_WEEK));
    // The plan's 3635.5 uses weights rounded to 4 decimals; the exact sum is 3635.4916.
    expect(N).toBeCloseTo(3635.492, 3);
    expect(weighted([6, 0, 1, 0, 0, 0])).toBeCloseTo(6.63, 3);
    expect(weighted([3, 4, 1, 2, 3, 4])).toBeCloseTo(10.255, 3);
    expect(weighted([4, 5, 3, 4, 5, 4])).toBeCloseTo(15.103, 3);
  });

  it("thrown-win", () => {
    const p = byId(result, "thrown-win");
    expect(p.rate).toBeCloseTo(0.208, 3);
    expect(p.severity).toBeCloseTo(36.524, 3);
    expect(p.recentCost).toBeCloseTo(7.601, 3);
    expect(p.chronicity).toBeCloseTo(0.2751, 4);
    expect(p.score).toBeCloseTo(9.691, 3);
    expect(p.naiveCostThisPeriod).toBeCloseTo(24, 3);
    expect(p.persistence).toEqual({
      weeksRecurred: 1,
      weeksCounted: 6,
      weeks: [true, false, false, false, false, false],
      chronicity: p.chronicity,
    });
  });

  it("missed-tactic", () => {
    const p = byId(result, "missed-tactic");
    expect(p.rate).toBeCloseTo(0.311, 3);
    expect(p.severity).toBeCloseTo(25, 3);
    expect(p.recentCost).toBeCloseTo(7.772, 3);
    expect(p.chronicity).toBeCloseTo(0.8267, 4);
    expect(p.score).toBeCloseTo(14.198, 3);
    expect(p.naiveCostThisPeriod).toBeCloseTo(7.5, 3);
    expect(p.persistence.weeks).toEqual([true, true, false, true, true, true]);
    expect(p.persistence.weeksRecurred).toBe(5);
  });

  it("hung-piece", () => {
    const p = byId(result, "hung-piece");
    expect(p.rate).toBeCloseTo(0.485, 3);
    expect(p.severity).toBeCloseTo(29.415, 3);
    expect(p.recentCost).toBeCloseTo(14.27, 3);
    expect(p.chronicity).toBeCloseTo(1, 4);
    expect(p.score).toBeCloseTo(28.541, 3);
    expect(p.naiveCostThisPeriod).toBeCloseTo(12, 3);
    expect(p.persistence.weeksRecurred).toBe(6);
  });

  it("ranks hung-piece, missed-tactic, thrown-win; patterns without findings are ineligible", () => {
    expect(result.filter((p) => p.rank !== null).map((p) => [p.patternId, p.rank])).toEqual([
      ["hung-piece", 1],
      ["missed-tactic", 2],
      ["thrown-win", 3],
    ]);
    expect(result).toHaveLength(PATTERN_IDS.length);
    for (const p of result.slice(3)) {
      expect(p.eligible).toBe(false);
      expect(p.rank).toBeNull();
    }
  });
});

describe("priorities: special cases", () => {
  it("small sample: a 5-game, 150-move week with two missed mates", () => {
    const weeks = makeWeeks([spread("missed-mate", [2, 0, 0, 0, 0, 0], 60)], [5, 25, 25, 25, 25, 25], [150, 1000, 1000, 1000, 1000, 1000]);
    const p = byId(priorities({ weeks, current: summaryOf(weeks[0]!), band: "club", cooldown: new Set() }), "missed-mate");
    // The plan's 2785.5 uses weights rounded to 4 decimals; the exact sum is 2785.4916.
    expect(weighted([150, 1000, 1000, 1000, 1000, 1000])).toBeCloseTo(2785.492, 3);
    expect(p.rate).toBeCloseTo(0.102, 3);
    expect(p.severity).toBeCloseTo(42.5, 3);
    expect(p.recentCost).toBeCloseTo(4.325, 3);
    expect(p.chronicity).toBeCloseTo(0.2751, 4);
    expect(p.score).toBeCloseTo(5.515, 3);
    expect(p.naiveCostThisPeriod).toBeCloseTo(80, 3);
    expect(p.rank).toBe(1);
  });

  it("with only 2 counted weeks, chronicity is 0", () => {
    const weeks = makeWeeks([spread("hung-piece", [4, 5, 3, 4, 5, 4], 30)], [25, 25, 4, 4, 4, 4]);
    const p = byId(priorities({ weeks, current: summaryOf(weeks[0]!), band: "club", cooldown: new Set() }), "hung-piece");
    expect(p.persistence).toEqual({
      weeksRecurred: 2,
      weeksCounted: 2,
      weeks: [true, true, null, null, null, null],
      chronicity: 0,
    });
    expect(p.chronicity).toBe(0);
    expect(p.score).toBeCloseTo(p.recentCost, 9);
    // Uncounted weeks still feed N and K.
    expect(p.rate).toBeCloseTo(0.485, 3);
  });

  it("a finding shared with the first pick drops out of the second pattern's K", () => {
    const hung = spread("hung-piece", [4, 5, 3, 4, 5, 4], 30);
    // Three thrown-win findings in week 0, two on the same moves as hung-piece findings.
    const shared = hung[0]!.slice(0, 2).map((f) => finding("thrown-win", f.gameId, f.ply, 40));
    const thrown = [[...shared, finding("thrown-win", "own-game", 20, 40)], [], [], [], [], []];
    const weeks = makeWeeks([hung, thrown]);
    const result = priorities({ weeks, current: summaryOf(weeks[0]!), band: "club", cooldown: new Set() });

    expect(byId(result, "hung-piece").rank).toBe(1);
    const p = byId(result, "thrown-win");
    expect(p.rank).toBe(2);
    const N = weighted(Array(6).fill(MOVES_PER_WEEK));
    // K = 1, not 3.
    expect(p.rate).toBeCloseTo((100 * (0.52 * 3 + 1)) / (300 + N), 9);
    expect(p.severity).toBeCloseTo((50 + 40) / 3, 9);
    expect(p.persistence.weeks[0]).toBe(false);
    // The current period's naive cost still counts every finding.
    expect(p.naiveCostThisPeriod).toBeCloseTo(12, 3);
  });

  it("an ineligible pattern has rank null and its round-one numbers", () => {
    const tactic = spread("missed-tactic", [3, 4, 1, 2, 3, 4], 25);
    const hung = spread("hung-piece", [4, 5, 3, 4, 5, 4], 30);
    // A novice is never asked to work on missed-tactic.
    const weeks = makeWeeks([tactic, hung]);
    const result = priorities({ weeks, current: summaryOf(weeks[0]!), band: "novice", cooldown: new Set() });
    const p = byId(result, "missed-tactic");
    expect(p.eligible).toBe(false);
    expect(p.rank).toBeNull();
    expect(p.score).toBeCloseTo(14.198, 3);
    expect(byId(result, "hung-piece").rank).toBe(1);
  });

  it("a pattern below this period's floor is ineligible", () => {
    // One finding in the current week: under 2 findings in 2 games.
    const weeks = makeWeeks([spread("hung-piece", [1, 5, 3, 4, 5, 4], 30)]);
    const p = byId(priorities({ weeks, current: summaryOf(weeks[0]!), band: "club", cooldown: new Set() }), "hung-piece");
    expect(p.eligible).toBe(false);
    expect(p.rank).toBeNull();
  });

  it("a pattern in cooldown is ineligible and covers nothing", () => {
    const hung = spread("hung-piece", [4, 5, 3, 4, 5, 4], 30);
    // Two of week 0's thrown-win findings sit on hung-piece moves.
    const shared = hung[0]!.slice(0, 2).map((f) => finding("thrown-win", f.gameId, f.ply, 40));
    const thrown = [[...shared, finding("thrown-win", "own-game", 20, 40)], [], [], [], [], []];
    const weeks = makeWeeks([hung, thrown]);
    const result = priorities({ weeks, current: summaryOf(weeks[0]!), band: "club", cooldown: new Set(["hung-piece"]) });

    const top = byId(result, "hung-piece");
    expect(top.eligible).toBe(false);
    expect(top.rank).toBeNull();
    expect(top.score).toBeCloseTo(28.541, 3);
    const p = byId(result, "thrown-win");
    expect(p.rank).toBe(1);
    const N = weighted(Array(6).fill(MOVES_PER_WEEK));
    // Nothing covered: K = 3.
    expect(p.rate).toBeCloseTo((100 * (0.52 * 3 + 3)) / (300 + N), 9);
    expect(p.severity).toBeCloseTo((50 + 120) / 5, 9);
    expect(p.persistence.weeks[0]).toBe(true);
  });
});
