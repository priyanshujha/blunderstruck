import {
  PATTERN_IDS,
  type AnalyzedGame,
  type FocusChoice,
  type PatternFinding,
  type PatternPriority,
  type PatternProgress,
  type PatternStat,
  type PatternSummary,
  type PeriodStats,
  type ProgressVerdict,
  type RatingBand,
  type RetiredFocus,
  type WeeklyReport,
} from "@blunderstruck/contracts";
import type { PlayerGame } from "@blunderstruck/patterns";
import { describe, expect, it } from "vitest";
// The patterns package's own test helpers: invented games through the real analysis, stub engine.
import { fixtureGame } from "../../patterns/src/test-fixtures";
import { chooseFocus, cooldownPatterns, type FocusInput } from "./focus";

const X = "hung-piece";
const Y = "missed-tactic";
const Z = "thrown-win";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Report `i` ends `i` weeks after 2026-01-01; the report being built is at week 20. */
const end = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 7 * 24 * 3600 * 1000).toISOString();
const NOW = end(20);

/** Two occurrences per affected game, so the goal in games and the rate per 100 moves agree here. */
const stat = (patternId: string, games: number, moves: number, occurrences: number): PatternStat => ({
  patternId,
  games,
  moves,
  gamesAffected: Math.min(Math.ceil(occurrences / 2), games),
  occurrences,
  per100Moves: moves === 0 ? 0 : (occurrences * 100) / moves,
  avgWinPctLoss: 20,
});

/**
 * A held item: started at 4.0 per 100 moves (20 of 30 games), target 3.0; its derived goal is
 * {5, 10}, met at 25 occurrences (13 games) and not at 35 (18 games).
 */
const BASELINE = stat(X, 30, 1000, 40);
const TARGET = 3;

const persistence = { weeksRecurred: 3, weeksCounted: 6, weeks: [true, true, true, false, false, false], chronicity: 0.5 };

/** Ranked patterns in the given order with the given scores; every other pattern unranked and ineligible. */
function prios(ranked: readonly [string, number][]): PatternPriority[] {
  const entry = (patternId: string, score: number, rank: number | null): PatternPriority => ({
    patternId,
    eligible: rank !== null,
    rank,
    rate: 1,
    severity: 25,
    recentCost: score / 2,
    naiveCostThisPeriod: score,
    chronicity: 0.5,
    score,
    persistence,
  });
  const out = ranked.map(([patternId, score], i) => entry(patternId, score, i + 1));
  for (const id of PATTERN_IDS) if (!ranked.some(([r]) => r === id)) out.push(entry(id, 0, null));
  return out;
}

type HeldItem = { id: string; since: string; baseline?: PatternStat; target?: number; goal?: { per: number; of: number } };

function report(opts: {
  i: number;
  focus?: HeldItem[];
  progress?: { id: string; verdict: ProgressVerdict; occurrences: number }[];
  retired?: { id: string; why: RetiredFocus["why"] }[];
  priorities?: PatternPriority[];
  final?: boolean;
  revision?: number;
}): WeeklyReport {
  const focus = (opts.focus ?? []).map((f) => ({
    patternId: f.id,
    since: f.since,
    baseline: f.baseline ?? BASELINE,
    target: f.target ?? TARGET,
    ...(f.goal ? { goal: f.goal } : {}),
  }));
  const progress: PatternProgress[] = (opts.progress ?? []).map((p) => ({
    patternId: p.id,
    previous: stat(p.id, 30, 4000, 120),
    current: stat(p.id, 30, 1000, p.occurrences),
    verdict: p.verdict,
    pValue: p.verdict === "insufficient-data" ? null : 0.2,
  }));
  const retired = (opts.retired ?? []).map((r) => ({
    patternId: r.id,
    why: r.why,
    since: end(0),
    baseline: BASELINE,
    current: BASELINE,
  }));
  const final = opts.final ?? true;
  return {
    periodEnd: end(opts.i),
    revision: opts.revision ?? 0,
    coverage: { sampled: 30, analysed: final ? 30 : 10, total: 30, complete: final, sampleOnly: false },
    focus,
    progress,
    retired,
    priorities: opts.priorities ?? prios([]),
  } as unknown as WeeklyReport;
}

/** A run of final reports holding `X` since report `first`, each measuring it after the first. */
function heldRun(first: number, last: number, measure: (i: number) => { verdict: ProgressVerdict; occurrences: number }) {
  return Array.from({ length: last - first + 1 }, (_, k) => {
    const i = first + k;
    return report({
      i,
      focus: [{ id: X, since: end(first) }],
      progress: i === first ? [] : [{ id: X, ...measure(i) }],
    });
  });
}

const AT_TARGET = { verdict: "flat" as const, occurrences: 25 };
const ABOVE_TARGET = { verdict: "flat" as const, occurrences: 35 };
const INSUFFICIENT = { verdict: "insufficient-data" as const, occurrences: 25 };

