import {
  BAND_RUBRIC,
  BLIND_SPOT_IDS,
  type BlindSpot,
  type ExampleStory,
  type FocusChoice,
  type MoveDetail,
  PATTERN_IDS,
  type PatternStat,
  type PeriodStats,
  type RatingBand,
  type ReportDraft,
  SUMMARY_TOKENS,
} from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import { BLIND_SPOT_MEANING, buildPrompt, WORDING_SCHEMA } from "./prompt";
import { PRINTED_TOKENS, parseWording, STEP_TOKENS, WORDING_FOCUS_TOKENS, WORDING_SUMMARY_TOKENS } from "./validate";

const SETTINGS = { analysisVersion: 1, patternsVersion: 1, engine: { name: "stockfish", depth: 12 } };

function stat(patternId: string, n: number): PatternStat {
  return { patternId, games: 30, moves: 1000, gamesAffected: n, occurrences: n + 1, per100Moves: (n + 1) / 10, avgWinPctLoss: 30 };
}

function period(start: string, end: string, n: number): PeriodStats {
  return {
    start,
    end,
    games: 30,
    moves: 1000,
    mistakesPer100Moves: 4.2,
    settings: SETTINGS,
    stats: PATTERN_IDS.map((id) => stat(id, n)),
  };
}

function choice(patternId: string, n: number): FocusChoice {
  return {
    patternId,
    exampleGameIds: [`g-${patternId}`],
    baseline: stat(patternId, n),
    target: ((n + 1) / 10) * 0.75,
    since: "2026-11-19T00:00:00.000Z",
    blindSpots: [],
    reason: {
      kind: "new",
      previousRank: null,
      score: 12.3456,
      recentCost: 7.891,
      naiveCostThisPeriod: 9.5,
      rate: 0.9,
      severity: 31.2,
      chronicity: 0.8,
      weeksRecurred: 4,
      weeksCounted: 5,
      weeks: [true, true, false, true, true, null],
    },
    examples: [
      {
        patternId,
        gameId: `g-${patternId}`,
        ply: 21,
        winPctLoss: 41.27,
        evidence: `${patternId} evidence text`,
        fen: `fen-for-${patternId} w - - 0 11`,
        played: "Bd3",
        best: "Nf3",
      },
    ],
  };
}

function draft(opts: { username: string; band?: RatingBand; focus: string[]; n?: number }): ReportDraft {
  const n = opts.n ?? 8;
  const end = "2026-11-19T00:00:00.000Z";
  return {
    player: opts.username,
    track: { platform: "lichess", username: opts.username, timeClass: "blitz" },
    kind: "first",
    revision: 0,
    periodStart: "2026-10-20T00:00:00.000Z",
    periodEnd: end,
    rating: 1500,
    band: opts.band ?? "club",
    bandSource: "ratings",
    settings: SETTINGS,
    gamesFound: 30,
    gamesAnalyzed: 30,
    gameIds: ["a", "b"],
    coverage: { sampled: 30, analysed: 30, total: 30, complete: true, sampleOnly: false },
    current: period("2026-10-20T00:00:00.000Z", end, n),
    comparison: null,
    weeks: Array.from({ length: 6 }, () => period("2026-11-12T00:00:00.000Z", end, n)),
    trends: [],
    priorities: [],
    focus: opts.focus.map((id) => choice(id, n)),
    progress: [],
    retired: [],
    notes: [],
  };
}

function mv(san: string, uci: string, piece: MoveDetail["piece"], color: MoveDetail["color"], extra: Partial<MoveDetail> = {}): MoveDetail {
  return { san, uci, from: uci.slice(0, 2), to: uci.slice(2, 4), piece, color, check: san.includes("+"), mate: false, fenAfter: `after-${uci}`, ...extra };
}

