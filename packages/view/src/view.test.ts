import { BLIND_SPOT_IDS, type BlindSpot, BLIND_SPOTS, PATTERN_IDS, type PeriodStats, WeeklyReport, gameGoalOf, meetsGoal } from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import {
  BLIND_SPOT_LABELS,
  PATTERN_NAMES,
  REFINEMENT_PHRASES,
  UNSHOWN_NOTE,
  UNSHOWN_SUMMARY,
  UNSHOWN_WORDING,
  dayMonth,
  frequencyParts,
  frequencySentence,
  gamesPhrase,
  goalPhrase,
  reportView,
  standingSentence,
} from "./index";

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
  followed: 4,
  lostInGame: true,
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

  it("uses the given pending count, else total minus checked, else total minus analysed", () => {
    expect(reportView(report()).pending).toBe(15);
    expect(reportView(report(), { pending: 3 }).pending).toBe(3);
    expect(reportView(report({ coverage: { sampled: 25, analysed: 25, total: 40, complete: false, sampleOnly: false, checked: 0 } })).pending).toBe(40);
    expect(reportView(report()).provisional).toBe(true);
  });

  describe("the coverage sentence adds up", () => {
    const cov = (analysed: number, total: number, o: Record<string, unknown> = {}) => ({
      sampled: analysed, analysed, total, complete: false, sampleOnly: false, ...o,
    });
    const cases: [string, Record<string, unknown>, number | undefined, string | undefined, number][] = [
      ["nothing analysed", cov(0, 412), undefined, "None of your 412 games has been analysed yet.", 412],
      ["nothing analysed, one game", cov(0, 1), undefined, "Your one game has not been analysed yet.", 1],
      ["sample analysed, no check", cov(150, 412), undefined, "Based on 150 of your 412 games; the other 262 are still being analysed.", 262],
      ["sample analysed, one left", cov(411, 412), undefined, "Based on 411 of your 412 games; the other one is still being analysed.", 1],
      ["sample analysed, first look", cov(150, 412, { checked: 0 }), undefined, "Based on a first look at 150 of your 412 games; none are fully checked so far.", 412],
      ["sample analysed, some checked", cov(150, 412, { checked: 0 }), 374, "Based on a first look at 150 of your 412 games; 38 are fully checked so far.", 374],
      ["sample analysed, one checked", cov(150, 412, { checked: 0 }), 411, "Based on a first look at 150 of your 412 games; 1 is fully checked so far.", 411],
      ["sample analysed and checked", cov(150, 412, { checked: 150 }), undefined, "Based on 150 of your 412 games; the other 262 are still being analysed.", 262],
      ["all analysed, none checked", cov(64, 64, { checked: 0 }), undefined, "64 of 64 games still to check; counts may change.", 64],
      ["all analysed, some checked", cov(64, 64, { checked: 0 }), 41, "41 of 64 games still to check; counts may change.", 41],
      ["all analysed, one game", cov(1, 1, { checked: 0 }), undefined, "Your one game is still to check; counts may change.", 1],
      [
        "all analysed and checked, earlier games left",
        cov(30, 30),
        undefined,
        "All 30 games of this period are in; earlier games are still being checked, so some figures may change.",
        0,
      ],
      ["complete", cov(64, 64, { complete: true, checked: 64 }), 5, undefined, 0],
      ["sample only", cov(150, 400, { sampleOnly: true }), undefined, "Based on a sample of 150 of 400 games; run report again to analyse the rest.", 250],
    ];
    for (const [name, coverage, pending, sentence, shownPending] of cases) {
      it(name, () => {
        const v = reportView(report({ coverage }), pending === undefined ? {} : { pending });
        expect(v.coverage).toBe(sentence);
        expect(v.pending).toBe(shownPending);
      });
    }
  });

  it("builds the week table oldest first with a dash for an empty week", () => {
    const v = reportView(report({ kind: "weekly" }));
    expect(v.weeks.table.head).toEqual(["Week ending", "Games", "Mistakes /100"]);
    expect(v.weeks.table.rows).toHaveLength(6);
    expect(v.weeks.table.rows[0]).toEqual(["15 Oct", "0", "-"]);
    expect(v.weeks.table.rows.at(-1)).toEqual(["19 Nov", "4", "6.50"]);
  });

  it("decides too few games from the note", () => {
    const v = reportView(report({ notes: ["few-games"] }));
    expect(v.body.kind === "numbers" && v.body.intro).toBe("Too few games to pick habits to work on (40 games found). Here are the numbers.");
    expect(v.notes.lines).toEqual([]);
  });

  it("words a report with nothing picked without jargon, first and weekly", () => {
    for (const kind of ["first", "weekly"]) {
      const picked = reportView(report({ kind }));
      expect(picked.body.kind === "numbers" && picked.body.intro).toBe(
        "No habit repeated often enough to pick one to work on in this period. Here are the numbers.",
      );
      const few = reportView(report({ kind, notes: ["few-games"] }));
      // Said in the body when the body is the numbers; the note says it otherwise.
      const fewNote = reportView(report({ kind, notes: ["few-games"], focus: [focusItem()] }));
      for (const v of [picked, few, fewNote]) {
        const all = JSON.stringify(v);
        expect(all, kind).not.toMatch(/focus items?\b/i);
        // A weekly report's examples are "from this week's games", which they are; nothing else says "this week".
        expect(JSON.stringify(kind === "weekly" ? { ...v, page: undefined } : v), kind).not.toContain("this week");
      }
      expect(fewNote.notes.lines).toContain("Too few games in this period, so no habits were picked to work on.");
    }
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
      "20 Oct to 22 Oct",
      "22 Oct to 29 Oct",
      "29 Oct to 5 Nov",
      "5 Nov to 12 Nov",
      "12 Nov to 19 Nov",
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

  it("never states a share at or under an unmet goal", () => {
    const goals = [
      { per: 0, of: 1 },
      ...Array.from({ length: 19 }, (_, i) => ({ per: 1, of: i + 2 })),
      ...Array.from({ length: 9 }, (_, i) => ({ per: i + 1, of: 10 })),
    ];
    /** The share a phrase states, as a fraction. */
    const stated = (sentence: string): [number, number] | undefined => {
      const one = /about 1 game in (\d+)\./.exec(sentence);
      if (one) return [1, Number(one[1])];
      const tenths = /about (\d+) in every 10 games\./.exec(sentence);
      if (tenths) return [Number(tenths[1]), 10];
      if (sentence.includes("in almost every game")) return [19, 20];
      return undefined;
    };
    for (let g = 10; g <= 200; g++) {
      for (let a = 1; a < g; a++) {
        const stat = { games: g, gamesAffected: a };
        // A goal can only drop the phrase, so only a phrase that would read as met needs the goal's sentence.
        const plain = stated(frequencySentence(stat));
        if (!plain) continue;
        for (const goal of goals) {
          if (meetsGoal(stat, goal) || plain[0] * goal.of > goal.per * plain[1]) continue;
          const sentence = frequencySentence(stat, goal);
          if (stated(sentence)) throw new Error(`${a}/${g} against ${goal.per}/${goal.of}: ${sentence} (${goalPhrase(goal)})`);
        }
      }
    }
  });

  it("gives one share one wording, in the frequency and the goal", () => {
    // The three forms a value sweep found reading as met.
    expect(frequencySentence({ games: 9, gamesAffected: 2 }, { per: 1, of: 5 })).toBe("In 2 of your 9 games.");
    expect(gamesPhrase(2, 9)).toBe("about 1 game in 5");
    expect(gamesPhrase(10, 19)).toBe("about 1 game in 2");
    expect(frequencySentence({ games: 19, gamesAffected: 10 }, { per: 1, of: 2 })).toBe("In 10 of your 19 games.");
    expect(goalPhrase({ per: 1, of: 10 })).toBe("at most 1 game in 10");
    expect(goalPhrase({ per: 5, of: 10 })).toBe("at most 1 game in 2");
    expect(goalPhrase({ per: 2, of: 10 })).toBe("at most 1 game in 5");
    expect(gamesPhrase(21, 200)).toBe("about 1 game in 10");
    expect(frequencySentence({ games: 200, gamesAffected: 21 }, { per: 1, of: 10 })).toBe("In 21 of your 200 games.");
    // Met goals keep the phrase.
    expect(frequencySentence({ games: 100, gamesAffected: 10 }, { per: 1, of: 10 })).toBe("In 10 of your 100 games, about 1 game in 10.");
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
      ["Their best reply gave check: 23 of your 62, against about 1 in 8 of your mistakes overall.", "9 of them from the knight that moved."],
      ["The piece you had just moved was taken: 4 of your 62, against 3 of your 15 mistakes overall.", undefined],
    ]);
    expect(item?.steps).toEqual([
      { blindSpot: "answer-check", label: "Their best reply gave check", text: "23 of your 62 came with check: list every check they have first." },
      { blindSpot: "moved-piece-lost", label: "The piece you had just moved was taken", text: "Ask what attacks the square your piece lands on." },
    ]);
    const ex = item!.examples[0]!;
    expect(ex.moveLabel).toBe("Move 12, you had White");
    expect(ex.story?.map((l) => l.text).slice(0, 2)).toEqual([
      "Your queen went to d2.",
      "They found it: the knight jumped to e4 with check, hitting your king and queen at once.",
    ]);
    // Stored without the game's own moves: what the engine's line shows, as a possibility.
    expect(ex.cost?.text).toBe("It could have cost your queen.");
    expect(v.details.focus).toEqual(["Allowed a tactic: Now 0.20 per 100 moves; started at 1.32; target 1.00."]);
    expect(v.notes.lines).toEqual([]);
  });

  it("compares with the baseline at the edges", () => {
    const one = (o: Partial<BlindSpot>) => {
      const v = reportView(report({ focus: [focusItem({ blindSpots: [spot(o)], steps: [] })] }));
      return v.body.kind === "focus" ? v.body.items[0]!.blindSpots[0]!.sentence : "";
    };
    expect(one({ baselineCount: 0, baselineOf: 40 })).toBe("Their best reply gave check: 23 of your 62, against none of your mistakes overall.");
    expect(one({ baselineCount: 0, baselineOf: 0 })).toBe("Their best reply gave check: 23 of your 62.");
    expect(one({ baselineCount: 120, baselineOf: 200 })).toBe("Their best reply gave check: 23 of your 62, against about 6 in 10 of your mistakes overall.");
    expect(one({ baselineCount: 1, baselineOf: 1 })).toBe("Their best reply gave check: 23 of your 62, against all of your mistakes overall.");
    expect(one({ baselineCount: 2, baselineOf: 7 })).toBe("Their best reply gave check: 23 of your 62, against 2 of your 7 mistakes overall.");
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
      ["15 Oct", 7, 20, false, "7 of 20 games"],
      ["22 Oct", 6, 20, false, "6 of 20 games"],
      ["29 Oct", 5, 20, false, "5 of 20 games"],
      ["5 Nov", null, 20, false, "no data"],
      ["12 Nov", null, 0, true, "no games"],
      ["19 Nov", 2, 20, false, "2 of 20 games"],
    ]);
    // The ISO days stay available.
    expect(w[0]!.start).toBe("2026-10-08T00:00:00.000Z");
    expect(w[0]!.end).toBe("2026-10-15T00:00:00.000Z");
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
      "Let a winning position slip: reached its goal and stayed there. 12 of 28 games (about 4 in every 10 games) when it was chosen on 24 Sep, 3 of 31 games (about 1 game in 10) now.",
    ]);
    expect(v.details.progress?.lines[0]).toContain("per 100 moves");
    expect(v.details.retired?.lines[0]).toBe("Let a winning position slip: reached its goal and stayed there. 1.00 per 100 moves on 24 Sep, 1.00 now.");

    expect(v.progressInGames?.items).toEqual([
      {
        patternId: "hung-piece",
        patternName: "Left a piece hanging",
        verdict: "improved",
        verdictText: "improved",
        before: { affected: 38, games: 120, text: "38 of 120 games (about 1 game in 3)" },
        after: { affected: 4, games: 31, text: "4 of 31 games (about 1 game in 8)" },
        counts: "38 of 120 games (about 1 game in 3) before, 4 of 31 games (about 1 game in 8) since.",
        text: v.progressInGames!.lines[0],
      },
    ]);
    expect(v.retiredInGames?.items).toEqual([
      {
        patternId: "thrown-win",
        patternName: "Let a winning position slip",
        why: "graduated",
        verdictText: "reached its goal and stayed there",
        since: "2026-09-24T00:00:00.000Z",
        sinceText: "24 Sep",
        before: { affected: 12, games: 28, text: "12 of 28 games (about 4 in every 10 games)" },
        after: { affected: 3, games: 31, text: "3 of 31 games (about 1 game in 10)" },
        counts: "12 of 28 games (about 4 in every 10 games) when it was chosen on 24 Sep, 3 of 31 games (about 1 game in 10) now.",
        text: v.retiredInGames!.lines[0],
      },
    ]);
  });

  it("gives the frequency phrase on its own, only when the sentence says it", () => {
    const one = (affected: number, goal?: { per: number; of: number }) => {
      const p = period(END, 162);
      p.stats = p.stats.map((s) => (s.patternId === "allowed-tactic" ? { ...s, gamesAffected: affected } : s));
      const v = reportView(report({ current: p, focus: [focusItem(goal ? { goal } : {})] }));
      return v.body.kind === "focus" ? v.body.items[0]! : undefined;
    };
    expect(one(51)?.frequencyPhrase).toBe("about 1 game in 3");
    expect(one(51)?.frequency).toBe("In 51 of your 162 games, about 1 game in 3.");
    expect(one(162)?.frequencyPhrase).toBeUndefined();
    expect(one(0)?.frequencyPhrase).toBeUndefined();
    // A phrase that would read as meeting a missed goal is left out of both.
    // 56 of 162 is about 1 game in 3, over a goal of 1 in 3 (54 games).
    expect(one(56, { per: 1, of: 3 })?.frequency).toBe("In 56 of your 162 games.");
    expect(one(56, { per: 1, of: 3 })?.frequencyPhrase).toBeUndefined();
    expect(frequencyParts({ games: 100, gamesAffected: 63 })).toEqual({ sentence: "In 63 of your 100 games, about 6 in every 10 games.", phrase: "about 6 in every 10 games" });
  });
});