/** Current period: 30 games, 1,000 moves; `counts` gives each pattern's findings. */
function summary(counts: Record<string, number>, games = 30, findings: PatternFinding[] = []): PatternSummary {
  return {
    player: "test-player",
    patternsVersion: 1,
    analysisVersion: 2,
    engine: { name: "stub", depth: 12 },
    games,
    moves: 1000,
    mistakesPer100Moves: 5,
    stats: Object.entries(counts).map(([id, n]) => stat(id, games, 1000, n)),
    findings,
    openings: [],
    top: [],
  };
}

/** The comparison window: 30 games, 4,000 moves, X at 3.0 per 100 moves unless given. */
function comparison(counts: Record<string, number> = { [X]: 120 }): PeriodStats {
  return {
    start: end(15),
    end: end(19),
    games: 30,
    moves: 4000,
    mistakesPer100Moves: 5,
    settings: { analysisVersion: 2, patternsVersion: 1, engine: { name: "stub", depth: 12 } },
    stats: Object.entries(counts).map(([id, n]) => stat(id, 30, 4000, n)),
  };
}

function input(over: Partial<FocusInput> & { history: WeeklyReport[] }): FocusInput {
  return {
    current: summary({ [X]: 25, [Y]: 30, [Z]: 20 }),
    comparison: comparison(),
    priorities: prios([
      [Y, 10],
      [Z, 8],
    ]),
    band: "club",
    periodEnd: NOW,
    analyses: new Map(),
    window: { games: [], findings: [], start: end(14), end: NOW },
    ...over,
  };
}

const ids = (xs: readonly { patternId: string }[]) => xs.map((x) => x.patternId);
const kindOf = (focus: FocusChoice[], id: string) => focus.find((f) => f.patternId === id)?.reason.kind;

describe("chooseFocus: graduation", () => {
  it("graduates after this report and the previous enough-data report are both at target", () => {
    const r = chooseFocus(input({ history: heldRun(10, 11, () => AT_TARGET) }));
    expect(r.retired).toMatchObject([{ patternId: X, why: "graduated", since: end(10), baseline: BASELINE }]);
    expect(ids(r.focus)).toEqual([Y, Z]);
  });

  it("needs two: the report that chose the item is not a measurement", () => {
    const r = chooseFocus(input({ history: heldRun(10, 10, () => AT_TARGET) }));
    expect(r.retired).toEqual([]);
    expect(kindOf(r.focus, X)).toBe("kept");
  });

  it("skips a report without enough data between the two", () => {
    const history = heldRun(10, 12, (i) => (i === 12 ? INSUFFICIENT : AT_TARGET));
    expect(chooseFocus(input({ history })).retired).toMatchObject([{ patternId: X, why: "graduated" }]);
  });

  it("does not graduate when the earlier enough-data report was above target", () => {
    const history = heldRun(10, 12, (i) => (i === 12 ? INSUFFICIENT : ABOVE_TARGET));
    const r = chooseFocus(input({ history }));
    expect(r.retired).toEqual([]);
    expect(kindOf(r.focus, X)).toBe("kept");
  });

  it("does not graduate when this report has too few games for a verdict", () => {
    const r = chooseFocus(
      input({ history: heldRun(10, 12, () => AT_TARGET), current: summary({ [X]: 2, [Y]: 30, [Z]: 20 }, 8) }),
    );
    expect(r.progress[0]!.verdict).toBe("insufficient-data");
    expect(r.retired).toEqual([]);
  });

  it("does not graduate on a 'worse' verdict, even at target", () => {
    // 2.5 per 100 moves is under the target of 3.0, but against 1.0 before it is "worse".
    const r = chooseFocus(input({ history: heldRun(10, 11, () => AT_TARGET), comparison: comparison({ [X]: 40 }) }));
    expect(r.progress[0]!.verdict).toBe("worse");
    expect(r.retired).toEqual([]);
    expect(kindOf(r.focus, X)).toBe("kept");
  });

  it("does not graduate when the earlier report was 'worse'", () => {
    const history = heldRun(10, 11, () => ({ verdict: "worse", occurrences: 25 }));
    expect(chooseFocus(input({ history })).retired).toEqual([]);
  });
});