/** Fixture F1: r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2Q3R w - - 0 1, Qd2 allows Ne4+ forking king and queen. */
const F1_STORY: ExampleStory = {
  played: mv("Qd2", "d1d2", "queen", "white"),
  punish: [
    mv("Ne4+", "f6e4", "knight", "black"),
    mv("Ke1", "f2e1", "king", "white"),
    mv("Nxd2", "e4d2", "knight", "black", { captured: "queen" }),
    mv("Kxd2", "e1d2", "king", "white", { captured: "knight" }),
  ],
  replyFound: true,
  better: [mv("Re1", "h1e1", "rook", "white")],
  targets: [
    { square: "f2", piece: "king", color: "white" },
    { square: "d2", piece: "queen", color: "white" },
  ],
  lost: { square: "d2", piece: "queen", color: "white" },
  gain: -6,
  betterReason: { kind: "covers-square", square: "e4" },
  winPctBefore: 96,
  winPctAfter: 28,
  depth: 18,
};

/** Fixture F3: r4rk1/ppp2ppp/5n2/8/8/8/PPPQ1KPP/R6R b - - 1 1, h6 misses Ne4+. */
const F3_STORY: ExampleStory = {
  played: mv("h6", "h7h6", "pawn", "black"),
  punish: [],
  replyFound: false,
  better: [
    mv("Ne4+", "f6e4", "knight", "black"),
    mv("Ke1", "f2e1", "king", "white"),
    mv("Nxd2", "e4d2", "knight", "black", { captured: "queen" }),
    mv("Kxd2", "e1d2", "king", "white", { captured: "knight" }),
  ],
  targets: [],
  gain: 0,
  betterGain: 6,
  betterReason: { kind: "wins", piece: "queen", gave: "knight", gain: 6 },
  winPctBefore: 30,
  winPctAfter: 3,
  depth: 18,
};

function spot(id: string, over: Partial<BlindSpot> = {}): BlindSpot {
  return { id, basis: "line", count: 23, games: 14, of: 62, baselineCount: 53, baselineOf: 302, examples: [], ...over };
}

/** The worked example's input: allowed-tactic shown with F1, missed-tactic with F3. */
function storiedDraft(username: string, spots: { a: BlindSpot[]; b: BlindSpot[] }): ReportDraft {
  const d = draft({ username, focus: ["allowed-tactic", "missed-tactic"] });
  const [a, b] = d.focus as [FocusChoice, FocusChoice];
  a.blindSpots = spots.a;
  a.examples = [{ ...a.examples[0]!, fen: "r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2Q3R w - - 0 1", played: "Qd2", story: F1_STORY, traits: ["answer-check", "moved-piece-lost"] }];
  b.blindSpots = spots.b;
  b.examples = [{ ...b.examples[0]!, fen: "r4rk1/ppp2ppp/5n2/8/8/8/PPPQ1KPP/R6R b - - 1 1", played: "h6", story: F3_STORY }];
  return d;
}

const WORKED = { a: [spot("answer-check"), spot("moved-piece-lost")], b: [spot("best-check")] };

