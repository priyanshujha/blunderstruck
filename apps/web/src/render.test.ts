import { PATTERN_IDS, type FocusItem, type PatternStat, type PeriodStats, WeeklyReport } from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import { formatReport } from "../../cli/src/report-format";
import { esc, renderPage } from "./render";

// Invented players and games only.
const SETTINGS = { analysisVersion: 2, patternsVersion: 1, engine: { name: "Stub 1", depth: 12 } };
const FEN = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";
const XSS = `<script>alert("x")</script>`;

const stat = (patternId: string, games: number, moves: number, per100: number): PatternStat => {
  const occurrences = Math.round((per100 * moves) / 100);
  return { patternId, games, moves, gamesAffected: Math.min(games, occurrences), occurrences, per100Moves: per100, avgWinPctLoss: 30 };
};

function period(end: string, games: number, hung = 0.2): PeriodStats {
  const moves = games * 35;
  return {
    start: new Date(Date.parse(end) - 7 * 86_400_000).toISOString(),
    end,
    games,
    moves,
    mistakesPer100Moves: 6.5,
    settings: SETTINGS,
    stats: PATTERN_IDS.map((id) => stat(id, games, moves, id === "hung-piece" ? hung : 0.2)),
  };
}

const END = "2026-11-19T00:00:00.000Z";
const weekEnd = (i: number): string => new Date(Date.parse(END) - i * 7 * 86_400_000).toISOString();

const focusItem = (over: Partial<FocusItem> = {}): FocusItem => ({
  patternId: "hung-piece",
  title: "Look before you let go of a piece",
  why: "You left a piece hanging in {gamesAffected} of {games} games, {rate} per 100 moves.",
  drill: "Before each move, ask what the piece you just moved no longer protects.",
  exampleGameIds: ["lichess:g1"],
  baseline: stat("hung-piece", 30, 1050, 3.0),
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
  examples: [{ patternId: "hung-piece", gameId: "lichess:g1", ply: 23, winPctLoss: 32.4, fen: FEN, played: "Qxf7", best: "Nf3" }],
  ...over,
});

function report(over: Record<string, unknown> = {}): WeeklyReport {
  return WeeklyReport.parse({
    player: "quiet_rook_test",
    track: { platform: "lichess", username: "quiet_rook_test", timeClass: "rapid" },
    kind: "weekly",
    revision: 1,
    periodStart: "2026-11-12T00:00:00.000Z",
    periodEnd: END,
    rating: 1420,
    band: "club",
    bandSource: "ratings",
    settings: SETTINGS,
    gamesFound: 31,
    gamesAnalyzed: 31,
    gameIds: ["lichess:g1"],
    coverage: { sampled: 31, analysed: 31, total: 31, complete: true, sampleOnly: false },
    current: period(END, 31, 2.1),
    comparison: null,
    weeks: [0, 1, 2, 3, 4, 5].map((i) => period(weekEnd(i), 6)),
    trends: [],
    priorities: [],
    focus: [focusItem()],
    progress: [],
    retired: [],
    summary: "{games} games, {mistakeRate} mistakes per 100 moves. {focusCount} thing to work on.",
    wording: { source: "model", provider: "anthropic", model: "stub-model", wordedFor: ["hung-piece"], calls: 1 },
    notes: [],
    ...over,
  });
}

const noScript = (html: string): void => {
  expect(html).not.toMatch(/<script/i);
};

