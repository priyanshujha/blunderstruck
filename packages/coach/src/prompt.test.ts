import {
  BAND_RUBRIC,
  type FocusChoice,
  PATTERN_IDS,
  type PatternStat,
  type PeriodStats,
  type RatingBand,
  type ReportDraft,
  SUMMARY_TOKENS,
} from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import { buildPrompt, WORDING_SCHEMA } from "./prompt";
import { PRINTED_TOKENS, parseWording, WORDING_FOCUS_TOKENS } from "./validate";

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
    for (const t of [...WORDING_FOCUS_TOKENS, ...SUMMARY_TOKENS]) expect(system).toContain(`- {${t}}: `);
    for (const t of PRINTED_TOKENS) expect(system).not.toContain(`{${t}}`);
    expect(system.split(/\s+/).length).toBeGreaterThan(900);
  });

  it("gives a worked example that passes the checks", () => {
    const { system } = buildPrompt(draft({ username: "x", focus: [] }));
    const example = /```json\n([\s\S]*?)\n```/.exec(system)?.[1];
    expect(example).toBeDefined();
    const result = parseWording(example!, draft({ username: "x", focus: ["hung-piece", "missed-tactic"] }));
    expect(result).toMatchObject({ ok: true });
    const parsed = JSON.parse(example!) as { summary: string };
    expect(parsed.summary).not.toMatch(/\b(one|two|both|pair|couple)\b/i);
    expect(system).toMatch(/illustrative only: never reuse them/);
    expect(system).toContain("Do not restate them");
    expect(system).toContain("is written only with its token, never as a number of your own");
    expect(system).toContain("No percentages, fractions of their games or rates, in any field.");
    expect(system).toContain("Numbers that describe a position, a clock or what to practise are fine as they are");
    expect(system).toContain("The report prints the weeks, rate and target lines itself, so leave those out entirely.");
    expect(system).toContain('never write "{gamesAffected} of" or "0 of" for it');
    expect(system).not.toMatch(/no number words other than|move it into the drill|any digit that counts/);
    expect(system).toContain("weeksCounted of three or more and weeksRecurred is more than half of weeksCounted");
    expect(example).not.toMatch(/\{(weeksRecurred|weeksCounted|rate|target)\}/);
  });

  it("puts the band, reasons, targets and example positions in the user part, not the username", () => {
    const { user } = buildPrompt(draft({ username: "alpha-invented", band: "beginner", focus: ["hung-piece", "missed-tactic"] }));
    expect(user).toContain('"band": "beginner"');
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
});
