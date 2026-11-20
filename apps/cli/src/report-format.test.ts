import {
  PATTERN_IDS,
  type FocusItem,
  type PatternProgress,
  type PatternStat,
  type PeriodStats,
  REPORT_WEEKS,
  WeeklyReport,
} from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import { formatReport } from "./report-format";

const FEN = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";
const SETTINGS = { analysisVersion: 2, patternsVersion: 1, engine: { name: "Stub 1", depth: 12 } };

const stat = (patternId: string, games: number, moves: number, per100: number, loss = 30): PatternStat => {
  const occurrences = Math.round((per100 * moves) / 100);
  return {
    patternId,
    games,
    moves,
    gamesAffected: Math.min(games, occurrences),
    occurrences,
    per100Moves: per100,
    avgWinPctLoss: occurrences === 0 ? 0 : loss,
  };
};

/** Every pattern over `games` games; `rates` overrides the per-100 rate of named patterns. */
function period(end: string, games: number, rates: Record<string, number> = {}): PeriodStats {
  const moves = games * 35;
  return {
    start: new Date(Date.parse(end) - 7 * 86_400_000).toISOString(),
    end,
    games,
    moves,
    mistakesPer100Moves: 6.5,
    settings: SETTINGS,
    stats: PATTERN_IDS.map((id) => stat(id, games, moves, rates[id] ?? 0.2)),
  };
}

const WEEK_ENDS = [
  "2026-11-19T00:00:00.000Z",
  "2026-11-12T00:00:00.000Z",
  "2026-11-05T00:00:00.000Z",
  "2026-10-29T00:00:00.000Z",
  "2026-10-22T00:00:00.000Z",
  "2026-10-15T00:00:00.000Z",
];
const WEEK_RATES = [2.1, 2.9, 3.4, 3.0, 3.2, 3.6];

const weeks = (): PeriodStats[] =>
  WEEK_ENDS.slice(0, REPORT_WEEKS).map((end, i) => period(end, 6, { "hung-piece": WEEK_RATES[i]! }));

const focusItem = (patternId: string, over: Partial<FocusItem> = {}): FocusItem => ({
  patternId,
  title: "Look before you let go of a piece",
  why: "You left a piece hanging in {gamesAffected} of {games} games, {rate} per 100 moves.",
  drill: "Before each move, ask what the piece you just moved no longer protects.",
  exampleGameIds: ["g1", "g2"],
  blindSpots: [],
  steps: [],
  baseline: stat(patternId, 30, 1050, 3.0),
  target: 2.25,
  since: "2026-10-29T00:00:00.000Z",
  reason: {
    kind: "kept",
    previousRank: 1,
    score: 14.2,
    recentCost: 7.1,
    naiveCostThisPeriod: 6.2,
    rate: 2.1,
    severity: 30,
    chronicity: 0.9,
    weeksRecurred: 5,
    weeksCounted: 6,
    weeks: [true, true, true, true, true, false],
  },
  examples: [
    {
      patternId,
      gameId: "g1",
      ply: 23,
      winPctLoss: 32.4,
      fen: FEN,
      played: "Qxf7",
      best: "Nf3",
    },
    { patternId, gameId: "g2", ply: 31, winPctLoss: 25, fen: FEN, played: "Bxf7" },
  ],
  ...over,
});

const progress = (patternId: string, verdict: PatternProgress["verdict"], before: number, now: number, p: number | null): PatternProgress => ({
  patternId,
  previous: stat(patternId, 30, 1050, before),
  current: stat(patternId, 30, 1050, now),
  verdict,
  pValue: p,
});

