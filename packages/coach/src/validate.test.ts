import {
  type FocusChoice,
  focusTokenValues,
  PATTERN_IDS,
  type PatternStat,
  type PeriodStats,
  RATING_BANDS,
  type RatingBand,
  type ReportDraft,
  renderText,
  summaryTokenValues,
} from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import { templateWording } from "./templates";
import { parseWording } from "./validate";

const SETTINGS = { analysisVersion: 1, patternsVersion: 1, engine: { name: "stockfish", depth: 12 } };

function stat(patternId: string): PatternStat {
  return { patternId, games: 31, moves: 1000, gamesAffected: 9, occurrences: 12, per100Moves: 1.2, avgWinPctLoss: 30 };
}

function period(): PeriodStats {
  return {
    start: "2026-10-20T00:00:00.000Z",
    end: "2026-11-19T00:00:00.000Z",
    games: 31,
    moves: 1000,
    mistakesPer100Moves: 4.25,
    settings: SETTINGS,
    stats: PATTERN_IDS.map(stat),
  };
}

function choice(patternId: string, kind: FocusChoice["reason"]["kind"] = "new", weeksCounted = 5): FocusChoice {
  return {
    patternId,
    exampleGameIds: [],
    baseline: stat(patternId),
    target: 0.9,
    since: "2026-11-19T00:00:00.000Z",
    reason: {
      kind,
      previousRank: null,
      score: 10,
      recentCost: 8,
      naiveCostThisPeriod: 9,
      rate: 1.2,
      severity: 30,
      chronicity: 0.7,
      weeksRecurred: 4,
      weeksCounted,
      weeks: [true, true, false, true, true, null],
    },
    examples: [],
  };
}

function draft(focus: FocusChoice[], band: RatingBand = "club"): ReportDraft {
  return {
    player: "invented-player",
    track: { platform: "lichess", username: "invented-player", timeClass: "rapid" },
    kind: "first",
    revision: 0,
    periodStart: "2026-10-20T00:00:00.000Z",
    periodEnd: "2026-11-19T00:00:00.000Z",
    rating: 1500,
    band,
    bandSource: "ratings",
    settings: SETTINGS,
    gamesFound: 31,
    gamesAnalyzed: 31,
    gameIds: [],
    coverage: { sampled: 31, analysed: 31, total: 31, complete: true, sampleOnly: false },
    current: period(),
    comparison: null,
    weeks: Array.from({ length: 6 }, period),
    trends: [],
    priorities: [],
    focus,
    progress: [],
    retired: [],
    notes: [],
  };
}

const TWO = draft([choice("hung-piece"), choice("missed-tactic")]);

function answer(over: { summary?: string; focus?: Partial<{ patternId: string; title: string; why: string; drill: string }>[] } = {}) {
  const base = [
    { patternId: "hung-piece", title: "Pieces left out", why: "In {gamesAffected} of your {games} games.", drill: "Check e4 and Nf3." },
    { patternId: "missed-tactic", title: "Missed shots", why: "{rate} times per hundred moves.", drill: "Puzzles daily." },
  ];
  const focus = over.focus ? over.focus.map((f, i) => ({ ...base[i % 2]!, ...f })) : base;
  return JSON.stringify({ summary: over.summary ?? "Over {games} games, {mistakeRate} mistakes per hundred moves.", focus });
}

function withWhy(why: string) {
  return answer({ focus: [{ why }, {}] });
}

const errorsOf = (text: string, d: ReportDraft = TWO, only?: string[]) => {
  const r = parseWording(text, d, only);
  return r.ok ? [] : r.errors;
};