describe("chooseFocus: rotation", () => {
  const challenger = prios([
    [Y, 10],
    [X, 5],
  ]);
  const weaker = prios([
    [X, 10],
    [Y, 5],
  ]);

  it("rotates after 6 enough-data reports when an unheld eligible pattern scores higher", () => {
    // Reports 10 to 15: five measurements, plus this one.
    const r = chooseFocus(input({ history: heldRun(10, 15, () => ABOVE_TARGET), priorities: challenger }));
    expect(r.retired).toMatchObject([{ patternId: X, why: "rotated" }]);
    expect(ids(r.focus)).toEqual([Y]);
  });

  it("keeps the item before 6 reports", () => {
    const r = chooseFocus(input({ history: heldRun(10, 14, () => ABOVE_TARGET), priorities: challenger }));
    expect(r.retired).toEqual([]);
    expect(ids(r.focus)).toEqual([X, Y]);
  });

  it("does not count reports without enough data", () => {
    const history = heldRun(10, 15, (i) => (i === 13 ? INSUFFICIENT : ABOVE_TARGET));
    expect(chooseFocus(input({ history, priorities: challenger })).retired).toEqual([]);
  });

  it("keeps the item when no unheld pattern scores higher", () => {
    const r = chooseFocus(input({ history: heldRun(10, 15, () => ABOVE_TARGET), priorities: weaker }));
    expect(r.retired).toEqual([]);
    expect(kindOf(r.focus, X)).toBe("kept");
  });
});

describe("chooseFocus: cooldown", () => {
  const top = prios([
    [X, 20],
    [Y, 10],
    [Z, 5],
  ]);
  const retiredAt = (i: number, why: RetiredFocus["why"]) => report({ i, retired: [{ id: X, why }] });

  it("keeps a graduated pattern out for the next 2 final reports", () => {
    // Retired at 10, report 11 is the first after it; this is the second.
    const r = chooseFocus(input({ history: [retiredAt(10, "graduated"), report({ i: 11 })], priorities: top }));
    expect(ids(r.focus)).toEqual([Y, Z]);
  });

  it("allows it again afterwards, as 'returned'", () => {
    const history = [retiredAt(10, "rotated"), report({ i: 11 }), report({ i: 12 })];
    const r = chooseFocus(input({ history, priorities: top }));
    expect(ids(r.focus)).toEqual([X, Y]);
    expect(kindOf(r.focus, X)).toBe("returned");
  });

  it("does not count provisional reports towards the cooldown", () => {
    const history = [retiredAt(10, "graduated"), report({ i: 11, final: false }), report({ i: 12 })];
    expect(ids(chooseFocus(input({ history, priorities: top })).focus)).toEqual([Y, Z]);
  });

  it("does not cool down an outgrown pattern", () => {
    const history = [retiredAt(12, "outgrown")];
    expect(ids(chooseFocus(input({ history, priorities: top })).focus)).toEqual([X, Y]);
  });

  it("cooldownPatterns lists graduated and rotated patterns of the last 2 final reports", () => {
    const history = [
      report({ i: 9, retired: [{ id: "missed-mate", why: "graduated" }] }),
      report({ i: 10, retired: [{ id: X, why: "graduated" }, { id: Z, why: "outgrown" }] }),
      report({ i: 11, retired: [{ id: Y, why: "rotated" }] }),
      report({ i: 12, final: false, retired: [{ id: "allowed-mate", why: "graduated" }] }),
    ];
    expect(cooldownPatterns(history)).toEqual(new Set([X, Y]));
    expect(cooldownPatterns([...history].reverse())).toEqual(new Set([X, Y]));
  });
});

describe("chooseFocus: cooldown window and the report being completed", () => {
  it("cooldownPatterns with `before` ignores a sample-only report for that period, as chooseFocus does", () => {
    const sampleOnlyNow = {
      ...report({ i: 20, retired: [{ id: Z, why: "graduated" }] }),
      coverage: { sampled: 30, analysed: 30, total: 60, complete: false, sampleOnly: true },
    } as WeeklyReport;
    const history = [
      report({ i: 10, retired: [{ id: X, why: "graduated" }] }),
      report({ i: 11 }),
      sampleOnlyNow,
    ];
    // Without a bound the sample-only report is the latest final one and shifts the window.
    expect(cooldownPatterns(history)).toEqual(new Set([Z]));
    expect(cooldownPatterns(history, NOW)).toEqual(new Set([X]));

    const priorities = prios([
      [X, 20],
      [Z, 10],
      [Y, 5],
    ]);
    const r = chooseFocus(input({ history, priorities }));
    expect(ids(r.focus)).toEqual([Z, Y]);
    expect(r.focus.some((f) => cooldownPatterns(history, NOW).has(f.patternId))).toBe(false);
  });
});

