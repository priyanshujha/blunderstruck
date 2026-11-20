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
    const v = reportView(report());
    expect(v.weeks.table.head).toEqual(["Week ending", "Games", "Mistakes /100"]);
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
});