function weekly(over: Record<string, unknown> = {}): WeeklyReport {
  return WeeklyReport.parse({
    player: "quiet_rook_test",
    track: { platform: "lichess", username: "quiet_rook_test", timeClass: "rapid" },
    kind: "weekly",
    revision: 1,
    periodStart: "2026-11-12T00:00:00.000Z",
    periodEnd: "2026-11-19T00:00:00.000Z",
    rating: 1420,
    band: "club",
    bandSource: "ratings",
    settings: SETTINGS,
    gamesFound: 31,
    gamesAnalyzed: 31,
    gameIds: ["g1", "g2"],
    coverage: { sampled: 31, analysed: 31, total: 31, complete: true, sampleOnly: false },
    current: period("2026-11-19T00:00:00.000Z", 31, { "hung-piece": 2.1 }),
    comparison: period("2026-11-12T00:00:00.000Z", 120, { "hung-piece": 3.0 }),
    weeks: weeks(),
    trends: PATTERN_IDS.map((id) => progress(id, id === "hung-piece" ? "improved" : "flat", 3.0, 2.1, 0.04)),
    priorities: [],
    focus: [focusItem("hung-piece")],
    progress: [progress("hung-piece", "improved", 3.0, 2.1, 0.04), progress("missed-tactic", "insufficient-data", 0.5, 0.4, null)],
    retired: [
      {
        patternId: "thrown-win",
        why: "graduated",
        since: "2026-09-24T00:00:00.000Z",
        baseline: stat("thrown-win", 28, 980, 1.5),
        current: stat("thrown-win", 31, 1085, 0.9),
      },
    ],
    summary: "{games} games, {mistakeRate} mistakes per 100 moves. {focusCount} thing to work on.",
    wording: { source: "model", provider: "anthropic", model: "stub-model", wordedFor: ["hung-piece"], calls: 1 },
    notes: [],
    ...over,
  });
}