describe("parseWording", () => {
  it("accepts a good answer", () => {
    const r = parseWording(answer(), TWO);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.focus.map((f) => f.patternId)).toEqual(["hung-piece", "missed-tactic"]);
  });

  it('rejects "in 9 of 31 games" and accepts "in {gamesAffected} of {games} games"', () => {
    expect(errorsOf(withWhy("You hung a piece in 9 of 31 games."))).not.toEqual([]);
    expect(errorsOf(withWhy("You hung a piece in {gamesAffected} of {games} games."))).toEqual([]);
  });

  /**
   * Every sentence, checked as a record field (why) and as a drill. Record fields describe
   * what the player did and hold no counts; a drill may size practice but not state a statistic.
   */
  const R = true;
  const X = false;
  it.each([
    // [sentence, passes in why, passes in drill]
    ["You hung a piece in 9 of 31 games.", X, X],
    ["That was 9/31.", X, X],
    ["It cost 40% of the time.", X, X],
    ["It cost 12 percent.", X, X],
    ["It happened 3 times.", X, R],
    ["For 2 weeks running.", X, R],
    ["In 12 games out of the lot.", X, R],
    ["About 1.5 per hundred.", X, X],
    ["Once every 30 moves.", X, R],
    ["You made 4.25 mistakes per hundred moves.", X, X],
    ["That happened 12 separate times.", X, R],
    ["You blundered 9 pieces in 31 outings.", X, X],
    ["Solve 3 per day.", X, R],
    ["Your 1500 rating says otherwise.", X, R],
    ["Keep 90 seconds in reserve.", X, R],
    ["You hung a piece in nine of thirty-one games.", X, X],
    ["It happened twelve separate times.", X, R],
    ["In half the games the queen went first.", X, R],
    ["Twice in a dozen outings.", X, X],
    ["For three weeks running.", X, R],
    ["For two weeks, play only slow games.", X, R],
    ["Replay two master games in your opening.", X, R],
    ["Nine errors in the endgame alone.", X, R],
    ["You blundered 9 pieces in the endgame.", X, X],
    ["You left nine pieces en prise.", X, R],
    ["You hung 3 queens this month.", X, X],
    ["You lost two rooks to back-rank tricks.", X, X],
    ["You gave away three bishops.", X, X],
    ["Nine positions went wrong the same way.", X, R],
    ["Seven losses came from the same idea.", X, R],
    ["Twelve percent of your moves were errors.", X, X],
    ["It happens twice in every hundred moves.", X, X],
    ["That is two per hundred moves.", X, X],
    ["It came up in nine of your recent rated games.", X, X],
    ["You slip once every 20 moves.", X, R],
    ["You had under 10 seconds in most games.", X, R],
    ["That is two-point-one mistakes per hundred moves.", X, X],
    ["You hung a piece in ٩ games.", X, X],
    ["It happened ３ times.", X, X],
    ["It came up in a third of your games.", X, R],
    ["It came up in a quarter of your games.", X, R],
    ["It went wrong in half the games.", X, R],
    ["The count went from three to two.", X, R],
    ["Keep it below two.", X, R],
    ["There were nine such moments.", X, R],
    ["Do this drill three times a week.", X, R],
    ["Solve a set twice a week.", X, R],
    ["Analyse one game a day.", X, R],
    ["Play one 15-minute game each day.", X, R],
    ["Review one of your losses each day.", X, R],
    ["Replay one of your games with the engine off.", X, R],
    ["Play it out against an engine ten times.", X, R],
    ["It happened twice. Once is a slip.", X, R],
    ["Ten minutes a day, or 10 minutes if you prefer digits.", X, R],
    ["Play one longer game each day.", X, R],
    ["Play the 2 most forcing moves first.", X, R],
    ["Run a 3-fold check before you move.", X, R],
    ["Use one of your two bishops on the long diagonal.", R, R],
    ["It turned up in most of your games.", R, R],
    ["{gamesAffected} of {games} games", R, R],
    ["You hung a piece in {gamesAffected} of your {games} games.", R, R],
    ["Nf3", R, R],
    ["1.e4", R, R],
    ["move 12", R, R],
    ["2 rooks", R, R],
    ["O-O", R, R],
    ["e4", R, R],
    ["mate in 2", R, R],
    ["Qxh7+", R, R],
    ["20...Qxh2", R, R],
    ["Calculate 2 moves deep.", R, R],
    ["Calculate two moves deep.", R, R],
    ["Watch the first 12 moves.", R, R],
    ["By move 12 of the game the plan was gone.", R, R],
    ["Look again at moves 10 to 15.", R, R],
    ["Find 3 candidate moves before you choose.", R, R],
    ["Solve 5 puzzles, then play.", R, R],
    ["Below 30 seconds, play safe moves.", R, R],
    ["In 3+2 blitz the clock bites early.", R, R],
    ["A rook on the 7th rank is worth 2 pawns.", R, R],
    ["The knight on f6 was loose after e4.", R, R],
    ["Nf3 of all moves left the bishop on b5 hanging.", R, R],
    ["After 1. e4 e5 2. Nf3 the queen on d1 does nothing.", R, R],
    ["Qxh7+ was mate in the example; O-O-O walked into it; exd5 and e8=Q# came later.", R, R],
    ["Move 12 was where it went wrong.", R, R],
    ["Pick one habit and keep it for the week.", R, R],
    ["Castle early: 0-0 or 0-0-0, then connect the rooks.", R, R],
    ["The bishop on the a1-h8 diagonal eyes the f7-square.", R, R],
    ["The d5-pawn blocks it; e4-e5 opens the line.", R, R],
    ["Look for a 2-move combination first.", R, R],
    ["Play 10-minute games to practise this.", R, R],
    ["Use a 5-second rule before every capture.", R, R],
    ["The 10th move is where it usually goes wrong.", R, R],
    ["Learn the first 25 moves of your main line.", R, R],
    ["Checks, captures, threats: all 3 before every move.", R, R],
    ["Trade 2 rooks when you are ahead.", R, R],
    ["Three queens on the board is a puzzle, not a game plan.", R, R],
    ["{rate} times per hundred moves in your games.", R, X],
  ] as const)("%j: why %s, drill %s", (text, inWhy, inDrill) => {
    const asWhy = errorsOf(answer({ focus: [{ why: text }, {}] }));
    const asDrill = errorsOf(answer({ focus: [{ drill: text }, {}] }));
    expect(asWhy.length === 0, asWhy.join("\n")).toBe(inWhy);
    expect(asDrill.length === 0, asDrill.join("\n")).toBe(inDrill);
  });

  it("applies the record rule to the title and the summary too", () => {
    expect(errorsOf(answer({ focus: [{ title: "Nine such moments" }, {}] }))[0]).toMatch(/title writes a count in words/);
    expect(errorsOf(answer({ summary: "A third of your games went this way." }))[0]).toMatch(/summary writes a count in words/);
    expect(errorsOf(answer({ summary: "Do it three times a week." }))[0]).toMatch(/summary writes a count/);
    expect(errorsOf(answer({ focus: [{ title: "Two rooks, no plan" }, {}] }))).toEqual([]);
  });

  it("tells a repair to drop the count or move it into the drill, not to use a token", () => {
    const whyError = errorsOf(withWhy("It happened 3 times."))[0]!;
    expect(whyError).toMatch(/writes a number \("3 times\."\)/);
    expect(whyError).toMatch(/drop the count, or move it into the drill as a study quantity/);
    expect(whyError).not.toMatch(/use a token/);
    const drillError = errorsOf(answer({ focus: [{ drill: "Get it under 40%." }, {}] }))[0]!;
    expect(drillError).toMatch(/drill states a statistic \("%"\)/);
  });

  it("skips the count scan on a field that is already too long", () => {
    const long = `${"9".repeat(500)} games`;
    expect(errorsOf(withWhy(long))).toEqual([expect.stringMatching(/why is 506 characters/)]);
  });

  it("allows the weeks tokens only when at least three weeks were counted for the item", () => {
    const persist = "It came up in {weeksRecurred} of your last {weeksCounted} weeks.";
    const text = answer({ focus: [{ why: persist }, {}] });
    expect(errorsOf(text, draft([choice("hung-piece", "new", 3), choice("missed-tactic")]))).toEqual([]);
    for (const counted of [0, 2]) {
      const errors = errorsOf(text, draft([choice("hung-piece", "new", counted), choice("missed-tactic")]));
      expect(errors.join("\n")).toMatch(/focus\[0\] \(hung-piece\)\.why cites weeks, but too few weeks/);
    }
    const inTitle = answer({ focus: [{}, { title: "Back {weeksRecurred} weeks" }] });
    expect(errorsOf(inTitle, draft([choice("hung-piece"), choice("missed-tactic", "new", 1)])).join("\n")).toMatch(
      /focus\[1\] \(missed-tactic\)\.title cites weeks/,
    );
  });

  it("rejects unknown tokens and tokens from the wrong field", () => {
    expect(errorsOf(withWhy("In {bogus} games."))[0]).toMatch(/\{bogus\}/);
    expect(errorsOf(withWhy("At {mistakeRate} per hundred moves."))[0]).toMatch(/\{mistakeRate\}/);
    expect(errorsOf(answer({ summary: "At {rate} per hundred moves." }))[0]).toMatch(/summary uses \{rate\}/);
    expect(errorsOf(withWhy("A stray { brace."))[0]).toMatch(/unmatched brace/);
  });

  it("rejects wrong, missing, extra and reordered pattern ids", () => {
    expect(errorsOf(answer({ focus: [{ patternId: "thrown-win" }, {}] }))[0]).toMatch(/exactly these patternIds/);
    expect(errorsOf(answer({ focus: [{}] }))[0]).toMatch(/exactly these patternIds/);
    expect(errorsOf(answer({ focus: [{}, {}, {}] }))[0]).toMatch(/exactly these patternIds/);
    const reordered = JSON.stringify({ summary: "Fine.", focus: JSON.parse(answer()).focus.reverse() });
    expect(errorsOf(reordered)[0]).toMatch(/exactly these patternIds/);
  });

  it("expects only the ids in only, in draft order", () => {
    const one = JSON.stringify({ summary: "Fine.", focus: [JSON.parse(answer()).focus[1]] });
    expect(errorsOf(one, TWO, ["missed-tactic"])).toEqual([]);
    expect(errorsOf(answer(), TWO, ["missed-tactic"])[0]).toMatch(/\[missed-tactic\]/);
  });

  it("enforces the length limits", () => {
    expect(errorsOf(answer({ focus: [{ title: "x".repeat(60) }, {}] }))).toEqual([]);
    expect(errorsOf(answer({ focus: [{ title: "x".repeat(61) }, {}] }))[0]).toMatch(/title is 61 characters/);
    expect(errorsOf(answer({ focus: [{ why: "x".repeat(401) }, {}] }))[0]).toMatch(/why is 401/);
    expect(errorsOf(answer({ focus: [{ drill: "x".repeat(401) }, {}] }))[0]).toMatch(/drill is 401/);
    expect(errorsOf(answer({ summary: "x".repeat(601) }))[0]).toMatch(/summary is 601/);
  });

  it("rejects text that is not the schema", () => {
    expect(errorsOf("not json")).toEqual(["the answer is not valid JSON"]);
    expect(errorsOf("[]")[0]).toMatch(/JSON object/);
    expect(errorsOf(JSON.stringify({ summary: "Fine." }))).toContain("focus must be an array");
    expect(errorsOf(JSON.stringify({ summary: "", focus: [] }), draft([]))).toContain("summary must be a non-empty string");
    expect(errorsOf(JSON.stringify({ summary: "Fine.", focus: [], extra: 1 }), draft([]))).toContain("unexpected field extra");
    expect(errorsOf(answer({ focus: [{ title: "" }, {}] }))).toContain("focus[0].title must be a non-empty string");
  });

  it("accepts an answer wrapped in a code fence", () => {
    expect(parseWording("```json\n" + answer() + "\n```", TWO).ok).toBe(true);
  });
});

