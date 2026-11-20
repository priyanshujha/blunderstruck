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

  it.each([
    ["You hung a piece in 9 of 31 games.", /writes a number/],
    ["That was 9/31.", /writes a number/],
    ["It cost 40% of the time.", /writes a number/],
    ["It cost 12 percent.", /writes a number/],
    ["It happened 3 times.", /writes a number/],
    ["For 2 weeks running.", /writes a number/],
    ["In 12 games out of the lot.", /writes a number/],
    ["About 1.5 per hundred.", /writes a number/],
    ["Once every 30 moves.", /writes a number/],
    ["You made 4.25 mistakes per hundred moves.", /writes a number/],
    ["That happened 12 separate times.", /writes a number/],
    ["You blundered 9 pieces in 31 outings.", /writes a number/],
    ["Solve 3 per day.", /writes a number/],
    ["Your 1500 rating says otherwise.", /writes a number/],
    ["Keep 90 seconds in reserve.", /writes a number/],
    ["You hung a piece in nine of thirty-one games.", /count in words/],
    ["It happened twelve separate times.", /count in words/],
    ["In half the games the queen went first.", /count in words/],
    ["Twice in a dozen outings.", /count in words/],
    ["For three weeks running.", /count in words/],
  ])("rejects %j", (why, error) => {
    expect(errorsOf(withWhy(why)).join("\n")).toMatch(error);
  });

  it.each([
    "Nf3",
    "1.e4",
    "move 12",
    "2 rooks",
    "O-O",
    "e4",
    "mate in 2",
    "Qxh7+",
    "20...Qxh2",
    "{gamesAffected} of {games} games",
    "Calculate 2 moves deep.",
    "Watch the first 12 moves.",
    "By move 12 of the game the plan was gone.",
    "Look again at moves 10 to 15.",
    "Find 3 candidate moves before you choose.",
    "Solve 5 puzzles, then play.",
    "Ten minutes a day, or 10 minutes if you prefer digits.",
    "Below 30 seconds, play safe moves.",
    "In 3+2 blitz the clock bites early.",
    "A rook on the 7th rank is worth 2 pawns.",
    "The knight on f6 was loose after e4.",
    "Nf3 of all moves left the bishop on b5 hanging.",
    "After 1. e4 e5 2. Nf3 the queen on d1 does nothing.",
    "Qxh7+ was mate in the example; O-O-O walked into it; exd5 and e8=Q# came later.",
    "Move 12 was where it went wrong.",
    "Pick one habit and keep it for the week.",
    "It happened twice. Once is a slip.",
  ])("lets %j through", (why) => {
    expect(errorsOf(withWhy(why))).toEqual([]);
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
      for (const kind of ["new", "kept", "rose", "returned"] as const) {
        const d = draft([choice(id, kind)], band);
        const w = templateWording(d);
        expect(parseWording(JSON.stringify(w), d)).toMatchObject({ ok: true });
        const values = focusTokenValues(d.focus[0]!, d);
        const why = renderText(w.focus[0]!.why, values);
        expect(why).toContain("9 of your 31 games");
        expect(why).toContain("0.90 per hundred moves");
        renderText(w.focus[0]!.title, values);
        renderText(w.focus[0]!.drill, values);
        renderText(w.summary, summaryTokenValues(d));
      }
    }
  });

  it("sizes the drill by band", () => {
    const novice = templateWording(draft([choice("hung-piece")], "novice")).focus[0]!.drill;
    const club = templateWording(draft([choice("hung-piece")], "club")).focus[0]!.drill;
    const expert = templateWording(draft([choice("hung-piece")], "expert")).focus[0]!.drill;
    expect(new Set([novice, club, expert]).size).toBe(3);
    expect(templateWording(draft([choice("hung-piece")], "beginner")).focus[0]!.drill).toBe(novice);
  });

  it("mentions persistence only when weeks were counted", () => {
    expect(templateWording(draft([choice("thrown-win")])).focus[0]!.why).toContain("{weeksRecurred} of your last {weeksCounted} weeks");
    expect(templateWording(draft([choice("thrown-win", "new", 0)])).focus[0]!.why).not.toContain("{weeksRecurred}");
  });

  it("writes a summary for none, one or two items, few games, and earlier progress", () => {
    const render = (d: ReportDraft) => renderText(templateWording(d).summary, summaryTokenValues(d));
    expect(render(draft([]))).toContain("No single habit");
    expect(render(draft([choice("hung-piece")]))).toContain("One habit stands out: pieces left hanging.");
    expect(render(TWO)).toContain("Two habits stand out: pieces left hanging and missed tactics.");
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