describe("formatReport", () => {
  it("prints a normal weekly report in order, with tokens filled in", () => {
    const text = formatReport(weekly());
    const lines = text.split("\n");

    expect(lines[0]).toBe("Weekly report for quiet_rook_test (lichess, rapid)");
    expect(text).toContain("Rating band: club, from your median rating of 1420 in these games");
    expect(text).toContain("Period: 2026-11-12 to 2026-11-19");
    expect(text).toContain("Games: 31 found, all analysed");
    expect(text).not.toContain("still being analysed");
    expect(text).toContain("31 games, 6.50 mistakes per 100 moves. 1 thing to work on.");
    expect(text).toContain("1. Look before you let go of a piece");
    expect(text).toContain("You left a piece hanging in 23 of 31 games, 2.10 per 100 moves.");
    expect(text).toContain("It came up in 5 of your last 6 weeks.");
    // Games, not rates, without `all`; the older item's goal comes from its baseline.
    expect(text).toContain("   In 23 of your 31 games.");
    expect(text).toContain("   Goal: at most 7 in every 10 games. In these 31 games that means 21 or fewer; you are at 23.");
    expect(text).not.toContain("per 100 moves; started");
    expect(text).not.toContain("Position (FEN)");
    expect(text).toContain("   - Move 12, you had White\n     You played Qxf7; better was Nf3 (-32.4 win%)");
    expect(text).toContain("You played Bxf7 (-25.0 win%)");
    expect(text).toContain("How often, week by week (goal: at most 7 in every 10 games):\n   - 2026-10-15: 6 of 6 games");
    expect(text).toContain("Left a piece hanging: improved. 30 of 30 games (in every game) before, 22 of 30 games (about 7 in every 10 games) since.");
    expect(text).toContain("Missed a winning tactic: not enough games yet");
    expect(text).toContain("Let a winning position slip: reached its target and stayed there");
    expect(text).not.toMatch(/\{\w+\}/);
    // No per-100 week table or trends without `all`.
    expect(text).not.toContain("rates per 100 moves");
    expect(text).not.toContain("All patterns");

    const order = ["Focus", "Last report's focus", "Retired from your list"].map((h) => text.indexOf(h));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i >= 0)).toBe(true);
  });

  it("says no clear change and worse in plain words", () => {
    const text = formatReport(
      weekly({ progress: [progress("hung-piece", "flat", 3.0, 2.9, 0.4), progress("missed-tactic", "worse", 0.5, 1.2, 0.01)] }),
    );
    expect(text).toContain("Left a piece hanging: no clear change");
    expect(text).toContain("Missed a winning tactic: worse");
  });

  it("omits the persistence sentence when fewer than three weeks were counted", () => {
    const item = focusItem("hung-piece", {
      reason: { ...focusItem("hung-piece").reason, weeksCounted: 2, weeksRecurred: 2, kind: "new" },
    });
    const text = formatReport(weekly({ focus: [item] }));
    expect(text).not.toContain("of your last");
    expect(text).toContain("New on your list.");
  });

  it("shows the precise figures, the week table and all nine trends with all", () => {
    const text = formatReport(weekly(), { all: true });
    expect(text).toContain("Now 2.10 per 100 moves; started at 3.00; target 2.25.");
    expect(text).not.toContain("In 23 of your 31 games");
    expect(text).toContain(`Position (FEN): ${FEN}`);
    expect(text).toContain("Left a piece hanging: improved (3.00 before, 2.10 now, per 100 moves, p = 0.040)");
    expect(text).toContain("Week by week");
    const rows = text.split("\n").filter((l) => /^2026-\d\d-\d\d\s+6\s/.test(l));
    expect(rows).toHaveLength(6);
    // Oldest week first, newest last.
    expect(rows[0]).toMatch(/^2026-10-15/);
    expect(rows[5]).toMatch(/^2026-11-19.*2\.10$/);
    expect(text).toContain("All patterns against the 30 days before");
    for (const name of ["Missed a mate", "Walked into a mate", "Same opening mistake again"]) {
      expect(text).toContain(name);
    }
  });

  it("prints the weeks in games on a first report without all, and no verdicts", () => {
    const text = formatReport(
      weekly({
        kind: "first",
        revision: 0,
        comparison: null,
        trends: [],
        progress: [],
        retired: [],
        focus: [focusItem("hung-piece", { reason: { ...focusItem("hung-piece").reason, kind: "new" } })],
      }),
    );
    expect(text.split("\n")[0]).toBe("First report for quiet_rook_test (lichess, rapid)");
    expect(text).toContain("How often, week by week");
    expect(text).not.toContain("rates per 100 moves");
    expect(text).not.toContain("Last report's focus");
    expect(text).not.toContain("Retired from your list");
    expect(formatReport(weekly({ kind: "first", comparison: null, trends: [], progress: [], retired: [] }), { all: true })).toContain(
      "No earlier games to compare with yet.",
    );
  });

  it("says plainly when there are too few games and still prints the numbers", () => {
    const text = formatReport(
      weekly({
        kind: "first",
        revision: 0,
        gamesFound: 7,
        gamesAnalyzed: 7,
        coverage: { sampled: 7, analysed: 7, total: 7, complete: true, sampleOnly: false },
        current: period("2026-11-19T00:00:00.000Z", 7, { "hung-piece": 1.5 }),
        comparison: null,
        trends: [],
        progress: [],
        retired: [],
        focus: [],
        summary: "{games} games so far, {mistakeRate} mistakes per 100 moves.",
        wording: { source: "template", wordedFor: [], calls: 0 },
        notes: ["few-games", "no-key"],
      }),
    );
    expect(text).toContain("Too few games to pick focus items (7 games found).");
    expect(text).toContain("7 games so far, 6.50 mistakes per 100 moves.");
    expect(text).toContain("The numbers");
    expect(text).toContain("- Left a piece hanging: in 4 of your 7 games, about 6 in every 10 games.");
    expect(text).toContain("- Missed a mate: not once in your 7 games.");
    expect(text).not.toMatch(/Left a piece hanging\s+1\.50\s+/);
    expect(formatReport(weekly({ kind: "first", gamesFound: 7, focus: [], notes: ["few-games"], current: period("2026-11-19T00:00:00.000Z", 7, { "hung-piece": 1.5 }) }), { all: true })).toMatch(
      /Left a piece hanging\s+1\.50\s+/,
    );
    expect(text).not.toContain("Focus");
    expect(text).not.toContain("Week by week");
    expect(text).toContain("No model key was set, so the wording comes from built-in templates.");
    // The few-games note is not repeated once the body has said it.
    expect(text).not.toContain("so no focus items were picked");
  });

  it("marks a provisional report with the analysed share and the pending count", () => {
    const text = formatReport(
      weekly({
        revision: 0,
        gamesFound: 1500,
        gamesAnalyzed: 150,
        coverage: { sampled: 150, analysed: 150, total: 1500, complete: false, sampleOnly: false },
      }),
      { pending: 1350 },
    );
    expect(text).toContain("Games: 1,500 found, 150 analysed");
    expect(text).toContain("Based on 150 of 1,500 games; 1,350 still being analysed.");
    // Without `pending`, it is worked out from the coverage.
    expect(
      formatReport(
        weekly({ gamesFound: 1500, gamesAnalyzed: 150, coverage: { sampled: 150, analysed: 150, total: 1500, complete: false, sampleOnly: false } }),
      ),
    ).toContain("1,350 still being analysed.");
  });

  it("words a sample-only report and the note", () => {
    const text = formatReport(
      weekly({
        gamesFound: 400,
        gamesAnalyzed: 150,
        coverage: { sampled: 150, analysed: 150, total: 400, complete: false, sampleOnly: true },
        notes: ["sample-only"],
      }),
    );
    expect(text).toContain("Based on a sample of 150 of 400 games; run report again to analyse the rest.");
    expect(text).not.toContain("still being analysed");
    expect(text).toContain("Stopped after the sample, as asked");
  });

  it("explains the remaining notes in plain sentences", () => {
    const text = formatReport(weekly({ notes: ["model-failed", "settings-changed"], bandSource: "default", rating: null }));
    expect(text).toContain("Rating band: club, assumed, as these games carry no ratings");
    expect(text).toContain("The model did not give usable wording");
    expect(text).toContain("Analysis settings changed since the last report.");
  });

  it("says why an item was retired", () => {
    const base = weekly().retired[0]!;
    const text = formatReport(
      weekly({ retired: [{ ...base, why: "rotated" }, { ...base, patternId: "hung-piece", why: "outgrown" }] }),
    );
    expect(text).toContain("another habit now costs more");
    expect(text).toContain("no longer a priority at your rating band");
  });

  it("never throws on stored wording that no longer renders, and shows no braces", () => {
    const text = formatReport(weekly({ summary: "{oldToken} games", focus: [focusItem("hung-piece", { why: "In {renamed} games.", title: "Unpaired {" })] }));
    expect(text).toContain("Wording for this item could not be shown.");
    expect(text).toContain("The summary could not be shown.");
    expect(text).toContain("- Some stored wording could not be shown, so a plain sentence stands in its place.");
    expect(text).not.toMatch(/[{}]/);
  });

  it("says no data, not zero, when the focus pattern is missing from this period", () => {
    const current = period("2026-11-19T00:00:00.000Z", 31);
    current.stats = current.stats.filter((s) => s.patternId !== "hung-piece");
    const text = formatReport(weekly({ current }), { all: true });
    expect(text).toContain("Now: no data this period; started at 3.00 per 100 moves; target 2.25.");
    expect(text).not.toContain("Now 0.00");
  });

  it("prints focus items on a weekly report with no earlier focus", () => {
    const text = formatReport(weekly({ progress: [], retired: [] }));
    expect(text).toContain("Focus\n1. Look before you let go of a piece [Left a piece hanging]");
    expect(text).not.toContain("Last report's focus");
  });

  it("decides too few games from the note alone", () => {
    const text = formatReport(weekly({ focus: [], gamesFound: 5, notes: [] }));
    expect(text).toContain("No habit repeated often enough to pick a focus item this week.");
    expect(text).not.toContain("Too few games");
  });

  describe("blind spots, steps and stories", () => {
    const mv = (san: string, from: string, to: string, piece: string, color: string, o: Record<string, unknown> = {}) => ({
      san, uci: `${from}${to}`, from, to, piece, color, check: false, mate: false, fenAfter: "8/8/8/8/8/8/8/8 w - - 0 1", ...o,
    });
    // Fixture F1: r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2Q3R w - - 0 1; Qd2 allows Ne4+.
    const F1_FEN = "r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2Q3R w - - 0 1";
    const story = {
      played: mv("Qd2", "d1", "d2", "queen", "white"),
      punish: [
        mv("Ne4+", "f6", "e4", "knight", "black", { check: true }),
        mv("Ke1", "f2", "e1", "king", "white"),
        mv("Nxd2", "e4", "d2", "knight", "black", { captured: "queen" }),
        mv("Kxd2", "e1", "d2", "king", "white", { captured: "knight" }),
      ],
      replyFound: true,
      better: [mv("Re1", "h1", "e1", "rook", "white")],
      targets: [{ square: "f2", piece: "king", color: "white" }, { square: "d2", piece: "queen", color: "white" }],
      lost: { square: "d2", piece: "queen", color: "white" },
      gain: -6,
      betterReason: { kind: "covers-square", square: "e4" },
      winPctBefore: 94.2,
      winPctAfter: 26.4,
      depth: 18,
    };
    const spot = (id: string, count: number, baselineCount: number, refinement?: { id: string; count: number }) => ({
      id, basis: "line" as const, count, games: count, of: 24, baselineCount, baselineOf: 160, ...(refinement ? { refinement } : {}), examples: [],
    });
    const item = focusItem("allowed-tactic", {
      title: "Look at their checks before you move",
      why: "You allowed a tactic in {gamesAffected} of {games} games.",
      drill: "Before every move, name each check and capture they would have.",
      baseline: { ...stat("allowed-tactic", 31, 1085, 2.0), gamesAffected: 17 },
      goal: { per: 1, of: 3 },
      blindSpots: [spot("answer-check", 11, 20, { id: "answer-knight-check", count: 7 }), spot("moved-piece-lost", 9, 40)],
      blindSpotWindow: { start: "2026-10-08T00:00:00.000Z", end: "2026-11-19T00:00:00.000Z", games: 64, mistakes: 160 },
      steps: [
        { blindSpot: "answer-check", text: "{count} of your {of} began with a check: before you let go, find every check they would have." },
        { blindSpot: "moved-piece-lost", text: "Ask what now attacks the square your piece lands on." },
      ],
      examples: [
        { patternId: "allowed-tactic", gameId: "g1", ply: 23, winPctLoss: 67.8, fen: F1_FEN, played: "Qd2", best: "Re1", motif: "fork", story },
      ],
    } as unknown as Partial<FocusItem>);
    const r = (): WeeklyReport => {
      const current = period("2026-11-19T00:00:00.000Z", 31);
      current.stats = current.stats.map((s) => (s.patternId === "allowed-tactic" ? { ...s, gamesAffected: 12 } : s));
      return weekly({ focus: [item], current, progress: [], retired: [] });
    };

    it("prints them in words without all", () => {
      const text = formatReport(r());
      expect(text).toContain(
        [
          "   In 12 of your 31 games, about 4 in every 10 games.",
          "   Goal: at most 1 game in 3. In these 31 games that means 10 or fewer; you are at 12.",
        ].join("\n"),
      );
      expect(text).toContain(
        [
          "   Looking at all 24 times in your last 64 games:",
          "   - Their reply gave check: 11 of your 24, against about 1 in 8 of your mistakes overall. 7 of them from the knight that moved.",
          "   - The piece you had just moved was the one you lost: 9 of your 24, against about 1 in 4 of your mistakes overall.",
          "   The habit to build:",
          "   1. 11 of your 24 began with a check: before you let go, find every check they would have.",
          "   2. Ask what now attacks the square your piece lands on.",
          "   Drill: Before every move, name each check and capture they would have.",
        ].join("\n"),
      );
      expect(text).toContain(
        [
          "   - Move 12, you had White",
          "     You: Your queen went to d2.",
          "     They: That let the knight jump to e4 with check, hitting your king and queen at once.",
          "     Then: Your king had to step aside, the knight took your queen, and your king took the knight.",
          "     Better: Rook to e1. It covers e4, so the knight cannot land there safely.",
          "     It cost your queen.",
        ].join("\n"),
      );
      expect(text).not.toContain("per 100 moves; started");
      expect(text).not.toContain("winning chances went");
      expect(text).not.toContain("Position (FEN)");
      expect(text).not.toContain("motif: fork");
    });

    it("adds the precise figures, the position and the winning chances with all", () => {
      const text = formatReport(r(), { all: true });
      expect(text).toContain("   Now 0.20 per 100 moves; started at 2.00; target 2.25.");
      expect(text).not.toContain("In 12 of your 31 games");
      expect(text).toContain("The habit to build:");
      expect(text).toContain(`   - Position (FEN): ${F1_FEN}`);
      expect(text).toContain("     It cost your queen. Your winning chances went from 94% to 26%.");
      expect(text).toContain("     You played Qd2; better was Re1 (-67.8 win%)");
      expect(text).toContain("motif: fork");
    });
  });
});