describe("chooseFocus: few-games reports are neutral", () => {
  const fewGames = (r: WeeklyReport): WeeklyReport => ({ ...r, notes: ["few-games"] }) as WeeklyReport;
  const top = prios([
    [X, 20],
    [Y, 10],
    [Z, 5],
  ]);

  it("does not count toward the cooldown: R1 graduates X, R2 has few games, R3 and R4 still skip X", () => {
    const r1 = report({ i: 1, retired: [{ id: X, why: "graduated" }] });
    const r2 = fewGames(report({ i: 2 }));
    const r3 = report({ i: 3 });
    expect(cooldownPatterns([r1, r2], end(3))).toEqual(new Set([X]));
    expect(cooldownPatterns([r1, r2, r3], end(4))).toEqual(new Set([X]));
    const at4 = chooseFocus(input({ history: [r1, r2, r3], priorities: top, periodEnd: end(4) }));
    expect(ids(at4.focus)).toEqual([Y, Z]);
    // After two real reports, X may return.
    const at5 = chooseFocus(input({ history: [r1, r2, r3, report({ i: 4 })], priorities: top, periodEnd: end(5) }));
    expect(ids(at5.focus)).toEqual([X, Y]);
  });

  it("does not count toward rotation or break the held run", () => {
    const challenger = prios([
      [Y, 10],
      [X, 5],
    ]);
    // Reports 10 to 14 are four measurements; a few-games report 15 must not make it five.
    const run = heldRun(10, 14, () => ABOVE_TARGET);
    const quiet = fewGames(
      report({ i: 15, focus: [{ id: X, since: end(10) }], progress: [{ id: X, verdict: "flat", occurrences: 35 }] }),
    );
    expect(chooseFocus(input({ history: [...run, quiet], priorities: challenger })).retired).toEqual([]);
    // With one more real measurement it rotates, the quiet report in between notwithstanding.
    const more = report({ i: 16, focus: [{ id: X, since: end(10) }], progress: [{ id: X, ...ABOVE_TARGET }] });
    const r = chooseFocus(input({ history: [...run, quiet, more], priorities: challenger }));
    expect(r.retired).toMatchObject([{ patternId: X, why: "rotated" }]);
  });

  it("takes previous ranks from the last report that is not few-games", () => {
    const real = report({ i: 18, priorities: prios([[Y, 20], [Z, 10]]) });
    const quiet = fewGames(report({ i: 19, priorities: prios([]) }));
    const focus = chooseFocus(input({ history: [real, quiet] })).focus;
    expect(kindOf(focus, Y)).toBe("new");
    expect(focus[0]!.reason.previousRank).toBe(1);
  });
});

describe("chooseFocus: unranked eligible patterns", () => {
  it("never makes two patterns on the same moves both focus items", () => {
    // Y and Z share every move; Z comes back eligible but unranked because Y covers them.
    const findings: PatternFinding[] = [
      { patternId: Y, gameId: "a", ply: 5, winPctLoss: 30 },
      { patternId: Z, gameId: "a", ply: 5, winPctLoss: 30 },
      { patternId: Y, gameId: "b", ply: 7, winPctLoss: 30 },
      { patternId: Z, gameId: "b", ply: 7, winPctLoss: 30 },
    ];
    const priorities = prios([[Y, 10]]).map((p) => (p.patternId === Z ? { ...p, eligible: true, score: 9 } : p));
    const r = chooseFocus(input({ history: [], priorities, current: summary({ [Y]: 2, [Z]: 2 }, 30, findings) }));
    expect(ids(r.focus)).toEqual([Y]);
  });
});

describe("chooseFocus: retiring and refilling", () => {
  it("retires hung-piece as outgrown when the band moves from club to advanced", () => {
    const history = [report({ i: 19, focus: [{ id: X, since: end(19) }] })];
    const r = chooseFocus(input({ history, band: "advanced" as RatingBand }));
    expect(r.retired).toMatchObject([{ patternId: X, why: "outgrown", since: end(19) }]);
    expect(ids(r.focus)).toEqual([Y, Z]);
  });

  it("checks outgrown before graduation", () => {
    const r = chooseFocus(input({ history: heldRun(10, 11, () => AT_TARGET), band: "advanced" }));
    expect(r.retired).toMatchObject([{ patternId: X, why: "outgrown" }]);
  });

  it("never picks a pattern retired in this report to fill a free slot", () => {
    // X graduates and is still the top priority; it must not come straight back.
    const priorities = prios([
      [X, 20],
      [Y, 10],
      [Z, 5],
    ]);
    const graduated = chooseFocus(input({ history: heldRun(10, 11, () => AT_TARGET), priorities }));
    expect(graduated.retired).toMatchObject([{ patternId: X, why: "graduated" }]);
    expect(ids(graduated.focus)).toEqual([Y, Z]);

    // Same for an outgrown pattern, even if the priorities still call it eligible.
    const history = [report({ i: 19, focus: [{ id: X, since: end(19) }] })];
    const outgrown = chooseFocus(input({ history, priorities, band: "advanced" }));
    expect(ids(outgrown.focus)).toEqual([Y, Z]);
  });

  it("gives a new item since = periodEnd, the current stat as baseline and target = 0.75 baseline", () => {
    const r = chooseFocus(input({ history: [] }));
    const y = r.focus.find((f) => f.patternId === Y)!;
    expect(y.since).toBe(NOW);
    expect(y.baseline).toEqual(stat(Y, 30, 1000, 30));
    expect(y.target).toBeCloseTo(0.75 * 3, 10);
  });

  it("carries since, baseline and target of a kept item", () => {
    const baseline = stat(X, 30, 1000, 48);
    const history = [report({ i: 19, focus: [{ id: X, since: end(17), baseline, target: 3.6 }] })];
    const x = chooseFocus(input({ history })).focus[0]!;
    expect(x).toMatchObject({ patternId: X, since: end(17), baseline, target: 3.6 });
  });

  it("returns no focus when no pattern is eligible", () => {
    expect(chooseFocus(input({ history: [], priorities: prios([]) })).focus).toEqual([]);
  });

  it("reports progress for every previous item, kept or retired", () => {
    const history = [report({ i: 19, focus: [{ id: X, since: end(15) }, { id: Y, since: end(18) }] })];
    const r = chooseFocus(input({ history, band: "advanced" }));
    expect(ids(r.progress)).toEqual([X, Y]);
    expect(r.progress[0]).toMatchObject({
      previous: stat(X, 30, 4000, 120),
      current: stat(X, 30, 1000, 25),
      verdict: "flat",
    });
    expect(r.progress[0]!.pValue).not.toBeNull();
  });

  it("gives empty progress on a first report", () => {
    expect(chooseFocus(input({ history: [], comparison: null })).progress).toEqual([]);
  });
});