describe("esc", () => {
  it("escapes markup and both quote kinds", () => {
    expect(esc(`<a href="x" title='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });
});

describe("renderPage", () => {
  it("shows the same numbers and wording as the text report", () => {
    const html = renderPage(report(), { pending: 0, history: [] });
    expect(html).toContain("Weekly report for quiet_rook_test (lichess, rapid)");
    expect(html).toContain("Rating band: club, from your median rating of 1420 in these games");
    expect(html).toContain("Games: 31 found, all analysed");
    expect(html).toContain("31 games, 6.50 mistakes per 100 moves. 1 thing to work on.");
    expect(html).toContain("You left a piece hanging in");
    expect(html).toContain("2.10 per 100 moves.");
    expect(html).toContain("It came up in 5 of your last 6 weeks. Kept from your last report (since 2026-10-29).");
    expect(html).toContain("Now 2.10 per 100 moves; started at 3.00; target 2.25.");
    expect(html).toContain("better was Nf3 (-32.4 win%)");
    expect(html).not.toContain('http-equiv="refresh"');
    noScript(html);
  });

  it("escapes a username, an opening name, evidence and model-written wording", () => {
    const r = report({
      player: XSS,
      track: { platform: "lichess", username: XSS, timeClass: "rapid" },
      focus: [
        focusItem({
          title: `${XSS} {rate}`,
          why: `<img src=x onerror="alert(1)">`,
          drill: `"><script>bad()</script>`,
          examples: [
            { patternId: "hung-piece", gameId: "lichess:g1", ply: 23, winPctLoss: 32.4, fen: FEN, played: "Qxf7", evidence: XSS },
          ],
        }),
      ],
      summary: `${XSS} {games}`,
    });
    const games = new Map([
      ["lichess:g1", { platform: "lichess" as const, url: `https://lichess.org/abc"onmouseover="x`, opening: { eco: "C20", name: XSS } }],
    ]);
    const html = renderPage(r, { pending: 0, history: [] }, { games });
    noScript(html);
    expect(html).not.toContain("<img");
    expect(html).not.toMatch(/"onmouseover=/);
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; 2.10");
    expect(html).toContain(`C20 ${esc(XSS)}`);
  });

  it("does not link to a game whose URL is not a web link", () => {
    const games = new Map([["lichess:g1", { platform: "chesscom" as const, url: "javascript:alert(1)" }]]);
    const html = renderPage(report(), { pending: 0, history: [] }, { games });
    expect(html).not.toContain("javascript:");
  });

  it("asks for the report command when there is no report", () => {
    const html = renderPage(undefined, { pending: 0, history: [] }, {
      track: { platform: "lichess", username: XSS, timeClass: "blitz" },
      reportCommand: `pnpm cli report lichess '${XSS}'`,
    });
    expect(html).toContain("No report yet");
    expect(html).toContain(esc(`pnpm cli report lichess '${XSS}'`));
    noScript(html);
  });

  it("shows a banner and reloads while provisional", () => {
    const r = report({ coverage: { sampled: 150, analysed: 150, total: 400, complete: false, sampleOnly: false } });
    const html = renderPage(r, { pending: 250, history: [] });
    expect(html).toContain("Based on 150 of 400 games; 250 still being analysed.");
    expect(html).toContain('<meta http-equiv="refresh" content="30">');
    expect(renderPage(r, { pending: 250, history: [] }, { latest: false })).not.toContain('http-equiv="refresh"');
  });

  it("does not reload a sample-only report", () => {
    const r = report({ coverage: { sampled: 150, analysed: 150, total: 400, complete: false, sampleOnly: true } });
    const html = renderPage(r, { pending: 250, history: [] });
    expect(html).toContain("Based on a sample of 150 of 400 games; run report again to analyse the rest.");
    expect(html).not.toContain('http-equiv="refresh"');
  });

  it("lists every stored week for the focus patterns", () => {
    const history = Array.from({ length: 10 }, (_, i) => period(weekEnd(9 - i), 5, 1 + i / 10));
    const html = renderPage(report(), { pending: 0, history });
    expect(html).toContain("Left a piece hanging /100");
    expect(html).toContain(`<td>${weekEnd(9).slice(0, 10)}</td>`);
    expect(html).toContain("<td>1.90</td>");
    expect(html.indexOf(weekEnd(9).slice(0, 10))).toBeLessThan(html.indexOf(weekEnd(0).slice(0, 10) + "</td>"));
  });

  it("links to the other reports", () => {
    const older = "2026-11-12T00:00:00.000Z";
    const html = renderPage(report(), { pending: 0, history: [] }, {
      reports: [
        { periodEnd: older, kind: "first" },
        { periodEnd: END, kind: "weekly" },
      ],
    });
    expect(html).toContain(`<a href="/report/${encodeURIComponent(older)}">First report ending 2026-11-12</a>`);
    expect(html).toContain("Week ending 2026-11-19 (latest) (this one)");
  });

  it("falls back to a neutral sentence when stored wording no longer renders", () => {
    const r = report({ summary: "{old} games", focus: [focusItem({ title: "Fix {gone}", drill: "Drill {x" })] });
    const html = renderPage(r, { pending: 0, history: [] });
    expect(html).toContain("Wording for this item could not be shown.");
    expect(html).toContain("The summary could not be shown.");
    expect(html).toContain("Some stored wording could not be shown, so a plain sentence stands in its place.");
    expect(html.replace(/<style>[\s\S]*?<\/style>/, "")).not.toMatch(/[{}]/);
  });

  it("says no data, not zero, for a focus pattern missing from this period", () => {
    const current = { ...period(END, 31), stats: period(END, 31).stats.filter((s) => s.patternId !== "hung-piece") };
    const html = renderPage(report({ current }), { pending: 0, history: [] });
    expect(html).toContain("Now: no data this period; started at 3.00 per 100 moves; target 2.25.");
    expect(html).not.toContain("Now 0.00");
    // The why template quotes this period's rate, so it is not filled with a made-up zero.
    expect(html).toContain("Wording for this item could not be shown.");
  });
});