describe("buildPrompt", () => {
  it("sends a byte-identical system prefix for two different players", () => {
    const a = buildPrompt(draft({ username: "alpha-invented", band: "novice", focus: ["hung-piece"], n: 3 }));
    const b = buildPrompt(draft({ username: "beta-invented", band: "expert", focus: ["thrown-win", "time-trouble"], n: 11 }));
    const c = buildPrompt(draft({ username: "beta-invented", focus: ["thrown-win", "time-trouble"] }), ["time-trouble"]);
    expect(a.system).toBe(b.system);
    expect(c.system).toBe(a.system);
    expect(a.user).not.toBe(b.user);
  });

  it("keeps every player detail out of the system prefix", () => {
    const { system } = buildPrompt(draft({ username: "alpha-invented", focus: ["hung-piece"] }));
    expect(system).not.toContain("alpha-invented");
    expect(system).not.toContain("fen-for-");
  });

  it("holds the rubric, a glossary line per pattern, the token rules and a worked example", () => {
    const { system } = buildPrompt(draft({ username: "x", focus: [] }));
    for (const id of PATTERN_IDS) expect(system).toContain(`- ${id}: `);
    for (const band of Object.keys(BAND_RUBRIC) as RatingBand[]) {
      expect(system).toContain(BAND_RUBRIC[band].adviceLevel);
      expect(system).toContain(BAND_RUBRIC[band].eligible.join(", "));
    }
    for (const t of [...WORDING_FOCUS_TOKENS, ...WORDING_SUMMARY_TOKENS]) expect(system).toContain(`- {${t}}: `);
    expect(system).not.toContain("{mistakeRate}");
    expect(SUMMARY_TOKENS).toContain("mistakeRate");
    for (const t of PRINTED_TOKENS) expect(system).not.toContain(`{${t}}`);
    expect(system.split(/\s+/).length).toBeGreaterThan(900);
  });

  it("gives a worked example that passes the checks", () => {
    const { system } = buildPrompt(draft({ username: "x", focus: [] }));
    const example = /```json\n([\s\S]*?)\n```/.exec(system)?.[1];
    expect(example).toBeDefined();
    const result = parseWording(example!, storiedDraft("x", WORKED));
    expect(result.ok ? [] : result.errors).toEqual([]);
    expect(JSON.parse(example!).focus.map((f: { steps: unknown[] }) => f.steps.length)).toEqual([2, 1]);
    const parsed = JSON.parse(example!) as { summary: string };
    expect(parsed.summary).not.toMatch(/\b(one|two|both|pair|couple)\b/i);
    expect(system).toMatch(/illustrative only: never reuse them/);
    expect(system).toContain("Do not restate them");
    expect(system).toContain("is written only with its token, never as a number of your own");
    expect(system).toContain("No percentages, fractions of their games or rates, in any field.");
    expect(system).toContain("Numbers that describe a position, a clock or what to practise are fine as they are");
    expect(system).toContain("The report prints the frequency, goal and weeks lines itself, and shows rates only in its details, so leave those out entirely.");
    expect(system).toContain("do not open the why with how many games were affected");
    expect(system).toContain('State the player\'s overall level with {mistakesPerGame} only');
    expect(example).not.toMatch(/\{(gamesAffected|mistakeRate)\}|per hundred/);
    expect(system).toContain('never write "{gamesAffected} of" or "0 of" for it');
    expect(system).not.toMatch(/no number words other than|move it into the drill|any digit that counts/);
    expect(system).toContain("weeksCounted of three or more and weeksRecurred is more than half of weeksCounted");
    expect(example).not.toMatch(/\{(weeksRecurred|weeksCounted|rate|target)\}/);
  });

  it("puts the band, reasons, targets and example positions in the user part, not the username", () => {
    const { user } = buildPrompt(draft({ username: "alpha-invented", band: "beginner", focus: ["hung-piece", "missed-tactic"] }));
    expect(user).toContain('"band": "beginner"');
    expect(user).toContain('"mistakesPerGame": ');
    expect(user).not.toContain('"mistakeRate"');
    expect(user).toContain('"timeClass": "blitz"');
    expect(user).toContain('"kind": "new"');
    expect(user).toContain('"weeksRecurred": 4');
    expect(user).toContain('"gamesAffected": "8"');
    expect(user).not.toMatch(/"tokens": \{[^}]*"(rate|baselineRate|target|weeksRecurred|weeksCounted)"/);
    expect(user).toContain("fen-for-hung-piece w - - 0 11");
    expect(user).toContain('"played": "Bd3"');
    expect(user).toContain('"best": "Nf3"');
    expect(user).toContain("hung-piece evidence text");
    expect(user).toContain("in this order: hung-piece, missed-tactic");
    expect(user).not.toContain("alpha-invented");
  });

  it("restricts the user part to the ids in only", () => {
    const { user } = buildPrompt(draft({ username: "x", focus: ["hung-piece", "missed-tactic"] }), ["missed-tactic"]);
    expect(user).toContain("fen-for-missed-tactic");
    expect(user).not.toContain("fen-for-hung-piece");
    expect(user).toContain('"alreadyWorded": [\n    "hung-piece"\n  ]');
    expect(user).toContain("in this order: missed-tactic.");
  });

  it("includes earlier verdicts and retired items", () => {
    const d = draft({ username: "x", focus: ["missed-tactic"] });
    d.progress = [
      { patternId: "hung-piece", previous: stat("hung-piece", 9), current: stat("hung-piece", 3), verdict: "improved", pValue: 0.01 },
    ];
    d.retired = [
      { patternId: "thrown-win", why: "graduated", since: d.periodEnd, baseline: stat("thrown-win", 5), current: stat("thrown-win", 1) },
    ];
    const { user } = buildPrompt(d);
    expect(user).toContain('"verdict": "improved"');
    expect(user).toContain('"why": "graduated"');
  });

  it("uses no schema keywords the providers reject", () => {
    expect(JSON.stringify(WORDING_SCHEMA)).not.toMatch(/maxItems|minimum|maxLength|oneOf/);
  });

  it("sends a byte-identical system prefix for two players with different blind spots", () => {
    const a = buildPrompt(storiedDraft("alpha-invented", WORKED));
    const b = buildPrompt(
      storiedDraft("beta-invented", { a: [spot("lost-queen", { count: 5, refinement: { id: "answer-knight-check", count: 3 } })], b: [] }),
      ["missed-tactic"],
    );
    expect(a.system).toBe(b.system);
    expect(a.user).not.toBe(b.user);
    expect(a.system).not.toMatch(/alpha-invented|beta-invented/);
  });

  it("explains blind spots, good steps, the move rule and the step tokens in the prefix", () => {
    const { system } = buildPrompt(storiedDraft("x", WORKED));
    expect(system).toContain("# Blind spots and steps");
    expect(system).toContain("A good step is specific (what to look at, and when), checkable");
    expect(system).toContain("# Moves and squares");
    expect(system).toContain("Name no other move or square");
    expect(system).toContain("The summary is about the whole period: it names no move and no square.");
    for (const t of STEP_TOKENS) expect(system).toContain(`- {${t}}: `);
    expect(system).toContain('An item with no blind spots gets "steps": [].');
  });

  it("gives every blind-spot id a plain meaning", () => {
    for (const id of BLIND_SPOT_IDS) expect(BLIND_SPOT_MEANING[id]).toMatch(/\w/);
  });

  it("puts each item's blind spots and example stories in the user part", () => {
    const d = storiedDraft("alpha-invented", {
      a: [spot("answer-check", { refinement: { id: "answer-knight-check", count: 9 } }), spot("answer-fork", { basis: "motif", count: 0, baselineCount: 0 })],
      b: [spot("best-check")],
    });
    const { user } = buildPrompt(d);
    const data = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(user)![1]!);
    const [a, b] = data.focus;
    expect(a.blindSpots[0]).toEqual({
      id: "answer-check",
      meaning: "the opponent's punishing move was a check",
      tokens: { count: "23", of: "62", games: "14" },
      // 53 of 302 mistakes overall: about one in six.
      overall: "about 1 in 6 of the mistakes overall",
      refinement: { id: "answer-knight-check", meaning: "the punishing move was a check by the knight that moved" },
    });
    expect(a.blindSpots[1]).toMatchObject({ id: "answer-fork", heuristic: true, overall: "rare elsewhere" });
    // The plain share, whatever the pattern's own count: no subtraction.
    const odd = buildPrompt(storiedDraft("x", { a: [spot("lost-queen", { count: 9, baselineCount: 4, baselineOf: 40 })], b: [] })).user;
    expect(odd).toContain('"overall": "about 1 in 10 of the mistakes overall"');
    expect(user).not.toContain("other mistakes");
    expect(buildPrompt(d).system).not.toContain("other mistakes");
    // F1 here has no inGame (older data): it is labelled as what the move allowed, and nothing more.
    expect(a.examples[0]).toEqual({
      played: "Qd2 (your queen d1-d2)",
      allowed: {
        line: "Ne4+ (their knight f6-e4, check), Ke1 (your king f2-e1), Nxd2 (their knight e4-d2, takes your queen), Kxd2 (your king e1-d2, takes their knight)",
        hits: "your king f2, your queen d2",
        wouldCost: "your queen d2, for nothing",
      },
      better: "Re1 (your rook h1-e1)",
      betterReason: { kind: "covers-square", says: "it covers e4, so the punishing move no longer works there" },
      fact: "allowed-tactic evidence text",
      traits: ["answer-check", "moved-piece-lost"],
      winPctLost: 41.3,
    });
    expect(b.examples[0]).toMatchObject({
      played: "h6 (your pawn h7-h6)",
      better: "Ne4+ (your knight f6-e4, check), Ke1 (their king f2-e1), Nxd2 (your knight e4-d2, takes their queen), Kxd2 (their king e1-d2, takes your knight)",
      betterReason: { kind: "wins", says: "it wins their queen for your knight" },
    });
    // A storied example is told in moves, not as a position.
    expect(user).not.toContain("r4rk1/");
    expect(user).not.toMatch(/"(baselineCount|baselineOf|basis|examples)": \d/);
  });

  it("keeps a position for an example without a story", () => {
    const { user } = buildPrompt(draft({ username: "x", focus: ["hung-piece"] }));
    expect(user).toContain('"fen": "fen-for-hung-piece w - - 0 11"');
    expect(user).toContain('"blindSpots": []');
  });

  it("asks for steps in the schema", () => {
    const items = (WORDING_SCHEMA as { properties: { focus: { items: { required: string[]; properties: Record<string, unknown> } } } }).properties.focus.items;
    expect(items.required).toContain("steps");
    expect(items.properties.steps).toMatchObject({ type: "array", items: { required: ["blindSpot", "text"] } });
  });

  /*
   * After 1.Qc1 the engine answers Ne2+ Kh1 Nxc1, winning the queen; the game went 1...Ne2+
   * 2.Kh1 Rad8 and the queen was never taken. In a second game the same mistake was followed
   * by Qd2 Rxd2: a different move took the queen.
   */
  const QC1 = mv("Qc1", "d2c1", "queen", "white");
  const ALLOWED = [mv("Ne2+", "f4e2", "knight", "black"), mv("Kh1", "g1h1", "king", "white"), mv("Nxc1", "e2c1", "knight", "black", { captured: "queen" })];
  const qc1Story = (inGame: ExampleStory["inGame"]): ExampleStory => ({
    played: QC1,
    punish: ALLOWED,
    replyFound: true,
    better: [mv("Qe3", "d2e3", "queen", "white")],
    targets: [
      { square: "g1", piece: "king", color: "white" },
      { square: "c1", piece: "queen", color: "white" },
    ],
    lost: { square: "c1", piece: "queen", color: "white" },
    lostFor: "knight",
    ...(inGame ? { inGame } : {}),
    gain: -6,
    winPctBefore: 60,
    winPctAfter: 10,
    depth: 18,
  });
  const withStory = (story: ExampleStory) => {
    const d = storiedDraft("x", WORKED);
    d.focus[0]!.examples = [{ ...d.focus[0]!.examples[0]!, played: "Qc1", story }];
    return d;
  };
  const exampleOf = (d: ReportDraft) => JSON.parse(/```json\n([\s\S]*?)\n```/.exec(buildPrompt(d).user)![1]!).focus[0].examples[0];

  it("tells what the move allowed apart from what the game did, when nothing was lost", () => {
    const d = withStory(
      qc1Story({ moves: [mv("Ne2+", "f4e2", "knight", "black"), mv("Kh1", "g1h1", "king", "white"), mv("Rad8", "a8d8", "rook", "black")], ended: false }),
    );
    const ex = exampleOf(d);
    expect(ex.allowed).toEqual({
      line: "Ne2+ (their knight f4-e2, check), Kh1 (your king g1-h1), Nxc1 (their knight e2-c1, takes your queen)",
      hits: "your king g1, your queen c1",
      wouldCost: "your queen c1, for their knight",
    });
    // Not paid: the next moves only, no cost either way.
    expect(ex.inGame).toEqual({
      moves: "Ne2+ (their knight f4-e2, check), Kh1 (your king g1-h1), Rad8 (their rook a8-d8)",
      paid: false,
    });
    expect(JSON.stringify(ex)).not.toMatch(/opponentFoundIt|"lost": "your/);
    // The moves the game went on with may be named, as may the engine's line.
    const answer = (why: string) =>
      JSON.stringify({
        summary: "Over {games} games you made {mistakesPerGame} mistakes a game.",
        focus: [
          { patternId: "allowed-tactic", title: "Checks", why, drill: "Look at their checks.", steps: WORKED.a.map((b) => ({ blindSpot: b.id, text: "Look at their checks first." })) },
          { patternId: "missed-tactic", title: "Checks", why: "A check went unplayed.", drill: "Look at your checks.", steps: [{ blindSpot: "best-check", text: "Look at your checks first." }] },
        ],
      });
    expect(parseWording(answer("Qc1 allowed Ne2+ and Nxc1, which could have cost your queen; they played Rad8 instead."), d)).toMatchObject({ ok: true });
    expect(parseWording(answer("After Qc1 they played Rd7."), d).ok).toBe(false);
  });

  it("says which piece was really lost when a different move took it", () => {
    const d = withStory(
      qc1Story({
        moves: [mv("Ne2+", "f4e2", "knight", "black"), mv("Kh1", "g1h1", "king", "white"), mv("Rad8", "a8d8", "rook", "black"), mv("Qd2", "c1d2", "queen", "white"), mv("Rxd2", "d8d2", "rook", "black", { captured: "queen" })],
        paid: true,
        net: 9,
        lost: { square: "d2", piece: "queen", color: "white" },
        ended: false,
      }),
    );
    expect(exampleOf(d).inGame).toEqual({
      moves: "Ne2+ (their knight f4-e2, check), Kh1 (your king g1-h1), Rad8 (their rook a8-d8), Qd2 (your queen c1-d2), Rxd2 (their rook d8-d2, takes your queen)",
      paid: true,
      lost: "your queen d2, for nothing",
      material: "9 pawns' worth down",
    });
    const ex = withStory(qc1Story({ moves: [], paid: true, net: 2, lostFor: "knight", exchange: true, lost: { square: "e4", piece: "rook", color: "white" }, ended: true }));
    expect(exampleOf(ex).inGame).toEqual({
      moves: "none",
      paid: true,
      lost: "your rook e4, for their knight",
      exchange: "you gave a rook for a knight or bishop",
      material: "2 pawns' worth down",
      gameEnded: true,
    });
  });

  it("reads a stored inGame without paid as unpaid and shows no cost", () => {
    const stored = qc1Story({ moves: [mv("Ne2+", "f4e2", "knight", "black")], net: 9, lost: { square: "c1", piece: "queen", color: "white" }, ended: false });
    expect(exampleOf(withStory(stored)).inGame).toEqual({ moves: "Ne2+ (their knight f4-e2, check)", paid: false });
  });

  it("explains allowed and inGame in the prefix, the same for every player", () => {
    const { system } = buildPrompt(storiedDraft("x", WORKED));
    expect(system).toContain("Otherwise say only what the move allowed or could have cost");
    expect(system).toContain("you may say the opponent did not play the punishing move, but nothing about how the game turned out after it");
    expect(system).not.toMatch(/opponentFoundIt|couldHaveLost|got away/);
    expect(system).toContain("inGame is only the next few moves the game really played, not a verdict on how the game went.");
    expect(system).toContain('State a cost as fact (\"it cost your queen\") only for an example whose inGame says paid is true.'.replace(/\\"/g, '"'));
    expect(system).toBe(buildPrompt(storiedDraft("y", { a: [], b: [spot("best-check")] })).system);
  });
});