describe("chooseFocus: kind", () => {
  const prev = (ranks: [string, number][], focus: HeldItem[] = [], retired: { id: string; why: RetiredFocus["why"] }[] = []) =>
    report({ i: 19, priorities: prios(ranks), focus, retired });
  const pick = (history: WeeklyReport[]) =>
    chooseFocus(input({ history, priorities: prios([[Y, 10], [Z, 8]]) })).focus;

  it("is 'new' on a first report", () => {
    expect(pick([]).map((f) => f.reason.kind)).toEqual(["new", "new"]);
  });

  it("is 'new' when the previous rank was 1 or 2, and 'rose' from rank 3 or none", () => {
    const focus = pick([prev([[X, 30], [Y, 20], [Z, 10]])]);
    expect(kindOf(focus, Y)).toBe("new");
    expect(kindOf(focus, Z)).toBe("rose");
    expect(focus.find((f) => f.patternId === Z)!.reason.previousRank).toBe(3);

    const unranked = pick([prev([[X, 30]])]);
    expect(kindOf(unranked, Y)).toBe("rose");
    expect(unranked[0]!.reason.previousRank).toBeNull();
  });

  it("puts 'returned' before 'rose' and 'new'", () => {
    // Retired at 5, so its cooldown ended with reports 6 and 7.
    const history = [
      report({ i: 5, retired: [{ id: Z, why: "graduated" }] }),
      report({ i: 6 }),
      report({ i: 7 }),
      prev([[Y, 20], [X, 15], [Z, 10]]),
    ];
    const focus = pick(history);
    expect(kindOf(focus, Y)).toBe("new");
    expect(kindOf(focus, Z)).toBe("returned");
  });

  it("puts 'kept' before everything", () => {
    const history = [
      report({ i: 5, retired: [{ id: Y, why: "graduated" }] }),
      prev([[X, 30]], [{ id: Y, since: end(10) }]),
    ];
    expect(kindOf(pick(history), Y)).toBe("kept");
  });

  it("copies the current priority numbers into the reason", () => {
    const y = pick([])[0]!;
    expect(y.reason).toMatchObject({ score: 10, recentCost: 5, naiveCostThisPeriod: 10, weeksRecurred: 3, weeksCounted: 6 });
    expect(y.reason.weeks).toEqual(persistence.weeks);
  });
});

describe("chooseFocus: history", () => {
  it("ignores a provisional revision", () => {
    const history = [
      report({ i: 18, focus: [{ id: X, since: end(18) }] }),
      report({ i: 19, final: false, focus: [{ id: Z, since: end(19) }], retired: [{ id: X, why: "graduated" }] }),
    ];
    const r = chooseFocus(input({ history }));
    expect(ids(r.progress)).toEqual([X]);
    expect(kindOf(r.focus, X)).toBe("kept");
    expect(kindOf(r.focus, Y)).toBe("rose");
  });

  it("uses the latest revision of a period", () => {
    const history = [
      report({ i: 19, revision: 1, focus: [{ id: Z, since: end(19) }] }),
      report({ i: 19, revision: 0, focus: [{ id: X, since: end(19) }] }),
    ];
    expect(ids(chooseFocus(input({ history })).progress)).toEqual([Z]);
  });

  it("ignores reports for this period or later", () => {
    const history = [report({ i: 20, focus: [{ id: X, since: end(20) }] })];
    expect(chooseFocus(input({ history })).progress).toEqual([]);
  });
});