/** Visible text of a page, entities decoded, whitespace collapsed. */
function pageText(html: string): { text: string; cells: Set<string> } {
  const decode = (t: string): string =>
    t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const body = html.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<title>[\s\S]*?<\/title>/, "");
  const cells = new Set([...body.matchAll(/<t[dh][^>]*>([^<]*)<\/t[dh]>/g)].map((m) => decode(m[1]!).trim()));
  const text = decode(body.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  return { text, cells };
}

describe("parity with the text report", () => {
  it("shows every sentence and table cell the CLI prints", () => {
    const r = report({
      notes: ["no-key", "settings-changed"],
      coverage: { sampled: 20, analysed: 20, total: 31, complete: false, sampleOnly: false },
      gamesAnalyzed: 20,
      comparison: period("2026-11-12T00:00:00.000Z", 120, 3.0),
      trends: PATTERN_IDS.map((id) => ({
        patternId: id,
        previous: stat(id, 120, 4200, 3.0),
        current: stat(id, 31, 1085, 2.1),
        verdict: id === "hung-piece" ? "improved" : "flat",
        pValue: id === "hung-piece" ? 0.04 : null,
      })),
      progress: [
        { patternId: "hung-piece", previous: stat("hung-piece", 120, 4200, 3.0), current: stat("hung-piece", 31, 1085, 2.1), verdict: "improved", pValue: 0.04 },
      ],
      retired: [
        { patternId: "thrown-win", why: "graduated", since: "2026-09-24T00:00:00.000Z", baseline: stat("thrown-win", 28, 980, 1.5), current: stat("thrown-win", 31, 1085, 0.9) },
      ],
      focus: [
        focusItem({
          examples: [
            { patternId: "hung-piece", gameId: "lichess:g1", ply: 23, winPctLoss: 32.4, fen: FEN, played: "Qxf7", best: "Nf3", evidence: "queen on f7 taken next move", motif: "fork" },
          ],
        }),
      ],
    });
    for (const variant of [r, { ...r, focus: [], notes: ["few-games" as const] }]) {
      const cli = formatReport(variant, { all: true });
      const { text, cells } = pageText(renderPage(variant, { pending: 11, history: [] }));
      for (const raw of cli.split("\n")) {
        const line = raw.trim().replace(/^- /, "");
        if (!line) continue;
        if (/\S\s{2,}\S/.test(line)) {
          for (const cell of line.split(/\s{2,}/)) expect(cells, `cell "${cell}" of "${line}"`).toContain(cell);
        } else {
          expect(text, line).toContain(line.replace(/\s+/g, " "));
        }
      }
    }
  });
});
