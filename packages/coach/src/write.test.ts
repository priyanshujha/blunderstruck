import {
  type FocusChoice,
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
import { templateWording } from "./templates";
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
    expect(req.choice).toMatchObject({ model: "test-model", effort: "medium", maxOutputTokens: 2000 });
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
    expect(p.requests[1]!.user).toContain("writes a number");
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
