import {
  type BlindSpot,
  type ExampleStory,
  type FocusChoice,
  type FocusExample,
  type MoveDetail,
  PATTERN_IDS,
  type PatternStat,
  type PeriodStats,
  type ReportDraft,
  WeeklyReport,
} from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import { HttpError } from "./http";
import { buildPrompt, WORDING_SCHEMA } from "./prompt";
import { type CoachProvider, type CompleteRequest, ProviderResponseError } from "./provider";
import { TEMPLATE_STEPS, templateWording } from "./templates";
import { writeReport } from "./write";

const SETTINGS = { analysisVersion: 1, patternsVersion: 1, engine: { name: "stockfish", depth: 12 } };

function stat(patternId: string): PatternStat {
  return { patternId, games: 30, moves: 1000, gamesAffected: 6, occurrences: 8, per100Moves: 0.8, avgWinPctLoss: 30 };
}

function period(): PeriodStats {
  return {
    start: "2026-10-20T00:00:00.000Z",
    end: "2026-11-19T00:00:00.000Z",
    games: 30,
    moves: 1000,
    mistakesPer100Moves: 4,
    settings: SETTINGS,
    stats: PATTERN_IDS.map(stat),
  };
}

function choice(patternId: string): FocusChoice {
  return {
    patternId,
    exampleGameIds: [],
    baseline: stat(patternId),
    target: 0.6,
    since: "2026-11-19T00:00:00.000Z",
    blindSpots: [],
    reason: {
      kind: "new",
      previousRank: null,
      score: 10,
      recentCost: 8,
      naiveCostThisPeriod: 9,
      rate: 0.8,
      severity: 30,
      chronicity: 0.7,
      weeksRecurred: 3,
      weeksCounted: 5,
      weeks: [true, false, true, true, null, false],
    },
    examples: [],
  };
}

function draft(focus: string[], revision = 0): ReportDraft {
  return {
    player: "invented-player",
    track: { platform: "chesscom", username: "invented-player", timeClass: "blitz" },
    kind: "first",
    revision,
    periodStart: "2026-10-20T00:00:00.000Z",
    periodEnd: "2026-11-19T00:00:00.000Z",
    rating: 1300,
    band: "club",
    bandSource: "ratings",
    settings: SETTINGS,
    gamesFound: 30,
    gamesAnalyzed: 30,
    gameIds: [],
    coverage: { sampled: 30, analysed: 30, total: 30, complete: revision > 0, sampleOnly: false },
    current: period(),
    comparison: null,
    weeks: Array.from({ length: 6 }, period),
    trends: [],
    priorities: [],
    focus: focus.map(choice),
    progress: [],
    retired: [],
    notes: [],
  };
}

function good(ids: string[], tag = "model") {
  return JSON.stringify({
    summary: `Over {games} games, {mistakeRate} mistakes per hundred moves (${tag}).`,
    focus: ids.map((patternId) => ({
      patternId,
      title: `${tag} title ${patternId}`,
      why: `In {gamesAffected} of your {games} games (${tag}).`,
      drill: `One ${tag} drill.`,
    })),
  });
}

/** A provider that answers from a queue (an Error is thrown) and records every request. */
function stub(answers: (string | Error)[]): CoachProvider & { requests: CompleteRequest[] } {
  const requests: CompleteRequest[] = [];
  return {
    name: "anthropic",
    model: "test-model",
    requests,
    async complete(req) {
      requests.push(req);
      const next = answers.shift();
      if (next === undefined) throw new Error("no more answers");
      if (next instanceof Error) throw next;
      return { text: next, usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0 } };
    },
  };
}