describe("templateWording", () => {
  const bands = RATING_BANDS.map((b) => b.id);

  it.each(bands)("passes the checks and renders for every pattern at band %s", (band) => {
    for (const id of PATTERN_IDS) {
      for (const [kind, weeksCounted] of [["new", 5], ["kept", 2], ["rose", 0], ["returned", 6]] as const) {
        const d = draft([choice(id, kind, weeksCounted)], band);
        const w = templateWording(d);
        expect(parseWording(JSON.stringify(w), d)).toMatchObject({ ok: true });
        const values = focusTokenValues(d.focus[0]!, d);
        const why = renderText(w.focus[0]!.why, values);
        expect(why).toContain("9 of your 31 games");
        expect(why.split(/(?<=\.)\s+/).length).toBeLessThanOrEqual(2);
        renderText(w.focus[0]!.title, values);
        renderText(w.focus[0]!.drill, values);
        renderText(w.summary, summaryTokenValues(d));
      }
    }
  });

  /** The draft with this period's stat for `id` set to `affected` of `games` games. */
  function withAffected(id: string, affected: number, games: number): ReportDraft {
    const d = draft([choice(id, "kept")]);
    d.current = {
      ...d.current,
      games,
      stats: d.current.stats.map((s) =>
        s.patternId === id ? { ...s, games, gamesAffected: affected, occurrences: affected, per100Moves: affected / 10 } : s,
      ),
    };
    return d;
  }

  it.each([
    [0, 14, "these 14 games. Keep the habit going so it stays that way."],
    [0, 1, "this game. Keep the habit going so it stays that way."],
    [1, 14, "in a single game out of 14."],
    [5, 14, "in 5 of your 14 games."],
    [14, 14, "in each of your 14 games."],
    [1, 1, "in your only game this period."],
  ])("reads right with %i of %i games affected, for every pattern", (affected, games, expected) => {
    for (const id of PATTERN_IDS) {
      const d = withAffected(id, affected, games);
      const w = templateWording(d);
      expect(parseWording(JSON.stringify(w), d)).toMatchObject({ ok: true });
      const why = renderText(w.focus[0]!.why, focusTokenValues(d.focus[0]!, d));
      expect(why).toContain(expected);
      expect(why).not.toMatch(/\b0 of\b|\b1 of\b|\b1 games\b/);
    }
  });

  it("gives missed-tactic a quiet-period why when it stayed away", () => {
    expect(templateWording(withAffected("missed-tactic", 0, 14)).focus[0]!.why).toBe(
      "No winning tactic went unplayed in these {games} games. Keep the habit going so it stays that way.",
    );
  });

  it("sizes the drill by band", () => {
    const novice = templateWording(draft([choice("hung-piece")], "novice")).focus[0]!.drill;
    const club = templateWording(draft([choice("hung-piece")], "club")).focus[0]!.drill;
    const expert = templateWording(draft([choice("hung-piece")], "expert")).focus[0]!.drill;
    expect(new Set([novice, club, expert]).size).toBe(3);
    expect(templateWording(draft([choice("hung-piece")], "beginner")).focus[0]!.drill).toBe(novice);
  });

  it("leaves weeks, rate and target out of why, since the report prints them below it", () => {
    for (const id of PATTERN_IDS) {
      const w = templateWording(draft([choice(id)])).focus[0]!;
      for (const text of [w.why, w.drill]) {
        expect(text).not.toMatch(/\{(weeksRecurred|weeksCounted|rate|baselineRate|target)\}/);
        expect(text).not.toMatch(/weeks?\b/i);
      }
    }
    expect(templateWording(draft([choice("missed-tactic")])).focus[0]!.why).toBe(
      "You had a winning tactic and did not play it in {gamesAffected} of your {games} games. A shot like that can decide a game on the spot.",
    );
  });

  it("writes a summary for none, one or two items, few games, and earlier progress", () => {
    const render = (d: ReportDraft) => renderText(templateWording(d).summary, summaryTokenValues(d));
    expect(render(draft([]))).toContain("No single habit");
    expect(render(draft([choice("hung-piece")]))).toContain("One habit stands out: pieces left hanging.");
    expect(render(TWO)).toContain("The habits that stand out: pieces left hanging and missed tactics.");
    const few = { ...draft([]), notes: ["few-games" as const] };
    expect(render(few)).toContain("Only 31 games");
    const better = draft([choice("missed-tactic")]);
    better.progress = [{ patternId: "hung-piece", previous: stat("hung-piece"), current: stat("hung-piece"), verdict: "improved", pValue: 0.01 }];
    better.retired = [{ patternId: "thrown-win", why: "graduated", since: better.periodEnd, baseline: stat("thrown-win"), current: stat("thrown-win") }];
    const text = render(better);
    expect(text).toContain("Fewer pieces left hanging than before");
    expect(text).toContain("Graduated, and well earned: thrown wins.");
    expect(parseWording(JSON.stringify(templateWording(better)), better).ok).toBe(true);
  });
});