describe("dates in day-month form", () => {
  const cases: [string, boolean | number, string][] = [
    ["2026-11-12T00:00:00.000Z", false, "12 Nov"],
    ["2026-01-01T00:00:00.000Z", false, "1 Jan"],
    ["2026-12-31T23:59:59.999Z", false, "31 Dec"],
    // UTC days, whatever the offset written.
    ["2026-03-01T01:00:00.000+02:00", false, "28 Feb"],
    ["2026-11-12T00:00:00.000Z", true, "12 Nov 2026"],
    ["2026-11-12T00:00:00.000Z", 2026, "12 Nov"],
    ["2025-12-29T00:00:00.000Z", 2026, "29 Dec 2025"],
    ["not a date", false, "not a date"],
  ];
  for (const [iso, year, out] of cases) {
    it(`${iso} (${String(year)}) is ${out}`, () => expect(dayMonth(iso, year)).toBe(out));
  }

  it("writes the period, the kept item and the week labels that way, with the ISO times as data", () => {
    const kept = focusItem({ since: "2026-10-29T00:00:00.000Z", reason: { ...focusItem().reason, kind: "kept" } });
    const v = reportView(report({ focus: [kept] }));
    expect(v.header.period).toBe("Period: 20 Oct to 19 Nov 2026");
    expect(v.dates).toEqual({ periodStart: "2026-10-20T00:00:00.000Z", periodEnd: END });
    const item = v.body.kind === "focus" ? v.body.items[0]! : undefined;
    expect(item?.reason).toBe("It came up in 4 of your last 5 weeks. Kept from your last report (since 29 Oct).");
    expect(item?.since).toBe("2026-10-29T00:00:00.000Z");
    expect(JSON.stringify(v.header) + JSON.stringify(v.weeks) + item?.reason).not.toMatch(/\d{4}-\d\d-\d\d/);
  });

  it("names the year of a date from another year than the period's end", () => {
    const v = reportView(report({ periodStart: "2025-12-22T00:00:00.000Z", periodEnd: "2026-01-05T00:00:00.000Z" }));
    expect(v.header.period).toBe("Period: 22 Dec 2025 to 5 Jan 2026");
  });
});