describe("chooseFocus: examples", () => {
  const move = (ply: number, san: string, bestUci?: string) => ({
    ply,
    color: ply % 2 === 1 ? ("white" as const) : ("black" as const),
    san,
    uci: "e2e4",
    fenBefore: START_FEN,
    fenAfter: START_FEN,
    ...(bestUci ? { bestUci } : {}),
    scoreBefore: { cp: 0 },
    scoreAfter: { cp: -300 },
    winPctBefore: 50,
    winPctAfter: 20,
    winPctLoss: 30,
    judgment: "blunder" as const,
  });
  const game = (gameId: string): AnalyzedGame =>
    ({ gameId, analysisVersion: 2, engine: { name: "stub", depth: 12 }, moves: [move(1, "e4", "d2d4"), move(3, "Nf3")] }) as AnalyzedGame;
  const f = (gameId: string, ply: number, winPctLoss: number): PatternFinding => ({ patternId: Y, gameId, ply, winPctLoss });

  const findings = [f("g1", 1, 40), f("g1", 3, 35), f("g2", 3, 20), f("missing", 1, 90)];
  const analyses = new Map([
    ["g1", game("g1")],
    ["g2", game("g2")],
  ]);

  it("takes at most 2, largest loss first, preferring separate games, skipping games not analysed", () => {
    const r = chooseFocus(input({ history: [], current: summary({ [Y]: 4, [Z]: 2 }, 30, findings), analyses }));
    const y = r.focus.find((x) => x.patternId === Y)!;
    expect(y.examples.map((e) => [e.gameId, e.ply])).toEqual([
      ["g1", 1],
      ["g2", 3],
    ]);
    expect(y.examples[0]).toMatchObject({ fen: START_FEN, played: "e4", best: "d4", winPctLoss: 40 });
    expect(y.examples[1]!.best).toBeUndefined();
    expect(y.exampleGameIds).toEqual(["missing", "g1", "g2"]);
  });

  it("falls back to a second example from the same game", () => {
    const r = chooseFocus(input({ history: [], current: summary({ [Y]: 2 }, 30, findings.slice(0, 2)), analyses }));
    expect(r.focus[0]!.examples.map((e) => e.ply)).toEqual([1, 3]);
  });
});

describe("chooseFocus: determinism", () => {
  it("gives the same result whatever the order of priorities, findings and history", () => {
    const findings = [
      { patternId: Y, gameId: "a", ply: 5, winPctLoss: 30 },
      { patternId: Y, gameId: "b", ply: 7, winPctLoss: 30 },
      { patternId: Z, gameId: "c", ply: 9, winPctLoss: 25 },
    ];
    const history = [
      report({ i: 5, retired: [{ id: Z, why: "graduated" }] }),
      ...heldRun(10, 15, () => ABOVE_TARGET),
    ];
    const priorities = prios([
      [Y, 10],
      [X, 5],
      [Z, 4],
    ]);
    const base = input({ history, priorities, current: summary({ [X]: 25, [Y]: 30, [Z]: 20 }, 30, findings) });
    const flipped: FocusInput = {
      ...base,
      history: [...history].reverse(),
      priorities: [...priorities].reverse(),
      current: { ...base.current, findings: [...findings].reverse(), stats: [...base.current.stats].reverse() },
    };
    expect(chooseFocus(flipped)).toEqual(chooseFocus(base));
  });
});

