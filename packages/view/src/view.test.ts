import { BLIND_SPOT_IDS, type BlindSpot, BLIND_SPOTS, PATTERN_IDS, type PeriodStats, WeeklyReport, gameGoalOf, meetsGoal } from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import { BLIND_SPOT_LABELS, PATTERN_NAMES, REFINEMENT_PHRASES, UNSHOWN_WORDING, frequencySentence, gamesPhrase, goalPhrase, reportView, standingSentence } from "./index";

const move = (san: string, from: string, to: string, piece: string, color: string, o: Record<string, unknown> = {}) => ({
  san, uci: `${from}${to}`, from, to, piece, color, check: false, mate: false, fenAfter: "8/8/8/8/8/8/8/8 w - - 0 1", ...o,
});
/** Fixture F1: `r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2Q3R w - - 0 1`, Qd2 allows Ne4+ (see story.test.ts). */
const F1 = {
  played: move("Qd2", "d1", "d2", "queen", "white"),
  punish: [
    move("Ne4+", "f6", "e4", "knight", "black", { check: true }),
    move("Ke1", "f2", "e1", "king", "white"),
    move("Nxd2", "e4", "d2", "knight", "black", { captured: "queen" }),
    move("Kxd2", "e1", "d2", "king", "white", { captured: "knight" }),
  ],
  replyFound: true,
  better: [move("Re1", "h1", "e1", "rook", "white")],
  targets: [{ square: "f2", piece: "king", color: "white" }, { square: "d2", piece: "queen", color: "white" }],
  lost: { square: "d2", piece: "queen", color: "white" },
  gain: -6,
  betterReason: { kind: "covers-square", square: "e4" },
  winPctBefore: 94.2,
  winPctAfter: 26.4,
  depth: 18,
};

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

  it("labels every blind spot, and phrases every child as a refinement", () => {
    for (const id of BLIND_SPOT_IDS) expect(BLIND_SPOT_LABELS[id], id).toBeTruthy();
    for (const s of BLIND_SPOTS) if (s.parent) expect(REFINEMENT_PHRASES[s.id], s.id).toBeTruthy();
    expect(Object.keys(BLIND_SPOT_LABELS).sort()).toEqual([...BLIND_SPOT_IDS].sort());
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

describe("plain-language numbers", () => {
  it("says how often in games, with the edges", () => {
    expect(gamesPhrase(51, 162)).toBe("about 1 game in 3");
    expect(gamesPhrase(8, 10)).toBe("about 8 in every 10 games");
    expect(gamesPhrase(4, 40)).toBe("about 1 game in 10");
    // 0.4 is not close enough to 1 in 3 (0.33), so it is said in tenths.
    expect(gamesPhrase(4, 10)).toBe("about 4 in every 10 games");
    expect(gamesPhrase(12, 31)).toBe("about 4 in every 10 games");
    expect(gamesPhrase(10, 31)).toBe("about 1 game in 3");
    expect(gamesPhrase(6, 10)).toBe("about 6 in every 10 games");
    expect(gamesPhrase(19, 20)).toBe("in almost every game");
    expect(gamesPhrase(0, 10)).toBe("not once");
    expect(gamesPhrase(10, 10)).toBe("in every game");
    expect(gamesPhrase(1, 1)).toBe("in your only game");
    expect(gamesPhrase(0, 1)).toBe("not once");
    expect(gamesPhrase(0, 0)).toBe("no games yet");
  });

  it("says goals in the same words", () => {
    expect(goalPhrase({ per: 1, of: 4 })).toBe("at most 1 game in 4");
    expect(goalPhrase({ per: 6, of: 10 })).toBe("at most 6 in every 10 games");
    expect(goalPhrase({ per: 0, of: 1 })).toBe("not in a single game");
    expect(goalPhrase({ per: 2, of: 7 })).toBe("at most 2 games in every 7");
  });

  it("words the frequency and the standing against the goal", () => {
    expect(frequencySentence({ games: 162, gamesAffected: 51 })).toBe("In 51 of your 162 games, about 1 game in 3.");
    expect(frequencySentence({ games: 31, gamesAffected: 0 })).toBe("Not once in your 31 games.");
    expect(frequencySentence({ games: 12, gamesAffected: 12 })).toBe("In all 12 of your games.");
    expect(frequencySentence({ games: 1, gamesAffected: 1 })).toBe("In your one game.");
    expect(frequencySentence({ games: 0, gamesAffected: 0 })).toBe("No games this period.");
    expect(frequencySentence(undefined)).toBe("No data for this period.");

    const goal = { per: 1, of: 4 };
    expect(standingSentence({ games: 162, gamesAffected: 51 }, goal)).toBe("In these 162 games that means 40 or fewer; you are at 51.");
    expect(standingSentence({ games: 162, gamesAffected: 40 }, goal)).toBe(
      "In these 162 games that means 40 or fewer; you are at 40, inside the goal.",
    );
    expect(standingSentence({ games: 0, gamesAffected: 0 }, goal)).toBe("No games this period to measure it against.");
    expect(standingSentence({ games: 20, gamesAffected: 3 }, { per: 0, of: 1 })).toBe("In these 20 games that means none; you are at 3.");

    // 12 of 31 against one game in three: the limit is 10, and the words must not match the goal's.
    const third = { per: 1, of: 3 };
    expect(frequencySentence({ games: 31, gamesAffected: 12 }, third)).toBe("In 12 of your 31 games, about 4 in every 10 games.");
    expect(standingSentence({ games: 31, gamesAffected: 12 }, third)).toBe("In these 31 games that means 10 or fewer; you are at 12.");
    expect(standingSentence({ games: 31, gamesAffected: 9 }, third)).toBe("In these 31 games that means 10 or fewer; you are at 9, inside the goal.");
    // When the rounded words still meet, only the counts are said.
    expect(frequencySentence({ games: 100, gamesAffected: 63 }, { per: 6, of: 10 })).toBe("In 63 of your 100 games.");
    expect(frequencySentence({ games: 100, gamesAffected: 63 })).toBe("In 63 of your 100 games, about 6 in every 10 games.");
  });

  it("never words an unmet goal the same as the current frequency", () => {
    const goals = [
      { per: 0, of: 1 },
      ...Array.from({ length: 19 }, (_, i) => ({ per: 1, of: i + 2 })),
      ...Array.from({ length: 9 }, (_, i) => ({ per: i + 1, of: 10 })),
    ];
    const core = (p: string) => p.replace(/^(about|at most) /, "");
    for (let g = 10; g <= 200; g++) {
      for (let a = 0; a <= g; a++) {
        const stat = { games: g, gamesAffected: a };
        // A goal only ever drops words, so only sentences that hold the goal's words need a second look.
        const plain = frequencySentence(stat);
        for (const goal of goals) {
          if (meetsGoal(stat, goal) || !plain.includes(core(goalPhrase(goal)))) continue;
          const sentence = frequencySentence(stat, goal);
          if (sentence.includes(core(goalPhrase(goal)))) throw new Error(`${a}/${g} against ${goal.per}/${goal.of}: ${sentence}`);
        }
      }
    }
  });
});

const spot = (over: Partial<BlindSpot> = {}): BlindSpot => ({
  id: "answer-check",
  basis: "line",
  count: 23,
  games: 19,
  of: 62,
  baselineCount: 30,
  baselineOf: 240,
  refinement: { id: "answer-knight-check", count: 9 },
  examples: [],
  ...over,
});

const focusItem = (over: Record<string, unknown> = {}) => ({
  patternId: "allowed-tactic",
  title: "Look at their checks first",
  why: "In {gamesAffected} of {games} games.",
  drill: "Before each move, list their checks.",
  exampleGameIds: ["g1"],
  baseline: { patternId: "allowed-tactic", games: 162, moves: 4700, gamesAffected: 51, occurrences: 62, per100Moves: 1.32, avgWinPctLoss: 40 },
  target: 1.0,
  since: END,
  reason: {
    kind: "new",
    previousRank: null,
    score: 1,
    recentCost: 1,
    naiveCostThisPeriod: 1,
    rate: 1.32,
    severity: 40,
    chronicity: 0.8,
    weeksRecurred: 4,
    weeksCounted: 5,
    weeks: [true, true, true, true, false, null],
  },
  examples: [{ patternId: "allowed-tactic", gameId: "g1", ply: 23, winPctLoss: 67.8, fen: "r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2Q3R w - - 0 1", played: "Qd2", best: "Re1", story: F1 }],
  blindSpots: [spot(), spot({ id: "moved-piece-lost", count: 4, of: 62, baselineCount: 3, baselineOf: 15, refinement: undefined })],
  blindSpotWindow: { start: "2026-10-08T00:00:00.000Z", end: END, games: 180, mistakes: 240 },
  steps: [
    { blindSpot: "answer-check", text: "{count} of your {of} came with check: list every check they have first." },
    { blindSpot: "moved-piece-lost", text: "Ask what attacks the square your piece lands on." },
  ],
  goal: { per: 1, of: 4 },
  ...over,
});

describe("focus items in games and words", () => {
  const current = (): PeriodStats => {
    const p = period(END, 162);
    p.stats = p.stats.map((s) => (s.patternId === "allowed-tactic" ? { ...s, gamesAffected: 51, occurrences: 62 } : s));
    return p;
  };

  it("gives frequency, goal, blind spots, steps and story lines", () => {
    const v = reportView(report({ current: current(), focus: [focusItem()] }));
    const item = v.body.kind === "focus" ? v.body.items[0]! : undefined;
    expect(item?.frequency).toBe("In 51 of your 162 games, about 1 game in 3.");
    expect(item?.goalLine).toBe("Goal: at most 1 game in 4.");
    expect(item?.standing).toBe("In these 162 games that means 40 or fewer; you are at 51.");
    expect(item?.blindSpotsIntro).toBe("Looking at all 62 times in your last 180 games:");
    expect(item?.blindSpots.map((b) => [b.sentence, b.refinement])).toEqual([
      ["Their reply gave check: 23 of your 62, against about 1 in 8 of your mistakes overall.", "9 of them from the knight that moved."],
      ["The piece you had just moved was the one you lost: 4 of your 62, against 3 of your 15 mistakes overall.", undefined],
    ]);
    expect(item?.steps).toEqual([
      { blindSpot: "answer-check", label: "Their reply gave check", text: "23 of your 62 came with check: list every check they have first." },
      { blindSpot: "moved-piece-lost", label: "The piece you had just moved was the one you lost", text: "Ask what attacks the square your piece lands on." },
    ]);
    const ex = item!.examples[0]!;
    expect(ex.moveLabel).toBe("Move 12, you had White");
    expect(ex.story?.map((l) => l.text).slice(0, 2)).toEqual([
      "Your queen went to d2.",
      "That let the knight jump to e4 with check, hitting your king and queen at once.",
    ]);
    expect(ex.cost?.text).toBe("It cost your queen.");
    expect(v.details.focus).toEqual(["Allowed a tactic: Now 0.20 per 100 moves; started at 1.32; target 1.00."]);
    expect(v.notes.lines).toEqual([]);
  });

  it("compares with the baseline at the edges", () => {
    const one = (o: Partial<BlindSpot>) => {
      const v = reportView(report({ focus: [focusItem({ blindSpots: [spot(o)], steps: [] })] }));
      return v.body.kind === "focus" ? v.body.items[0]!.blindSpots[0]!.sentence : "";
    };
    expect(one({ baselineCount: 0, baselineOf: 40 })).toBe("Their reply gave check: 23 of your 62, against none of your mistakes overall.");
    expect(one({ baselineCount: 0, baselineOf: 0 })).toBe("Their reply gave check: 23 of your 62.");
    expect(one({ baselineCount: 120, baselineOf: 200 })).toBe("Their reply gave check: 23 of your 62, against about 6 in 10 of your mistakes overall.");
    expect(one({ baselineCount: 1, baselineOf: 1 })).toBe("Their reply gave check: 23 of your 62, against all of your mistakes overall.");
    expect(one({ baselineCount: 2, baselineOf: 7 })).toBe("Their reply gave check: 23 of your 62, against 2 of your 7 mistakes overall.");
  });

  it("marks a step whose blind spot is missing and says so in the notes", () => {
    const v = reportView(report({ focus: [focusItem({ steps: [{ blindSpot: "lost-rook", text: "x" }] })] }));
    expect(v.body.kind === "focus" && v.body.items[0]!.steps[0]!.text).toBe(UNSHOWN_WORDING);
    expect(v.notes.lines).toContain("Some stored wording could not be shown, so a plain sentence stands in its place.");
  });

  it("gives each week's share of games, marking weeks with no games", () => {
    const weeks = [0, 1, 2, 3, 4, 5].map((i) => {
      const p = period(new Date(Date.parse(END) - i * 7 * 86_400_000).toISOString(), i === 1 ? 0 : 20);
      p.stats = p.stats.map((s) => ({ ...s, gamesAffected: i + 2 }));
      return p;
    });
    weeks[2]!.stats = weeks[2]!.stats.filter((s) => s.patternId !== "allowed-tactic");
    const v = reportView(report({ kind: "weekly", weeks, focus: [focusItem()] }));
    const w = v.body.kind === "focus" ? v.body.items[0]!.weeks : [];
    expect(w.map((x) => [x.label, x.affected, x.games, x.noGames, x.text])).toEqual([
      ["2026-10-15", 7, 20, false, "7 of 20 games"],
      ["2026-10-22", 6, 20, false, "6 of 20 games"],
      ["2026-10-29", 5, 20, false, "5 of 20 games"],
      ["2026-11-05", null, 20, false, "no data"],
      ["2026-11-12", null, 0, true, "no games"],
      ["2026-11-19", 2, 20, false, "2 of 20 games"],
    ]);
    expect(w[0]!.share).toBeCloseTo(0.35);
    expect(w[4]!.share).toBeNull();
  });

  it("renders a report from before goals, blind spots, steps and stories", () => {
    const old = focusItem({
      examples: [{ patternId: "allowed-tactic", gameId: "g1", ply: 24, winPctLoss: 32.4, fen: "8/8/8/8/8/8/8/8 b - - 0 1", played: "Qd2", best: "Re1" }],
    });
    for (const k of ["blindSpots", "blindSpotWindow", "steps", "goal"]) delete (old as Record<string, unknown>)[k];
    const r = report({ current: current(), focus: [old] });
    const v = reportView(r);
    const item = v.body.kind === "focus" ? v.body.items[0]! : undefined;
    // gameGoalOf(51/162) is one game in four.
    expect(item?.goal).toEqual(gameGoalOf({ games: 162, gamesAffected: 51 }));
    expect(item?.goalLine).toBe(`Goal: ${goalPhrase(gameGoalOf({ games: 162, gamesAffected: 51 }))}.`);
    expect(item?.blindSpots).toEqual([]);
    expect(item?.steps).toEqual([]);
    expect(item?.blindSpotsIntro).toBeUndefined();
    expect(item?.examples[0]!.story).toBeUndefined();
    expect(item?.examples[0]!.line).toBe("You played Qd2; better was Re1 (-32.4 win%)");
    expect(item?.examples[0]!.moveLabel).toBe("Move 12, you had Black");
  });

  it("states progress and retired items in games too", () => {
    const st = (g: number, a: number) => ({ patternId: "hung-piece", games: g, moves: g * 35, gamesAffected: a, occurrences: a, per100Moves: 1, avgWinPctLoss: 30 });
    const v = reportView(
      report({
        kind: "weekly",
        progress: [{ patternId: "hung-piece", previous: st(120, 38), current: st(31, 4), verdict: "improved", pValue: 0.04 }],
        retired: [{ patternId: "thrown-win", why: "graduated", since: "2026-09-24T00:00:00.000Z", baseline: st(28, 12), current: st(31, 3) }],
      }),
    );
    expect(v.progressInGames?.lines).toEqual([
      "Left a piece hanging: improved. 38 of 120 games (about 1 game in 3) before, 4 of 31 games (about 1 game in 8) since.",
    ]);
    expect(v.retiredInGames?.lines).toEqual([
      "Let a winning position slip: reached its target and stayed there. 12 of 28 games (about 4 in every 10 games) when it was chosen on 2026-09-24, 3 of 31 games (about 1 game in 10) now.",
    ]);
    expect(v.details.progress?.lines[0]).toContain("per 100 moves");
  });
});