describe("writeReport", () => {
  it("uses template wording with no provider: source template, calls 0, no-key", async () => {
    const d = draft(["hung-piece", "missed-tactic"]);
    const r = await writeReport(d);
    expect(r.wording).toEqual({ source: "template", wordedFor: [], calls: 0 });
    expect(r.notes).toEqual(["no-key"]);
    expect(r.summary).toBe(templateWording(d).summary);
    expect(r.focus.map((f) => f.title)).toEqual(templateWording(d).focus.map((f) => f.title));
    expect(() => WeeklyReport.parse(r)).not.toThrow();
  });

  it("words the report with one call when the answer passes", async () => {
    const d = draft(["hung-piece", "missed-tactic"]);
    const p = stub([good(["hung-piece", "missed-tactic"])]);
    const r = await writeReport(d, p);
    expect(p.requests).toHaveLength(1);
    const req = p.requests[0]!;
    expect(req.system).toBe(buildPrompt(d).system);
    expect(req.user).toBe(buildPrompt(d).user);
    expect(req.schema).toBe(WORDING_SCHEMA);
    expect(req.choice).toMatchObject({ model: "test-model", effort: "medium", maxOutputTokens: 4000 });
    expect(r.wording).toEqual({
      source: "model",
      provider: "anthropic",
      model: "test-model",
      wordedFor: ["hung-piece", "missed-tactic"],
      calls: 1,
    });
    expect(r.focus[1]!.title).toBe("model title missed-tactic");
    expect(r.notes).toEqual([]);
    expect(() => WeeklyReport.parse(r)).not.toThrow();
  });

  it("repairs once with the errors attached, then succeeds", async () => {
    const d = draft(["hung-piece"]);
    const bad = JSON.stringify({ summary: "Fine.", focus: [{ patternId: "hung-piece", title: "T", why: "In 9 of 31 games.", drill: "D" }] });
    const p = stub([bad, good(["hung-piece"], "fixed")]);
    const r = await writeReport(d, p);
    expect(p.requests).toHaveLength(2);
    expect(p.requests[1]!.system).toBe(p.requests[0]!.system);
    expect(p.requests[1]!.user).toContain(bad);
    expect(p.requests[1]!.user).toContain("Write this count with its token");
    expect(r.wording).toMatchObject({ source: "model", calls: 2 });
    expect(r.focus[0]!.title).toBe("fixed title hung-piece");
  });

  it("uses the repair once, then falls back to the template", async () => {
    const d = draft(["hung-piece"]);
    const p = stub(["not json", "still not json", good(["hung-piece"])]);
    const r = await writeReport(d, p);
    expect(p.requests).toHaveLength(2);
    expect(r.wording).toEqual({ source: "template", wordedFor: [], calls: 2 });
    expect(r.notes).toEqual(["model-failed"]);
    expect(r.focus[0]!.title).toBe(templateWording(d).focus[0]!.title);
  });

  it("does not repair after a transport error", async () => {
    const d = draft(["hung-piece"]);
    const p = stub([new HttpError("HTTP 400", 400), good(["hung-piece"])]);
    const r = await writeReport(d, p);
    expect(p.requests).toHaveLength(1);
    expect(r.wording).toEqual({ source: "template", wordedFor: [], calls: 1 });
    expect(r.notes).toEqual(["model-failed"]);
  });

  it("passes a 401 to onModelError and still returns template wording", async () => {
    const d = draft(["hung-piece"]);
    const messages: string[] = [];
    const p = stub([new HttpError("anthropic answered 401: invalid x-api-key", 401)]);
    const r = await writeReport(d, p, undefined, { onModelError: (m) => messages.push(m) });
    expect(messages).toEqual(["anthropic answered 401: invalid x-api-key"]);
    expect(r.wording).toEqual({ source: "template", wordedFor: [], calls: 1 });
    expect(r.notes).toEqual(["model-failed"]);
    expect(r.focus[0]!.title).toBe(templateWording(d).focus[0]!.title);
  });

  it("treats a truncated reply as a provider failure", async () => {
    const messages: string[] = [];
    const p = stub([new ProviderResponseError("truncated", "the reply was cut off at the token limit")]);
    const r = await writeReport(draft(["hung-piece"]), p, undefined, { onModelError: (m) => messages.push(m) });
    expect(messages).toEqual(["the reply was cut off at the token limit"]);
    expect(r.notes).toEqual(["model-failed"]);
  });

  it("lets any other error from the provider propagate", async () => {
    const p = stub([new TypeError("cannot read properties of undefined")]);
    await expect(writeReport(draft(["hung-piece"]), p)).rejects.toThrow(TypeError);
  });

  it("reports two failed validations with the repair attempt's error", async () => {
    const messages: string[] = [];
    const p = stub(["not json", "[]"]);
    await writeReport(draft(["hung-piece"]), p, undefined, { onModelError: (m) => messages.push(m) });
    expect(messages).toEqual([
      "the reply failed validation twice: the answer must be a JSON object with summary and focus",
    ]);
  });

  it("makes no call for a few-games draft", async () => {
    const d = { ...draft([]), notes: ["few-games" as const] };
    const p = stub([good([])]);
    const r = await writeReport(d, p);
    expect(p.requests).toHaveLength(0);
    expect(r.wording).toEqual({ source: "template", wordedFor: [], calls: 0 });
    expect(r.notes).toEqual(["few-games"]);
  });

  it("makes no call when the focus patterns are unchanged, keeping wording and calls", async () => {
    const first = await writeReport(draft(["hung-piece", "missed-tactic"]), stub([good(["hung-piece", "missed-tactic"])]));
    const p = stub([good(["hung-piece", "missed-tactic"], "again")]);
    const r = await writeReport(draft(["hung-piece", "missed-tactic"], 1), p, first);
    expect(p.requests).toHaveLength(0);
    expect(r.revision).toBe(1);
    expect(r.summary).toBe(first.summary);
    expect(r.focus.map((f) => f.title)).toEqual(first.focus.map((f) => f.title));
    expect(r.wording).toEqual(first.wording);
  });

  it("words one changed pattern with one call, only set to it, and accumulates calls", async () => {
    const first = await writeReport(draft(["hung-piece", "missed-tactic"]), stub([good(["hung-piece", "missed-tactic"])]));
    const next = draft(["hung-piece", "thrown-win"], 1);
    const p = stub([good(["thrown-win"], "reword")]);
    const r = await writeReport(next, p, first);
    expect(p.requests).toHaveLength(1);
    expect(p.requests[0]!.user).toBe(buildPrompt(next, ["thrown-win"]).user);
    expect(p.requests[0]!.system).toBe(buildPrompt(next).system);
    expect(r.focus.map((f) => f.title)).toEqual(["model title hung-piece", "reword title thrown-win"]);
    expect(r.summary).toContain("(reword)");
    expect(r.wording).toMatchObject({ source: "model", wordedFor: ["hung-piece", "thrown-win"], calls: 2 });
    expect(r.notes).toEqual([]);
  });

  it("gives the new item template text when the reword fails, with no repair", async () => {
    const first = await writeReport(draft(["hung-piece", "missed-tactic"]), stub(["bad", good(["hung-piece", "missed-tactic"])]));
    expect(first.wording.calls).toBe(2);
    const next = draft(["hung-piece", "thrown-win"], 1);
    const p = stub(["bad", good(["thrown-win"])]);
    const r = await writeReport(next, p, first);
    expect(p.requests).toHaveLength(1);
    expect(r.focus[0]!.title).toBe("model title hung-piece");
    expect(r.focus[1]!.title).toBe(templateWording(next).focus[1]!.title);
    expect(r.wording).toMatchObject({ source: "model", wordedFor: ["hung-piece"], calls: 3 });
    expect(r.notes).toEqual(["model-failed"]);
    expect(() => WeeklyReport.parse(r)).not.toThrow();
  });

  it("makes no call when an item is only dropped, keeping the other item's text", async () => {
    const first = await writeReport(draft(["hung-piece", "missed-tactic"]), stub([good(["hung-piece", "missed-tactic"])]));
    const next = draft(["missed-tactic"], 1);
    const p = stub([good(["missed-tactic"], "reword")]);
    const r = await writeReport(next, p, first);
    expect(p.requests).toHaveLength(0);
    expect(r.focus.map((f) => f.title)).toEqual(["model title missed-tactic"]);
    expect(r.summary).toBe(templateWording(next).summary);
    expect(r.wording).toMatchObject({ source: "model", wordedFor: ["missed-tactic"], calls: 1 });
    expect(r.notes).toEqual([]);
  });

  it("never goes past three calls for a period", async () => {
    const first = await writeReport(draft(["hung-piece"]), stub([good(["hung-piece"])]));
    const capped = { ...first, wording: { ...first.wording, calls: 3 } };
    const p = stub([good(["thrown-win"])]);
    const r = await writeReport(draft(["thrown-win"], 1), p, capped);
    expect(p.requests).toHaveLength(0);
    expect(r.wording.calls).toBe(3);
    expect(r.focus[0]!.title).toBe(templateWording(draft(["thrown-win"])).focus[0]!.title);
  });

  it("keeps kept items' text and templates new ones with no provider on a later revision", async () => {
    const first = await writeReport(draft(["hung-piece"]), stub([good(["hung-piece"])]));
    const r = await writeReport(draft(["hung-piece", "thrown-win"], 1), undefined, first);
    expect(r.focus[0]!.title).toBe("model title hung-piece");
    expect(r.focus[1]!.title).toBe(templateWording(draft(["thrown-win"])).focus[0]!.title);
    expect(r.wording).toMatchObject({ source: "model", wordedFor: ["hung-piece"], calls: 1 });
    expect(r.notes).toEqual(["no-key"]);
  });
});