describe("chooseFocus: goals in games", () => {
  /** 162 games, 5,000 moves; `affected` games with the pattern, 1.2 per 100 moves throughout. */
  const wide = (affected: number): PatternStat => ({
    patternId: X,
    games: 162,
    moves: 5000,
    gamesAffected: affected,
    occurrences: 60,
    per100Moves: 1.2,
    avgWinPctLoss: 20,
  });
  const BASE = wide(51);
  /** Held since 10 (stored without a goal), measured at 11 with `before` games affected; now `now`. */
  const run = (before: number, now: PatternStat, comparisonGames = 162) => {
    const r10 = report({ i: 10, focus: [{ id: X, since: end(10), baseline: BASE, target: 0.9 }] });
    const r11 = report({ i: 11, focus: [{ id: X, since: end(10), baseline: BASE, target: 0.9 }] });
    const measured = { ...r11, progress: [{ patternId: X, previous: wide(51), current: wide(before), verdict: "flat", pValue: 0.5 }] };
    const current: PatternSummary = { ...summary({ [Y]: 30 }), games: now.games, moves: now.moves, stats: [now, stat(Y, now.games, now.moves, 30)] };
    const cmp: PeriodStats = { ...comparison(), games: comparisonGames, moves: 5000, stats: [{ ...wide(51), games: comparisonGames }] };
    return chooseFocus(input({ history: [r10, measured as WeeklyReport], current, comparison: cmp }));
  };

  it("derives {1, 4} for an item stored without a goal: at goal at 40 of 162, not at 41", () => {
    const at = run(40, wide(40));
    expect(at.progress[0]!.verdict).toBe("flat");
    expect(at.retired).toMatchObject([{ patternId: X, why: "graduated" }]);

    const above = run(40, wide(41));
    expect(above.retired).toEqual([]);
    expect(above.focus.find((f) => f.patternId === X)).toMatchObject({ reason: { kind: "kept" }, goal: { per: 1, of: 4 } });
    expect(run(41, wide(40)).retired).toEqual([]);
  });

  it("never counts a stat with too few games as at goal", () => {
    // 0 of 8 games meets any goal arithmetically, but 8 games is not enough data.
    const few = run(40, { ...wide(0), games: 8, moves: 200, occurrences: 0, per100Moves: 0 });
    expect(few.progress[0]!.verdict).toBe("insufficient-data");
    expect(few.retired).toEqual([]);
    const none = run(40, { ...wide(0), games: 0, moves: 0, occurrences: 0, per100Moves: 0 });
    expect(none.retired).toEqual([]);
  });

  it("gives a new item goal = gameGoalOf(baseline) and keeps the per-100-move target", () => {
    const y = chooseFocus(input({ history: [] })).focus.find((f) => f.patternId === Y)!;
    // 15 of 30 games: t = 0.375, round(1/t) = 3.
    expect(y.goal).toEqual({ per: 1, of: 3 });
    expect(y.target).toBeCloseTo(2.25, 10);
  });

  it("keeps a stored goal, and judges graduation on it", () => {
    const held = (i: number) => report({ i, focus: [{ id: X, since: end(10), goal: { per: 2, of: 10 } }] });
    const measured = { ...held(11), progress: [{ patternId: X, previous: stat(X, 30, 4000, 120), current: stat(X, 30, 1000, 25), verdict: "flat", pValue: 0.2 }] } as WeeklyReport;
    const r = chooseFocus(input({ history: [held(10), measured] }));
    // 13 of 30 games is within the derived {5, 10} but not within the stored {2, 10}.
    expect(r.retired).toEqual([]);
    expect(r.focus.find((f) => f.patternId === X)!.goal).toEqual({ per: 2, of: 10 });
  });
});

