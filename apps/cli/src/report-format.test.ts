import {
  PATTERN_IDS,
  type FocusItem,
  type PatternProgress,
  type PatternStat,
  type PeriodStats,
  REPORT_WEEKS,
  WeeklyReport,
} from "@blunderstruck/contracts";
import { storyOf } from "@blunderstruck/patterns";
import { storyCost, storyLines } from "@blunderstruck/view";
import { describe, expect, it } from "vitest";
import { type FixtureOptions, fixtureGame } from "../../../packages/patterns/src/test-fixtures";
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
    expect(text).toContain("Period: 12 Nov to 19 Nov 2026");
    expect(text).toContain("Games: 31 found, all analysed");
    expect(text).not.toContain("still being analysed");
    // The stored summary and why state rates per 100 moves: the built-in wording stands in, and a note says so.
    expect(text).not.toContain("31 games, 6.50 mistakes per 100 moves.");
    expect(text).toContain("Over 31 games you made 2.3 mistakes a game.");
    expect(text).toContain("1. Look before you let go of a piece");
    expect(text).not.toContain("You left a piece hanging in 23 of 31 games");
    expect(text).toContain("   A piece was left where it could simply be taken.");
    expect(text).not.toContain("per 100 moves");
    expect(text).toContain("- Some stored wording could not be shown, so a plain sentence stands in its place.");
    expect(text).toContain("It came up in 5 of your last 6 weeks. Kept from your last report (since 29 Oct).");
    // Games, not rates, without `all`; the older item's goal comes from its baseline.
    expect(text).toContain("   In 23 of your 31 games.");
    expect(text).toContain("   Goal: at most 7 in every 10 games. In these 31 games that means 21 or fewer; you are at 23.");
    expect(text).not.toContain("per 100 moves; started");
    expect(text).not.toContain("Position (FEN)");
    expect(text).toContain("   - Move 12, you had White\n     You played Qxf7; better was Nf3 (-32.4 win%)");
    expect(text).toContain("You played Bxf7 (-25.0 win%)");
    expect(text).toContain("How often, week by week (goal: at most 7 in every 10 games):\n   - 15 Oct: 6 of 6 games");
    expect(text).toContain("Left a piece hanging: improved. 30 of 30 games (in every game) before, 22 of 30 games (about 7 in every 10 games) since.");
    expect(text).toContain("Missed a winning tactic: not enough games yet");
    expect(text).toContain(
      "Let a winning position slip: reached its goal and stayed there. 15 of 28 games (about 1 game in 2) when it was chosen on 24 Sep, 10 of 31 games (about 1 game in 3) now.",
    );
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
    expect(text).toContain("   In 23 of your 31 games.\n   Goal: at most 7 in every 10 games. In these 31 games that means 21 or fewer; you are at 23.\n   Now 2.10 per 100 moves; started at 3.00; target 2.25.");
    expect(text).toContain(`Position (FEN): ${FEN}`);
    expect(text).toContain("Left a piece hanging: improved (3.00 before, 2.10 now, per 100 moves, p = 0.040)");
    expect(text).toContain("Week by week");
    const rows = text.split("\n").filter((l) => /^\d{1,2} [A-Z][a-z]{2}\s+6\s/.test(l));
    expect(rows).toHaveLength(6);
    // Oldest week first, newest last.
    expect(rows[0]).toMatch(/^15 Oct\s/);
    expect(rows[5]).toMatch(/^19 Nov.*2\.10$/);
    // The rates the main screen leaves out are all here.
    expect(text).toContain("Retired from your list\n- Let a winning position slip: reached its goal and stayed there. 1.50 per 100 moves on 24 Sep, 0.90 now.");
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
    expect(text).toContain("Too few games to pick habits to work on (7 games found).");
    expect(text).not.toContain("focus items (");
    // The stored summary states a rate per 100 moves: the built-in summary stands in.
    expect(text).not.toContain("6.50 mistakes per 100 moves");
    expect(text).toContain("Only 7 games in this period, so here are the numbers on their own.");
    expect(text).toContain("The numbers");
    expect(text).toContain("- Left a piece hanging: in 4 of your 7 games, about 6 in every 10 games.");
    expect(text).toContain("- Missed a mate: not once in your 7 games.");
    expect(text).not.toMatch(/Left a piece hanging\s+1\.50\s+/);
    expect(formatReport(weekly({ kind: "first", gamesFound: 7, focus: [], notes: ["few-games"], current: period("2026-11-19T00:00:00.000Z", 7, { "hung-piece": 1.5 }) }), { all: true })).toMatch(
      /Left a piece hanging\s+1\.50\s+/,
    );
    expect(text).not.toMatch(/^Focus/m);
    expect(text).not.toContain("Week by week");
    expect(text).toContain("No model key was set, so the wording comes from built-in templates.");
    // The few-games note is not repeated once the body has said it.
    expect(text).not.toContain("so no habits were picked");
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
    expect(text).toContain("Based on 150 of your 1,500 games; the other 1,350 are still being analysed.");
    // Without `pending`, it is worked out from the coverage.
    expect(
      formatReport(
        weekly({ gamesFound: 1500, gamesAnalyzed: 150, coverage: { sampled: 150, analysed: 150, total: 1500, complete: false, sampleOnly: false } }),
      ),
    ).toContain("the other 1,350 are still being analysed.");
    // A first look, with the deeper check still to come for most games.
    expect(
      formatReport(
        weekly({ gamesFound: 412, gamesAnalyzed: 150, coverage: { sampled: 150, analysed: 150, total: 412, complete: false, sampleOnly: false, checked: 0 } }),
        { pending: 374 },
      ),
    ).toContain("Based on a first look at 150 of your 412 games; 38 are fully checked so far.");
    // Every game analysed, only the deeper check left.
    expect(
      formatReport(
        weekly({ gamesFound: 64, gamesAnalyzed: 64, coverage: { sampled: 64, analysed: 64, total: 64, complete: false, sampleOnly: false, checked: 0 } }),
        { pending: 41 },
      ),
    ).toContain("\n41 of 64 games still to check; counts may change.\n");
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
    // The built-in wording stands in for each field.
    expect(text).toContain("1. Pieces left out in the open [Left a piece hanging]");
    expect(text).toContain("   A piece was left where it could simply be taken.");
    expect(text).toContain("Over 31 games you made 2.3 mistakes a game.");
    expect(text).not.toContain("could not be shown.\n");
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
    expect(text).toContain("No habit repeated often enough to pick one to work on in this period.");
    expect(text).not.toContain("this week");
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
      followed: 4,
      // The game played the whole line and paid for the move.
      inGame: {
        moves: [
          mv("Ne4+", "f6", "e4", "knight", "black", { check: true }),
          mv("Ke1", "f2", "e1", "king", "white"),
          mv("Nxd2", "e4", "d2", "knight", "black", { captured: "queen" }),
          mv("Kxd2", "e1", "d2", "king", "white", { captured: "knight" }),
        ],
        ended: false,
        paid: true,
        net: 6,
        lost: { square: "d2", piece: "queen", color: "white" },
      },
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
          "   - Their best reply gave check: 11 of your 24, against about 1 in 8 of your mistakes overall. 7 of them from the knight that moved.",
          "   - The piece you had just moved was taken: 9 of your 24, against about 1 in 4 of your mistakes overall.",
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
          "     They: They found it: the knight jumped to e4 with check, hitting your king and queen at once.",
          "     Then: Your king stepped aside, the knight took your queen, and your king took the knight.",
          "     Better: Rook to e1. After it, e4 is guarded, so the knight cannot land there safely.",
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
      expect(text).toContain("   In 12 of your 31 games, about 4 in every 10 games.\n   Goal: at most 1 game in 3. In these 31 games that means 10 or fewer; you are at 12.\n   Now 0.20");
      expect(text).toContain("The habit to build:");
      expect(text).toContain(`   - Position (FEN): ${F1_FEN}`);
      expect(text).toContain("     It cost your queen. Your winning chances went from 94% to 26%.");
      expect(text).toContain("     You played Qd2; better was Re1 (-67.8 win%)");
      expect(text).toContain("motif: fork");
    });
  });

  describe("stories from the story builder, told from the game's own moves", () => {
    // Engine lines scripted as in the patterns package's story fixtures; the games are invented.
    const fenPgn = (fen: string, moves: string): string => `[Event "fixture"]\n[SetUp "1"]\n[FEN "${fen}"]\n\n${moves} *`;
    /** Quiet moves so the game goes on past the story's window. */
    const LATER = "a3 a6 4. h3 h6 5. b3 b6 6. g3 g6";

    /** The story's lines and cost, as the terminal prints them. */
    async function told(o: FixtureOptions & { as: "white" | "black" }, ply: number, patternId: string): Promise<string[]> {
      const g = await fixtureGame(o);
      const s = storyOf(g, { gameId: g.analysis.gameId, ply, patternId });
      expect(s).toBeDefined();
      return [...storyLines(s!, patternId).map((l) => `${l.tag}: ${l.text}`), `cost: ${storyCost(s!, patternId).text}`];
    }

    const F1_POS = "r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2Q3R w - - 0 1";
    const F1_EVALS = {
      1: { cp: 778, pv: ["h1e1", "c7c5", "d1f3", "b7b6", "f2g1", "h7h6", "f3b7", "a8b8", "b7a6", "f6d5"] },
      2: { cp: -283, pv: ["f6e4", "f2e1", "e4d2", "e1d2", "f8e8", "a1d1", "a8d8", "d2c3", "f7f5", "h1e1"] },
    };
    const f1 = (moves: string) => told({ pgn: fenPgn(F1_POS, moves), as: "white", evals: F1_EVALS }, 1, "allowed-tactic");
    const F1_THEY = "they: That let the knight jump to e4 with check, hitting your king and queen at once.";
    const F1_FOUND = "they: They found it: the knight jumped to e4 with check, hitting your king and queen at once.";
    const F1_BETTER = "better: Rook to e1. After it, e4 is guarded, so the knight cannot land there safely.";

    it("case A, 1.Qd5? Nxd5 2.Nxd5 exd5: the game's moves are told, and the cost stays a possibility unless the game paid", async () => {
      expect(
        await told(
          {
            pgn: fenPgn("r4rk1/ppp2ppp/4pn2/8/8/2N5/PPPQ1PPP/R4RK1 w - - 0 1", "1. Qd5 Nxd5 2. Nxd5 exd5"),
            as: "white",
            evals: { 1: { cp: 50, pv: ["f1e1", "a8d8"] }, 2: { cp: -850, pv: ["e6d5", "c3d5", "f6d5"] } },
          },
          1,
          "hung-piece",
        ),
      ).toEqual([
        "you: Your queen went to d5.",
        "they: That let the pawn take your queen on d5.",
        "then: In the game they took it with the knight, your knight took their knight, and the pawn took your knight. The game ended there.",
        "better: Rook to e1. It keeps the position together.",
        "cost: It could have cost about 11 pawns of material.",
      ]);
    });

    const QC1 = "r4rk1/ppp2ppp/8/8/3n4/8/PPPQ1PP1/5RK1 w - - 0 1";
    const QC1_EVALS = { 1: { cp: 300, pv: ["d2d4", "a8d8"] }, 2: { cp: -600, pv: ["d4e2", "g1h2", "e2c1", "f1c1", "a8d8"] } };

    it("case B, 1.Qc1? Ne2+ 2.Kh1 Nxc1 3.Rxc1 (the engine had Kh2): all of it happened", async () => {
      expect(await told({ pgn: fenPgn(QC1, "1. Qc1 Ne2+ 2. Kh1 Nxc1 3. Rxc1"), as: "white", evals: QC1_EVALS }, 1, "allowed-tactic")).toEqual([
        "you: Your queen went to c1.",
        "they: They found it: the knight jumped to e2 with check, hitting your king and queen at once.",
        "then: Your king stepped aside, the knight took your queen, and your rook took the knight. The game ended there.",
        "better: Queen takes the knight on d4. It wins their knight.",
        "cost: It cost your queen for a knight.",
      ]);
    });

    it("1.Qc1? Ne2+ 2.Kh1 Rad8: the queen was not taken, so the rest is what would follow", async () => {
      const qc1 = "r4rk1/ppp2ppp/8/8/3n4/8/PPPQ1PPP/5RK1 w - - 0 1";
      const evals = { 1: QC1_EVALS[1], 2: { cp: -600, pv: ["d4e2", "g1h1", "e2c1", "f1c1", "a8d8"] } };
      expect((await told({ pgn: fenPgn(qc1, `1. Qc1 Ne2+ 2. Kh1 Rad8 3. ${LATER}`), as: "white", evals }, 1, "allowed-tactic")).slice(1)).toEqual([
        "they: They found it: the knight jumped to e2 with check, hitting your king and queen at once.",
        "then: From there your king would have to step aside, the knight would take your queen, and your rook would take the knight.",
        "better: Queen takes the knight on d4. It wins their knight.",
        "cost: It could have cost your queen for a knight.",
      ]);
      // The same game ending after Rad8: the story keeps only the reply, so neither the end nor "nothing was lost" is said.
      expect((await told({ pgn: fenPgn(qc1, "1. Qc1 Ne2+ 2. Kh1 Rad8"), as: "white", evals }, 1, "allowed-tactic"))[2]).toBe(
        "then: From there your king would have to step aside, the knight would take your queen, and your rook would take the knight.",
      );
    });

    it("1...Rc1? 2.b8=Q Rc2+: a promotion that was played is a cost, not a possibility", async () => {
      expect(
        await told(
          {
            pgn: fenPgn("8/1P4k1/8/8/8/8/4K3/1r6 b - - 0 1", "1... Rc1 2. b8=Q Rc2+"),
            as: "black",
            evals: { 2: { cp: 0, pv: ["b1b7", "e2d3"] }, 3: { cp: 900, pv: ["b7b8q", "c1c2", "e2d3"] } },
          },
          2,
          "allowed-tactic",
        ),
      ).toEqual([
        "you: Your rook went to c1.",
        "they: They found it: the pawn went to b8 and became a queen.",
        "then: Your rook went to c2 with check. The game ended there.",
        "better: Rook takes the pawn on b7. After it, the pawn can no longer go to b8.",
        "cost: It cost about 8 pawns of material.",
      ]);
    });

    it("1...Ne5 2.Qxe5?? dxe5: the player came out ahead, so no cost is a fact", async () => {
      expect(
        await told(
          {
            pgn: fenPgn("6k1/ppp2ppp/2np4/8/8/5N2/PPP1QPPP/6K1 b - - 0 1", "1... Ne5 2. Qxe5 dxe5"),
            as: "black",
            evals: { 2: { cp: 0, pv: ["g8f8", "e2e3"] }, 3: { cp: 150, pv: ["f3e5", "d6e5", "e2e5"] } },
          },
          2,
          "allowed-tactic",
        ),
      ).toEqual([
        "you: Your knight went to e5.",
        "they: That let their knight take your knight on e5.",
        "then: In the game they took it with the queen, and your pawn took the queen. The game ended there.",
        "better: King to f8. It keeps the position together.",
        "cost: It could have cost a pawn.",
      ]);
    });

    it("1.a3?? Rc1#: a mate allowed and given by another mating move", async () => {
      expect(
        await told(
          {
            pgn: fenPgn("1rr3k1/5ppp/8/8/8/8/P4PPP/6K1 w - - 0 1", "1. a3 Rc1#"),
            as: "white",
            evals: { 1: { cp: 0, pv: ["h2h3", "g8f8"] }, 2: { mate: -1, pv: ["b8b1"] } },
          },
          1,
          "allowed-mate",
        ),
      ).toEqual([
        "you: Your pawn went to a3.",
        "they: That let the rook come to b1: checkmate.",
        "then: In the game they played rook to c1, checkmate, instead.",
        "better: Pawn to h3. It keeps the position together.",
        "cost: It allowed checkmate.",
      ]);
    });

    it("F1, the game leaves the line at once and goes on", async () => {
      expect(await f1("1. Qd2 h6 2. a3 a6 3. h3 b6 4. b3 a5 5. g3 g6")).toEqual([
        "you: Your queen went to d2.",
        F1_THEY,
        "then: In the game they played pawn to h6 instead.",
        F1_BETTER,
        "cost: It could have cost your queen for a knight.",
      ]);
    });

    it("F1, the game ends on the move", async () => {
      expect((await f1("1. Qd2")).slice(1, 3)).toEqual([F1_THEY, "then: The game ended there."]);
    });

    it("F1, the game ends mid-line after the fork: no move after the end is told", async () => {
      expect((await f1("1. Qd2 Ne4+")).slice(1)).toEqual([
        F1_FOUND,
        "then: The game ended there.",
        F1_BETTER,
        "cost: It could have cost your queen for a knight.",
      ]);
    });

    it("F1, the game follows the whole line", async () => {
      expect((await f1("1. Qd2 Ne4+ 2. Ke1 Nxd2 3. Kxd2")).slice(1)).toEqual([
        F1_FOUND,
        "then: Your king stepped aside, the knight took your queen, and your king took the knight. The game ended there.",
        F1_BETTER,
        "cost: It cost your queen for a knight.",
      ]);
    });

    it("F1, the fork is played and the game goes on elsewhere: the rest is what would follow", async () => {
      expect((await f1("1. Qd2 Ne4+ 2. Ke1 a6 3. a3 a5 4. h3 b6 5. b3 h6 6. g3 g6")).slice(1, 3)).toEqual([
        F1_FOUND,
        "then: From there your king would have to step aside, the knight would take your queen, and your king would take the knight.",
      ]);
    });

    it("3.d3? after 2...Qh4: a missed chance says nothing about a punishment", async () => {
      const QH4_AFTER = { cp: 920, pv: ["f3h4", "d7d5", "h4f5", "d5e4", "f5g7", "f8g7", "d2d3", "g7f8", "d3e4", "g8f6"] };
      const evals = { 5: QH4_AFTER, 6: { cp: -109, pv: ["h4e7", "d3d4", "d7d6", "b1c3", "c7c6", "f1c4", "g8f6", "c1e3", "h7h6", "e1g1"] } };
      const lines = await told({ pgn: "1. e4 e5 2. Nf3 Qh4 3. d3", as: "white", evals }, 5, "missed-capture");
      expect(lines.map((l) => l.split(":")[0])).toEqual(["you", "better", "cost"]);
      expect(lines).toContain("better: Knight takes the queen on h4. It wins their queen for your knight.");
      expect(lines.at(-1)).toBe("cost: It cost the chance to win their queen for your knight.");
    });

    it("Rxd1 where Nxf6+ gxf6 Rxd1 was better: the miss is the knight, not the queen taken back", async () => {
      const lines = await told(
        {
          pgn: fenPgn("r5k1/5ppp/5n2/7N/8/7P/5PPK/R2q4 w - - 0 1", "1. Rxd1 Nxh5"),
          as: "white",
          evals: { 1: { cp: 950, pv: ["h5f6", "g7f6", "a1d1", "g8g7"] }, 2: { cp: 620, pv: ["f6h5", "d1d7"] } },
        },
        1,
        "missed-capture",
      );
      expect(lines).toEqual([
        "you: Your rook took the queen on d1.",
        "better: Knight takes their knight on f6, with check. It wins a knight more than your move did.",
        "cost: It cost the chance to win a knight.",
      ]);
    });

    it("1...Rd4? 2.Nxd4 exd4: a rook for a knight in the game is the exchange", async () => {
      const lines = await told(
        {
          pgn: fenPgn("3r2k1/5ppp/8/4p3/8/5N2/5PPP/6K1 b - - 0 1", "1... Rd4 2. Nxd4 exd4"),
          as: "black",
          evals: { 2: { cp: 0, pv: ["g8f8", "g1f1"] }, 3: { cp: 300, pv: ["f3d4", "e5d4", "g1f1"] } },
        },
        2,
        "hung-piece",
      );
      expect(lines.at(-1)).toBe("cost: It cost the exchange (a rook for a knight).");
    });

    it("d4? exd3+: en passant names where the pawn landed", async () => {
      const evals = {
        1: { cp: 752, pv: ["c2c6", "g8f8", "c6d6", "f8g8", "d6d7", "g8f8", "e1e2", "e8e6", "d7d8", "e6e8"] },
        2: { cp: -697, pv: ["e4d3", "e1d2", "d3c2", "d2c2", "g8f8", "c2d2", "f8e7", "g2g4", "e8a8", "g4g5"] },
      };
      const lines = await told({ pgn: fenPgn("4r1k1/5ppp/8/8/4p3/8/2QP1PPP/4K3 w - - 0 1", "1. d4 exd3+"), as: "white", evals }, 1, "allowed-tactic");
      expect(lines[1]).toBe(
        "they: They found it: their pawn took your pawn en passant, landing on d3 with check. Moving it opened the line behind it: their rook on e8 was now aimed at your king.",
      );
    });
  });
});