/** A legacy example (no story) whose only move is Nf3, on an empty board. */
function ex(patternId: string, gameId: string, ply: number, winPctLoss = 50): FocusExample {
  return { patternId, gameId, ply, winPctLoss, fen: "8/8/8/8/8/8/8/8 w - - 0 1", played: "Nf3" };
}

function spot(id: string): BlindSpot {
  return { id, basis: "line", count: 5, games: 4, of: 8, baselineCount: 6, baselineOf: 40, examples: [] };
}

/** A draft whose items carry the given examples and blind spots. */
function drafted(
  items: { id: string; examples?: FocusExample[]; spots?: string[] }[],
  revision = 0,
): ReportDraft {
  const d = draft(items.map((i) => i.id), revision);
  d.focus = d.focus.map((f, n) => ({
    ...f,
    examples: items[n]!.examples ?? [],
    blindSpots: (items[n]!.spots ?? []).map(spot),
  }));
  return d;
}

/** A model answer with one step per blind spot of each asked item. */
function stepped(d: ReportDraft, ids: string[], tag = "model"): string {
  return JSON.stringify({
    summary: `Over {games} games, {mistakeRate} mistakes per hundred moves (${tag}).`,
    focus: ids.map((patternId) => ({
      patternId,
      title: `${tag} title ${patternId}`,
      why: `In {gamesAffected} of your {games} games (${tag}).`,
      drill: `One ${tag} drill.`,
      steps: d.focus.find((f) => f.patternId === patternId)!.blindSpots.map((b) => ({ blindSpot: b.id, text: `${tag} step ${b.id}.` })),
    })),
  });
}