describe("chooseFocus: blind spots and examples", () => {
  const P = "allowed-tactic";
  const fenPgn = (fen: string, moves: string): string => `[Event "fixture"]\n[SetUp "1"]\n[FEN "${fen}"]\n\n${moves} *`;
  /** F1, an allowed fork: 1.Qd2? Ne4+ wins the queen. Traits include answer-check and undefended. */
  const fork = (id: string) =>
    fixtureGame({
      pgn: fenPgn("r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2Q3R w - - 0 1", "1. Qd2 Ne4+"),
      as: "white",
      id,
      evals: { 1: { cp: 778, pv: ["h1e1"] }, 2: { cp: -283, pv: ["f6e4", "f2e1", "e4d2", "e1d2", "f8e8"] } },
    });
  /** F2, hung after a capture: 3.Nxe5? Nxe5. Traits include moved-piece-lost and undefended, not answer-check. */
  const hung = (id: string) =>
    fixtureGame({
      pgn: "1. e4 e5 2. Nf3 Nc6 3. Nxe5 Nxe5",
      as: "white",
      id,
      evals: { 5: { cp: 43, pv: ["f1b5"] }, 6: { cp: -401, pv: ["c6e5", "b1c3", "e5g6"] } },
    });
  /** 1.a3, a countable mistake with a quiet answer: only its move-number band. */
  const quiet = (id: string) =>
    fixtureGame({ pgn: "1. a3 e5", as: "white", id, evals: { 1: { cp: 30, pv: ["e2e4"] }, 2: { cp: -150, pv: ["e7e5"] } } });

  const find = (patternId: string, gameId: string, ply: number, winPctLoss: number): PatternFinding => ({
    patternId,
    gameId,
    ply,
    winPctLoss,
  });

  /**
   * Ten occurrences of P: two quiet ones with the largest losses, four F2 and four F1; six more
   * quiet countable mistakes in the window that are not P.
   */
  const setup = async (patternId = P) => {
    const games: PlayerGame[] = await Promise.all([
      ...["q1", "q2", "x1", "x2", "x3", "x4", "x5", "x6"].map(quiet),
      ...["a1", "a2", "a3", "a4"].map(hung),
      ...["b1", "b2", "b3", "b4"].map(fork),
    ]);
    const findings = [
      find(patternId, "q1", 1, 60),
      find(patternId, "q2", 1, 45),
      ...[50, 25, 20, 15].map((l, i) => find(patternId, `a${i + 1}`, 5, l)),
      ...[30, 12, 11, 10].map((l, i) => find(patternId, `b${i + 1}`, 1, l)),
    ];
    const analyses = new Map(games.map((g) => [g.analysis.gameId, g.analysis] as const));
    const base = input({
      history: [],
      priorities: prios([[patternId, 10]]),
      current: summary({ [patternId]: 10 }, 30, findings),
      analyses,
      window: { games, findings, start: end(14), end: NOW },
    });
    return { games, findings, base };
  };
  const at = (xs: readonly { gameId: string; ply: number }[]) => xs.map((e) => [e.gameId, e.ply]);

  it("gives every item its blind spots over the window, and an example for each of the first two", async () => {
    const { base } = await setup();
    const r = chooseFocus(base);
    const item = r.focus[0]!;
    expect(item.blindSpots.map((b) => b.id)).toEqual(["moved-piece-lost", "undefended", "answer-check"]);
    expect(item.blindSpotWindow).toEqual({ start: end(14), end: NOW, games: 16, mistakes: 16 });
    // Example 1: the largest loss with moved-piece-lost (not the larger quiet q1). Example 2: the
    // largest loss in another game with undefended (not the larger quiet q2).
    expect(at(item.examples)).toEqual([
      ["a1", 5],
      ["b1", 1],
    ]);
    expect(item.examples[0]!.traits).toContain("moved-piece-lost");
    expect(item.examples[1]!.traits).toContain("undefended");
    expect(item.examples[0]!.gameId).not.toBe(item.examples[1]!.gameId);
    expect(item.examples[0]!.story).toMatchObject({ played: { san: "Nxe5", piece: "knight" }, lost: { piece: "knight" } });
    expect(item.examples[1]!.story).toMatchObject({ played: { san: "Qd2", piece: "queen" }, lost: { piece: "queen" } });
    expect(r.examplesDropped).toEqual([]);
  });

  it("keeps kept examples, refreshing their computed fields", async () => {
    const { base } = await setup();
    const r = chooseFocus({ ...base, keepExamples: { [P]: [{ gameId: "b2", ply: 1 }, { gameId: "a3", ply: 5 }] } });
    const item = r.focus[0]!;
    expect(at(item.examples)).toEqual([
      ["b2", 1],
      ["a3", 5],
    ]);
    expect(item.examples[0]).toMatchObject({ winPctLoss: 12, played: "Qd2", story: { played: { san: "Qd2" } } });
    expect(item.examples[0]!.traits).toContain("answer-check");
    expect(item.examples[1]).toMatchObject({ winPctLoss: 20, played: "Nxe5" });
    expect(r.examplesDropped).toEqual([]);
  });

  it("replaces a kept example that is no longer a finding, and reports the item", async () => {
    const { base } = await setup();
    const r = chooseFocus({ ...base, keepExamples: { [P]: [{ gameId: "a2", ply: 5 }, { gameId: "gone", ply: 7 }] } });
    // a2 keeps its slot; the second slot is filled by the rule: undefended, in another game.
    expect(at(r.focus[0]!.examples)).toEqual([
      ["a2", 5],
      ["a1", 5],
    ]);
    expect(r.examplesDropped).toEqual([P]);

    // A kept example whose game is no longer a finding of this pattern, though still analysed.
    const moved = chooseFocus({ ...base, keepExamples: { [P]: [{ gameId: "x1", ply: 1 }] } });
    expect(at(moved.focus[0]!.examples)).toEqual([
      ["a1", 5],
      ["b1", 1],
    ]);
    expect(moved.examplesDropped).toEqual([P]);
  });

  it("refreshes blind spots and examples of a kept item too", async () => {
    const { base } = await setup();
    const history = [report({ i: 19, focus: [{ id: P, since: end(19) }] })];
    const item = chooseFocus({ ...base, history }).focus.find((f) => f.patternId === P)!;
    expect(item.reason.kind).toBe("kept");
    expect(item.blindSpots.map((b) => b.id)).toEqual(["moved-piece-lost", "undefended", "answer-check"]);
    expect(at(item.examples)).toEqual([
      ["a1", 5],
      ["b1", 1],
    ]);
  });

  it("gives a pattern outside the trait families no blind spots and the old example rule", async () => {
    const { base } = await setup("thrown-win");
    const item = chooseFocus(base).focus[0]!;
    expect(item.blindSpots).toEqual([]);
    expect(item.blindSpotWindow).toMatchObject({ games: 16 });
    expect(at(item.examples)).toEqual([
      ["q1", 1],
      ["a1", 5],
    ]);
    expect(item.examples.map((e) => e.traits)).toEqual([[], []]);
  });

  it("does not depend on the order of the window", async () => {
    const { base, games, findings } = await setup();
    const flipped = { ...base, window: { ...base.window, games: [...games].reverse(), findings: [...findings].reverse() } };
    expect(chooseFocus(flipped)).toEqual(chooseFocus(base));
  });
});