describe("no per-100 figure in wording for the main screen", () => {
  const stored = {
    title: "Down to {target} per 100 moves",
    why: "You are at {rate}, from {baselineRate}.",
    drill: "Get below {target}.",
  };
  const builtIn = {
    summary: "Over {games} games you made {mistakesPerGame} mistakes a game.",
    focus: [
      {
        patternId: "allowed-tactic",
        title: "Shots left open",
        why: "In {gamesAffected} of {games} games.",
        drill: "Look for their checks.",
        steps: [{ blindSpot: "answer-check", text: "{count} of your {of} came with check." }],
      },
    ],
  };

  it("shows the built-in wording for each field with a per-100 token, and says so", () => {
    const r = report({ summary: "{games} games, {mistakeRate} per 100 moves.", focus: [focusItem(stored)] });
    const v = reportView(r, { fallback: builtIn });
    const item = v.body.kind === "focus" ? v.body.items[0]! : undefined;
    expect(v.summary).toBe("Over 25 games you made 2.3 mistakes a game.");
    expect([item?.title, item?.why, item?.drill]).toEqual(["Shots left open", "In 1 of 25 games.", "Look for their checks."]);
    expect(v.notes.lines).toEqual([UNSHOWN_NOTE]);
    // The figures stay in the details.
    expect(v.details.focus[0]).toContain("per 100 moves");
    const main = JSON.stringify([v.summary, item?.title, item?.why, item?.drill, item?.steps, item?.frequency, item?.standing, v.progressInGames, v.retiredInGames]);
    expect(main).not.toContain("per 100");
  });

  it("keeps stored wording without such a token, and falls back for a step that does not render", () => {
    const v = reportView(
      report({ focus: [focusItem({ steps: [{ blindSpot: "answer-check", text: "{rate} {count}" }] })] }),
      { fallback: builtIn },
    );
    const item = v.body.kind === "focus" ? v.body.items[0]! : undefined;
    expect(item?.title).toBe("Look at their checks first");
    expect(v.summary).toBe("25 games.");
    expect(item?.steps[0]?.text).toBe("23 of your 62 came with check.");
    expect(v.notes.lines).toEqual([UNSHOWN_NOTE]);
  });

  it("shows the plain stand-in without built-in wording, or when the built-in wording has the token too", () => {
    const r = report({ summary: "{mistakeRate} per 100 moves.", focus: [focusItem(stored)] });
    for (const v of [reportView(r), reportView(r, { fallback: { summary: "{mistakeRate}", focus: [{ patternId: "allowed-tactic", why: "{rate}" }] } })]) {
      const item = v.body.kind === "focus" ? v.body.items[0]! : undefined;
      expect(v.summary).toBe(UNSHOWN_SUMMARY);
      expect([item?.title, item?.why, item?.drill]).toEqual([UNSHOWN_WORDING, UNSHOWN_WORDING, UNSHOWN_WORDING]);
      expect(v.notes.lines).toEqual([UNSHOWN_NOTE]);
    }
  });
});