/** A provider that answers each request with a passing answer for the items it asks for, or always with `bad`. */
function auto(d: () => ReportDraft, bad?: string): CoachProvider & { requests: CompleteRequest[] } {
  const requests: CompleteRequest[] = [];
  return {
    name: "anthropic",
    model: "test-model",
    requests,
    async complete(req) {
      requests.push(req);
      const ids = /in this order: ([^.]*)\./.exec(req.user)?.[1]?.split(", ") ?? [];
      const text = bad ?? stepped(d(), ids, `call${requests.length}`);
      return { text, usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0 } };
    },
  };
}

describe("writeReport with blind spots and examples", () => {
  const A = ex("hung-piece", "g1", 10);
  const B = ex("hung-piece", "g2", 20);
  const C = ex("hung-piece", "g3", 30);

  it("takes the model's steps, one per blind spot", async () => {
    const d = drafted([{ id: "hung-piece", examples: [A], spots: ["undefended", "lost-queen"] }]);
    const r = await writeReport(d, stub([stepped(d, ["hung-piece"])]));
    expect(r.focus[0]!.steps).toEqual([
      { blindSpot: "undefended", text: "model step undefended." },
      { blindSpot: "lost-queen", text: "model step lost-queen." },
    ]);
    expect(r.wording.calls).toBe(1);
    expect(() => WeeklyReport.parse(r)).not.toThrow();
  });

  it("gives template steps with template text", async () => {
    const d = drafted([{ id: "hung-piece", examples: [A], spots: ["moved-piece-lost"] }]);
    const r = await writeReport(d);
    expect(r.focus[0]!.steps).toEqual([{ blindSpot: "moved-piece-lost", text: TEMPLATE_STEPS["moved-piece-lost"] }]);
  });

  it("repairs steps out of order and a move outside the examples, saying which and what to do", async () => {
    const d = drafted([{ id: "hung-piece", examples: [A], spots: ["undefended", "lost-queen"] }]);
    const bad = JSON.parse(stepped(d, ["hung-piece"]));
    bad.focus[0].steps.reverse();
    bad.focus[0].why = "Qh5 was the loose move.";
    const p = stub([JSON.stringify(bad), stepped(d, ["hung-piece"], "fixed")]);
    const r = await writeReport(d, p);
    expect(p.requests).toHaveLength(2);
    const hint = p.requests[1]!.user;
    expect(hint).toContain("steps must hold exactly one step per blind spot, in this order: [undefended, lost-queen]; got [lost-queen, undefended]. Write one step for each, in that order.");
    expect(hint).toContain("why names Qh5: this move is not in the examples shown (the moves shown: Nf3). Name only those moves, or say it in words without a move.");
    expect(r.focus[0]!.title).toBe("fixed title hung-piece");
  });

  it("keeps kept text with its examples in their order, refreshed from the draft, and makes no call", async () => {
    const first = await writeReport(drafted([{ id: "hung-piece", examples: [A, B] }]), stub([good(["hung-piece"])]));
    const fresh = [ex("hung-piece", "g2", 20, 71), ex("hung-piece", "g1", 10, 64)];
    const p = stub([]);
    const r = await writeReport(drafted([{ id: "hung-piece", examples: fresh }], 1), p, first);
    expect(p.requests).toHaveLength(0);
    expect(r.focus[0]!.title).toBe("model title hung-piece");
    expect(r.focus[0]!.examples).toEqual([fresh[1], fresh[0]]);
    expect(r.wording).toEqual(first.wording);
    expect(r.summary).toBe(first.summary);
  });

  it("keeps text and examples when the draft shows the same examples", async () => {
    const first = await writeReport(drafted([{ id: "hung-piece", examples: [A, B] }]), stub([good(["hung-piece"])]));
    const refreshed = [ex("hung-piece", "g1", 10, 55), ex("hung-piece", "g2", 20, 45)];
    const p = stub([]);
    const r = await writeReport(drafted([{ id: "hung-piece", examples: refreshed }], 1), p, first);
    expect(p.requests).toHaveLength(0);
    expect(r.focus[0]!.examples).toEqual(refreshed);
  });

  it("rewords an item whose kept example is gone, in one call for every changed item", async () => {
    const first = await writeReport(
      drafted([{ id: "hung-piece", examples: [A, B] }, { id: "missed-tactic", examples: [ex("missed-tactic", "m1", 4)] }]),
      stub([good(["hung-piece", "missed-tactic"])]),
    );
    const next = drafted([{ id: "hung-piece", examples: [A, C] }, { id: "thrown-win" }], 1);
    const p = auto(() => next);
    const r = await writeReport(next, p, first);
    expect(p.requests).toHaveLength(1);
    expect(p.requests[0]!.user).toBe(buildPrompt(next, ["hung-piece", "thrown-win"]).user);
    expect(r.focus.map((f) => f.title)).toEqual(["call1 title hung-piece", "call1 title thrown-win"]);
    expect(r.focus[0]!.examples).toEqual([A, C]);
    expect(r.summary).toContain("(call1)");
    expect(r.wording).toMatchObject({ source: "model", wordedFor: ["hung-piece", "thrown-win"], calls: 2 });
  });

  it("gives an item whose kept example is gone template text when no call is left", async () => {
    const first = await writeReport(
      drafted([{ id: "hung-piece", examples: [A, B] }, { id: "missed-tactic", examples: [ex("missed-tactic", "m1", 4)] }]),
      stub([good(["hung-piece", "missed-tactic"])]),
    );
    const capped = { ...first, wording: { ...first.wording, calls: 3 } };
    const next = drafted([{ id: "hung-piece", examples: [C] }, { id: "missed-tactic", examples: [ex("missed-tactic", "m1", 4)] }], 1);
    const p = auto(() => next);
    const r = await writeReport(next, p, capped);
    expect(p.requests).toHaveLength(0);
    expect(r.focus[0]!.title).toBe(templateWording(next).focus[0]!.title);
    expect(r.focus[0]!.examples).toEqual([C]);
    expect(r.focus[1]!.title).toBe("model title missed-tactic");
    expect(r.summary).toBe(first.summary);
    expect(r.wording).toMatchObject({ source: "model", wordedFor: ["missed-tactic"], calls: 3 });
    expect(() => WeeklyReport.parse(r)).not.toThrow();
  });

  it("gives template text when the reword for a gone example fails, keeping the summary", async () => {
    const first = await writeReport(drafted([{ id: "hung-piece", examples: [A] }]), stub([good(["hung-piece"])]));
    const next = drafted([{ id: "hung-piece", examples: [C] }], 1);
    const p = stub(["not json"]);
    const r = await writeReport(next, p, first);
    expect(p.requests).toHaveLength(1);
    expect(r.focus[0]!.title).toBe(templateWording(next).focus[0]!.title);
    expect(r.summary).toBe(first.summary);
    expect(r.notes).toEqual(["model-failed"]);
    expect(r.wording).toMatchObject({ wordedFor: [], calls: 2 });
  });

  it("keeps steps per blind spot: kept when still selected, template when new, gone when dropped, with calls unchanged", async () => {
    const d0 = drafted([{ id: "hung-piece", examples: [A], spots: ["undefended", "lost-queen"] }]);
    const first = await writeReport(d0, stub([stepped(d0, ["hung-piece"])]));
    const next = drafted([{ id: "hung-piece", examples: [A], spots: ["lost-queen", "answer-check"] }], 1);
    const p = stub([]);
    const r = await writeReport(next, p, first);
    expect(p.requests).toHaveLength(0);
    expect(r.focus[0]!.title).toBe("model title hung-piece");
    expect(r.focus[0]!.steps).toEqual([
      { blindSpot: "lost-queen", text: "model step lost-queen." },
      { blindSpot: "answer-check", text: TEMPLATE_STEPS["answer-check"] },
    ]);
    expect(r.wording.calls).toBe(first.wording.calls);
    expect(() => WeeklyReport.parse(r)).not.toThrow();
  });

  it("gives a stored item without steps template steps for its blind spots", async () => {
    const first = await writeReport(drafted([{ id: "hung-piece", examples: [A] }]), stub([good(["hung-piece"])]));
    const old = WeeklyReport.parse({ ...first, focus: first.focus.map(({ steps: _, ...f }) => f) });
    const r = await writeReport(drafted([{ id: "hung-piece", examples: [A], spots: ["undefended"] }], 1), stub([]), old);
    expect(r.focus[0]!.steps).toEqual([{ blindSpot: "undefended", text: TEMPLATE_STEPS.undefended }]);
  });

  it.each([
    ["answers that pass", undefined],
    ["answers that never pass", "not json"],
  ])("never makes more than three calls on any path, with %s", async (_, bad) => {
    const examples = [[A, B], [A, C], [B], [C], [A]];
    const sets = [["hung-piece"], ["hung-piece", "missed-tactic"], ["hung-piece", "thrown-win"], ["time-trouble"], ["hung-piece"]];
    let current = drafted([{ id: "hung-piece", examples: examples[0] }]);
    const p = auto(() => current, bad);
    let report = await writeReport(current, p);
    for (let rev = 1; rev < examples.length; rev++) {
      current = drafted(sets[rev]!.map((id) => ({ id, examples: id === "hung-piece" ? examples[rev] : [], spots: rev % 2 ? ["undefended"] : [] })), rev);
      report = await writeReport(current, p, report);
      expect(report.wording.calls).toBe(p.requests.length);
      expect(report.wording.calls).toBeLessThanOrEqual(3);
      expect(() => WeeklyReport.parse(report)).not.toThrow();
    }
    expect(p.requests.length).toBe(3);
  });
});

