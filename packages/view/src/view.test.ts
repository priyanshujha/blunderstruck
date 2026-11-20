import { PATTERN_IDS, type PeriodStats, WeeklyReport } from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import { PATTERN_NAMES, UNSHOWN_WORDING, reportView } from "./index";

// Invented players only.
const SETTINGS = { analysisVersion: 2, patternsVersion: 1, engine: { name: "Stub 1", depth: 12 } };
const END = "2026-11-19T00:00:00.000Z";

function period(end: string, games: number): PeriodStats {
  return {
    start: new Date(Date.parse(end) - 7 * 86_400_000).toISOString(),
    end,
    games,
    moves: games * 35,
    mistakesPer100Moves: 6.5,
    settings: SETTINGS,
    stats: PATTERN_IDS.map((id) => ({
      patternId: id,
      games,
      moves: games * 35,
      gamesAffected: 1,
      occurrences: 1,
      per100Moves: 0.2,
      avgWinPctLoss: 30,
    })),
  };
}

function report(over: Record<string, unknown> = {}): WeeklyReport {
  return WeeklyReport.parse({
    player: "calm_bishop_test",
    track: { platform: "chesscom", username: "calm_bishop_test", timeClass: "blitz" },
    kind: "first",
    revision: 0,
    periodStart: "2026-10-20T00:00:00.000Z",
    periodEnd: END,
    rating: null,
    band: "club",
    bandSource: "default",
    settings: SETTINGS,
    gamesFound: 40,
    gamesAnalyzed: 25,
    gameIds: [],
    coverage: { sampled: 25, analysed: 25, total: 40, complete: false, sampleOnly: false },
    current: period(END, 25),
    comparison: null,
    weeks: [0, 1, 2, 3, 4, 5].map((i) => period(new Date(Date.parse(END) - i * 7 * 86_400_000).toISOString(), i === 5 ? 0 : 4)),
    trends: [],
    priorities: [],
    focus: [],
    progress: [],
    retired: [],
    summary: "{games} games.",
    wording: { source: "template", wordedFor: [], calls: 0 },
    notes: [],
    ...over,
  });
}

describe("reportView", () => {
  it("names every pattern", () => {
    for (const id of PATTERN_IDS) expect(PATTERN_NAMES[id]).toBeTruthy();
  });

  it("uses the given pending count, else total minus analysed", () => {
    expect(reportView(report()).coverage).toBe("Based on 25 of 40 games; 15 still being analysed.");
    expect(reportView(report(), { pending: 3 }).coverage).toBe("Based on 25 of 40 games; 3 still being analysed.");
    expect(reportView(report()).provisional).toBe(true);
  });

  it("builds the week table oldest first with a dash for an empty week", () => {
    const v = reportView(report({ kind: "weekly" }));
    expect(v.weeks.table.head).toEqual(["Week ending", "Games", "Mistakes /100"]);
    expect(v.weeks.table.rows).toHaveLength(6);
    expect(v.weeks.table.rows[0]).toEqual(["2026-10-15", "0", "-"]);
    expect(v.weeks.table.rows.at(-1)).toEqual(["2026-11-19", "4", "6.50"]);
  });

  it("decides too few games from the note", () => {
    const v = reportView(report({ notes: ["few-games"] }));
    expect(v.body.kind === "numbers" && v.body.intro).toBe("Too few games to pick focus items (40 games found). Here are the numbers.");
    expect(v.notes.lines).toEqual([]);
  });

  it("exports the neutral fallback sentence", () => {
    expect(UNSHOWN_WORDING).toBe("Wording for this item could not be shown.");
  });

  it("writes every count with the same thousands separators", () => {
    const current = period(END, 1200);
    current.stats = current.stats.map((st) => ({ ...st, games: 1200, gamesAffected: 1100 }));
    const v = reportView(report({ current, gamesFound: 1200, gamesAnalyzed: 1200 }));
    expect(v.body.kind === "numbers" && v.body.table.rows[0]![3]).toBe("1,100/1,200");
    expect(v.header.games).toBe("Games: 1,200 found, all analysed");
  });

  it("shows a first report's weeks only within its period, four counted and two empty", () => {
    // Period 2026-10-20 to 2026-11-19: the weeks ending 10-29 .. 11-19 overlap it; 10-22 overlaps by two days.
    const weeks = [0, 1, 2, 3, 4, 5].map((i) =>
      period(new Date(Date.parse(END) - i * 7 * 86_400_000).toISOString(), i === 1 || i === 4 ? 0 : 4),
    );
    const focus = {
      patternId: "hung-piece",
      title: "Look before you let go",
      why: "In {gamesAffected} of {games} games.",
      drill: "Check every piece.",
      exampleGameIds: [],
      baseline: weeks[0]!.stats[2]!,
      target: 0.1,
      since: END,
      reason: {
        kind: "new",
        previousRank: null,
        score: 1,
        recentCost: 1,
        naiveCostThisPeriod: 1,
        rate: 0.2,
        severity: 30,
        chronicity: 0.8,
        weeksRecurred: 3,
        weeksCounted: 4,
        weeks: [true, null, true, false, null, true],
      },
      examples: [],
    };
    const v = reportView(report({ weeks, focus: [focus] }));
    expect(v.weeks.table.head[0]).toBe("Week");
    expect(v.weeks.table.rows.map((r) => r[0])).toEqual([
      "2026-10-20 to 2026-10-22",
      "2026-10-22 to 2026-10-29",
      "2026-10-29 to 2026-11-05",
      "2026-11-05 to 2026-11-12",
      "2026-11-12 to 2026-11-19",
    ]);
    expect(v.weeks.table.rows[0]!.slice(1)).toEqual(["0", "-", "-"]);
    expect(v.weeks.table.rows[3]!.slice(1)).toEqual(["0", "-", "-"]);
    expect(v.body.kind === "focus" && v.body.items[0]!.reason).toBe("It came up in 3 of your last 4 weeks. New on your list.");

    const fewer = { ...focus, reason: { ...focus.reason, weeksCounted: 2, weeksRecurred: 2 } };
    const v2 = reportView(report({ weeks, focus: [fewer] }));
    expect(v2.body.kind === "focus" && v2.body.items[0]!.reason).toBe("New on your list.");
  });
});