/** A move for a story; only the fields the move rule reads matter here. */
function mv(san: string, uci: string, piece: MoveDetail["piece"], color: MoveDetail["color"]): MoveDetail {
  return { san, uci, from: uci.slice(0, 2), to: uci.slice(2, 4), piece, color, check: san.includes("+"), mate: false, fenAfter: `after-${uci}` };
}

/** F1 as revision 0 saw it (better Re1, covering e4) and after a deeper check changed the better line to Qe2. */
function f1(better: MoveDetail[], reason: ExampleStory["betterReason"]): FocusExample {
  const story: ExampleStory = {
    played: mv("Qd2", "d1d2", "queen", "white"),
    punish: [mv("Ne4+", "f6e4", "knight", "black"), mv("Ke1", "f2e1", "king", "white"), mv("Nxd2", "e4d2", "knight", "black")],
    replyFound: true,
    better,
    targets: [],
    gain: -6,
    ...(reason ? { betterReason: reason } : {}),
    winPctBefore: 96,
    winPctAfter: 28,
    depth: 18,
  };
  return { patternId: "allowed-tactic", gameId: "g-f1", ply: 21, winPctLoss: 68, fen: "r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2Q3R w - - 0 1", played: "Qd2", story };
}

describe("writeReport when a kept example's story changes", () => {
  const before = f1([mv("Re1", "h1e1", "rook", "white")], { kind: "covers-square", square: "e4" });
  const after = f1([mv("Qe2", "d1e2", "queen", "white")], { kind: "holds" });
  const answer = (d: ReportDraft, why: string) =>
    JSON.stringify({ ...JSON.parse(stepped(d, ["allowed-tactic"])), focus: JSON.parse(stepped(d, ["allowed-tactic"])).focus.map((f: object) => ({ ...f, why })) });

  async function revisionZero() {
    const d0 = drafted([{ id: "allowed-tactic", examples: [before] }]);
    const first = await writeReport(d0, stub([answer(d0, "Re1 would have kept the queen safe.")]));
    expect(first.wording).toMatchObject({ source: "model", calls: 1 });
    return first;
  }

  it("keeps the text while every move it names is still in the refreshed story", async () => {
    const d0 = drafted([{ id: "allowed-tactic", examples: [before] }]);
    const first = await writeReport(d0, stub([answer(d0, "Qd2 walked into Ne4+.")]));
    const next = drafted([{ id: "allowed-tactic", examples: [after] }], 1);
    const p = stub([]);
    const r = await writeReport(next, p, first);
    expect(p.requests).toHaveLength(0);
    expect(r.focus[0]!.why).toBe("Qd2 walked into Ne4+.");
    expect(r.focus[0]!.examples).toEqual([after]);
  });

  it("rewords the item when its kept text names a move the refreshed story no longer shows", async () => {
    const first = await revisionZero();
    const next = drafted([{ id: "allowed-tactic", examples: [after] }], 1);
    const p = auto(() => next);
    const r = await writeReport(next, p, first);
    expect(p.requests).toHaveLength(1);
    expect(p.requests[0]!.user).toBe(buildPrompt(next, ["allowed-tactic"]).user);
    expect(p.requests[0]!.user).toContain("Qe2 (your queen d1-e2)");
    expect(r.focus[0]!.title).toBe("call1 title allowed-tactic");
    expect(r.focus[0]!.why).not.toContain("Re1");
    expect(r.focus[0]!.examples).toEqual([after]);
    expect(r.wording).toMatchObject({ source: "model", wordedFor: ["allowed-tactic"], calls: 2 });
  });

  it("gives that item template text when no call is left", async () => {
    const first = await revisionZero();
    const capped = { ...first, wording: { ...first.wording, calls: 3 } };
    const next = drafted([{ id: "allowed-tactic", examples: [after] }], 1);
    const p = auto(() => next);
    const r = await writeReport(next, p, capped);
    expect(p.requests).toHaveLength(0);
    expect(r.focus[0]!.why).toBe(templateWording(next).focus[0]!.why);
    expect(r.focus[0]!.title).toBe(templateWording(next).focus[0]!.title);
    expect(r.wording.calls).toBe(3);
    expect(r.wording.wordedFor).toEqual([]);
  });
});
