import { createHash } from "node:crypto";
import http from "node:http";
import { readFileSync } from "node:fs";
import { templateWording } from "@blunderstruck/coach/templates";
import { type ExampleStory, type FocusItem, PATTERN_IDS, WeeklyReport } from "@blunderstruck/contracts";
import { type ReportView, reportView, storyLines } from "@blunderstruck/view";
import { describe, expect, it, vi } from "vitest";
import { formatReport } from "../../cli/src/report-format";
import { piecesOf, xy } from "./board";
import { esc } from "./html";
import { LABELS, SCRIPT, STYLE, pageSecurity, renderPage } from "./render";
import {
  END,
  PLAYER,
  type Sample,
  ended,
  example,
  focusItem,
  followed,
  fullReport,
  missed,
  other,
  partway,
  period,
  sampleReport,
  stat,
  weekEnd,
} from "./test-report";

// Invented players and games only; stories come from the real story builder.
const SETTINGS_NO_CHECK = { analysisVersion: 2, patternsVersion: 1, engine: { name: "Stub 1", depth: 12 }, checkDepth: 0 };
const XSS = `<script>alert("x")</script><!-- -->`;
const CTX = { pending: 0, history: [] };
const fallback = (r: WeeklyReport) => templateWording(r);
const view = (r: WeeklyReport, pending = 0): ReportView => reportView(r, { pending, fallback: fallback(r) });

/** Visible text of a page, entities decoded, whitespace collapsed. */
function pageText(html: string): string {
  const decode = (t: string): string =>
    t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const body = html
    .replace(/<style>[\s\S]*?<\/style>/, "")
    .replace(/<script>[\s\S]*?<\/script>/, "")
    .replace(/<title>[\s\S]*?<\/title>/, "");
  return decode(body.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").replace(/ ([,.;:)])/g, "$1");
}
const has = (html: string, sentence: string): void => {
  expect(pageText(html), sentence).toContain(sentence.replace(/\s+/g, " "));
};

/** The board's pieces as square → transform, read from the markup. */
function boardPieces(html: string, exampleId: string): Map<string, string> {
  const art = new RegExp(`<article class="ex"[^>]*id="${exampleId}"[\\s\\S]*?</article>`).exec(html)![0];
  return new Map([...art.matchAll(/<use class="pc [wb]" href="#p[a-z]"[^>]*transform="translate\(([\d.]+) ([\d.]+)\)" data-sq="([a-h][1-8])"/g)].map((m) => [m[3]!, `${m[1]} ${m[2]}`]));
}

const dataOf = (html: string, exampleId: string): { f: number; p: [string, string, Record<string, unknown>?][]; b: unknown[] } => {
  const m = new RegExp(`id="${exampleId}"[^>]*data-b="([^"]*)"`).exec(html)!;
  return JSON.parse(m[1]!.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
};

describe("security", () => {
  it("allows exactly the emitted stylesheet and script by hash", async () => {
    const { report, games } = await fullReport();
    const html = renderPage(report, CTX, { games });
    const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]!);
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    expect(styles).toEqual([STYLE]);
    expect(scripts).toEqual([SCRIPT]);
    const hash = (s: string) => `'sha256-${createHash("sha256").update(s, "utf8").digest("base64")}'`;
    const csp = pageSecurity().csp;
    expect(csp).toBe(`default-src 'none'; style-src ${hash(styles[0]!)}; script-src ${hash(scripts[0]!)}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
    expect(csp).not.toContain("unsafe");
    // Nothing the policy would have to allow besides those two.
    expect(html).not.toMatch(/\sstyle=|\son[a-z]+=|<link|<img|<iframe|src=/i);
  });

  it("names no web address except the escaped game links", async () => {
    const { report, games } = await fullReport();
    const html = renderPage(report, CTX, { games });
    const urls = [...html.matchAll(/https?:\/\/[^"<\s]*/g)].map((m) => m[0]);
    expect(urls.length).toBe(4);
    for (const u of urls) expect(u).toMatch(/^https:\/\/lichess\.org\/fx[a-z0-9]+#1$/);
    expect(STYLE + SCRIPT).not.toMatch(/https?:|eval\(|new Function|innerHTML/);
  });

  it("keeps hostile text inside its element and attribute, the script's data included", async () => {
    const s = await partway();
    const story: ExampleStory = {
      ...s.story,
      played: { ...s.story.played, san: `Qd2</script><!--` },
      punish: s.story.punish.map((m, i) => (i === 0 ? { ...m, san: `"><img src=x>` } : m)),
    };
    const item = focusItem("allowed-tactic", [example({ ...s, story }, "allowed-tactic"), example({ ...s, fen: `"><script>bad()</script>` }, "allowed-tactic")], {
      title: XSS,
      why: `<img src=x onerror="alert(1)">`,
      drill: `"><script>bad()</script>`,
      steps: [{ blindSpot: "answer-check", text: `</script>${XSS}` }],
      blindSpots: [{ id: `answer-check`, basis: "line", count: 3, games: 3, of: 5, baselineCount: 4, baselineOf: 20, examples: [] }],
    });
    const r = sampleReport([item], { player: XSS, track: { platform: "lichess", username: XSS, timeClass: "rapid" }, summary: `${XSS} {games}` });
    const games = new Map([[s.gameId, { ...s.record, url: "javascript:alert(1)", opening: { eco: "C20", name: XSS } }]]);
    const html = renderPage(r, CTX, { games, header: '<p class="host">host</p>', reports: [{ periodEnd: XSS, kind: "weekly" }, { periodEnd: END, kind: "weekly" }] });
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).not.toMatch(/<img|<!--|-->|javascript:/);
    expect(html).not.toMatch(/="[^"]*"\s*onerror/);
    has(html, XSS);
    has(html, `${XSS}, same habit, one week on.`);
    expect(html).toContain(esc("Qd2</script><!--"));
    // The script's data parses and holds squares and flags only.
    const d = dataOf(html, "ex-1-1");
    expect(JSON.stringify(d)).not.toMatch(/[<>"']script|img/);
    // A position that is not a board shows its sentences without one.
    expect(html).toMatch(/<article class="ex" id="ex-1-2" data-fold><div>/);
  });
});

describe("boards", () => {
  it("draws the position from its FEN, from White's side", async () => {
    const { report, games } = await fullReport();
    const html = renderPage(report, CTX, { games });
    const fen = report.focus[0]!.examples[0]!.fen;
    const want = new Map(piecesOf(fen)!.map((p) => [p.square, xy(p.square, false).join(" ")]));
    expect(boardPieces(html, "ex-1-1")).toEqual(want);
    expect(want.get("a1")).toBe("0 70");
  });

  it("is flipped for Black", async () => {
    const m = await missed();
    const html = renderPage(sampleReport([focusItem("missed-tactic", [example(m, "missed-tactic")])]), CTX);
    const pieces = boardPieces(html, "ex-1-1");
    expect(pieces.get("a8")).toBe("70 70");
    expect(pieces.get("g8")).toBe("10 70");
    expect(html).toContain("seen from Black&#39;s side");
    expect(html).toMatch(/<div class="rk" aria-hidden="true"><span>1<\/span>/);
    // A missed chance has no reply to show: the move played, then the better line.
    expect(dataOf(html, "ex-1-1").p).toHaveLength(1);
  });

  const lineCase = async (s: Sample, patternId: string) => {
    const html = renderPage(sampleReport([focusItem(patternId, [example(s, patternId)])]), CTX);
    return { html, steps: dataOf(html, "ex-1-1").p, lines: storyLines(s.story, patternId) };
  };
  const ghosts = (steps: [string, string, Record<string, unknown>?][]): boolean[] => steps.map((x) => !!x[2]?.g);
  const key = (html: string): string[] => [...(/<p class="akey">([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "").matchAll(/<\/svg>([a-z ]+)<\/span>/g)].map((m) => m[1]!);

  it("draws solid only the moves the game played, as the view says", async () => {
    for (const [make, pid] of [[partway, "allowed-tactic"], [ended, "allowed-tactic"], [followed, "hung-piece"], [other, "hung-piece"]] as const) {
      const s = await make();
      const { steps, lines } = await lineCase(s, pid);
      const told = lines.filter((l) => l.tag !== "better").flatMap((l) => (l.moves.length > 0 ? l.moves.map((m) => !m.played) : l.tag === "then" ? [false] : []));
      expect(ghosts(steps)).toEqual(told);
    }
  });

  it("left the line part-way: the game's move solid, the rest as what could follow", async () => {
    const { html, steps } = await lineCase(await partway(), "allowed-tactic");
    expect(ghosts(steps)).toEqual([false, false, true, true, true]);
    expect(steps.slice(2).every((x) => x[2]?.w === "f")).toBe(true);
    expect(key(html)).toEqual(["you played", "their reply", "what could follow", "better"]);
  });

  it("the opponent played something else: the reply as what it allowed, then the game's moves", async () => {
    const { html, steps } = await lineCase(await other(), "hung-piece");
    expect(ghosts(steps)[1]).toBe(true);
    expect(steps[1]![2]?.w).toBe("a");
    expect(ghosts(steps).slice(2).every((g) => !g)).toBe(true);
    expect(key(html)).toEqual(["you played", "what it allowed", "their move in the game", "better"]);
    // The resting picture draws the reply broken.
    expect(/data-k="r">[\s\S]*?class="ar ghost"/.test(html)).toBe(true);
  });

  it("the game ended there: the reply as a ghost and a pause for the sentence", async () => {
    const { html, steps } = await lineCase(await ended(), "allowed-tactic");
    expect(ghosts(steps)).toEqual([false, true, false]);
    expect(steps[2]).toEqual(["", "", { o: 1 }]);
    expect(key(html)).toEqual(["you played", "what it allowed", "better"]);
  });

  it("played the whole line: one solid sequence", async () => {
    const { html, steps } = await lineCase(await followed(), "hung-piece");
    expect(ghosts(steps).every((g) => !g)).toBe(true);
    expect(key(html)).toEqual(["you played", "their reply", "better"]);
    expect(html).not.toContain('class="ar ghost"');
  });
});

describe("states", () => {
  it("a weekly report: every sentence from the view, last period's items, the completed item", async () => {
    const { report, games } = await fullReport();
    const html = renderPage(report, CTX, { games });
    const v = view(report);
    expect(html).toContain('data-auto="1"');
    expect(html).not.toContain('http-equiv="refresh"');
    has(html, `${PLAYER}, one habit is off your list.`);
    has(html, v.summary!);
    for (const p of v.progressInGames!.items) {
      has(html, `${p.patternName}: ${p.counts}`);
      expect(html).toContain(p.verdictText);
    }
    for (const x of v.retiredInGames!.items) has(html, `${x.patternName}: ${x.verdictText}. ${x.counts}`);
    expect(html).toContain('<span class="stamp">Fixed</span>');
    if (v.body.kind !== "focus") throw new Error("expected focus");
    for (const it of v.body.items) {
      for (const s of [it.title, it.why, it.drill, it.reason, it.goalLine, it.standing, it.blindSpotsIntro!]) has(html, s);
      if (it.frequencyPhrase) has(html, it.frequencyPhrase);
      for (const b of it.blindSpots) for (const s of [b.label, b.comparison, b.refinement]) if (s) has(html, s);
      for (const s of it.steps) has(html, s.text);
      for (const ex of it.examples) {
        for (const l of ex.story!) has(html, l.text);
        has(html, ex.cost!.text);
        has(html, ex.moveLabel);
      }
    }
    // Folded examples are in the markup, whole.
    expect(html).toContain('<button type="button" class="morebtn" data-open="ex-1-2">Show another example</button>');
    expect(html).toMatch(/<article class="ex" id="ex-1-2" data-fold data-b=/);
    // "See one on the board" points at an example that shows the blind spot.
    expect(html).toMatch(/id="focus-1-step-2"[\s\S]*?href="#ex-1-2">See one on the board/);
  });

  it("a first report", async () => {
    const { report, games } = await fullReport({ kind: "first", progress: [], retired: [], periodStart: weekEnd(4) });
    const html = renderPage(report, CTX, { games });
    has(html, `${PLAYER}, two habits are costing you the most.`);
    has(html, "All 18 of your rapid games from the last 28 days, every mistake checked twice. Work on these two. Everything else can wait.");
    expect(pageText(html)).toMatch(/[A-Z][a-z]+ weeks is not a trend\. It is a starting line\./);
    expect(html).not.toContain("Last report&#39;s");
  });

  it("while the deeper check runs: its banner, no autoplay, the refresh kept", async () => {
    const { report, games } = await fullReport({ coverage: { sampled: 18, analysed: 18, total: 18, complete: false, sampleOnly: false, checked: 7 } });
    const html = renderPage(report, { pending: 11, history: [] }, { games });
    const v = view(report, 11);
    has(html, `Deeper check running: ${v.coverage!}`);
    expect(html).toContain("· first look");
    expect(html).toContain('data-auto="0"');
    expect(html).toContain('<meta http-equiv="refresh" content="30">');
    expect(html).toContain(`aria-label="${v.page.banner!.bar!.label}"`);
    has(html, `${PLAYER}, two habits stand out so far.`);
    expect(renderPage(report, { pending: 11, history: [] }, { latest: false })).not.toContain('http-equiv="refresh"');
  });

  it("while games are still being analysed", async () => {
    const { report } = await fullReport({ gamesAnalyzed: 6, coverage: { sampled: 6, analysed: 6, total: 18, complete: false, sampleOnly: false, checked: 2 } });
    const html = renderPage(report, { pending: 16, history: [] });
    has(html, `Still analysing: ${view(report, 16).coverage!}`);
    has(html, "From the first 6 of your 18 rapid games. The rest are in the queue.");
    expect(html).toContain("· provisional");
    expect(html).toContain('data-auto="0"');
  });

  it("a sample stopped on request: its banner, no bar, no refresh, boards play", async () => {
    const { report } = await fullReport({ coverage: { sampled: 6, analysed: 6, total: 18, complete: false, sampleOnly: true } });
    const html = renderPage(report, { pending: 12, history: [] });
    has(html, `A sample, as you asked: ${view(report, 12).coverage!}`);
    expect(html).not.toContain('class="bar"');
    expect(html).not.toContain('http-equiv="refresh"');
    expect(html).toContain('data-auto="1"');
  });

  it("too few games: the numbers, folded zeros, no cards or boards", () => {
    const r = sampleReport([], { notes: ["few-games"], gamesFound: 6, current: period(END, 6) });
    const html = renderPage(r, CTX);
    const v = view(r);
    has(html, `${PLAYER}, six games is not enough to go on.`);
    has(html, "Play a few more and run the report again. Until then, here are the numbers.");
    expect(html).not.toContain('class="card"');
    expect(html).not.toContain('class="board');
    expect(html).not.toContain(esc(v.summary!));
    has(html, "Four other patterns 0 games");
    if (v.body.kind === "numbers") for (const row of v.body.table.rows) for (const c of row) expect(html).toContain(`<td>${esc(c)}</td>`);
  });

  it("enough games but nothing picked: the view's intro as the lede", () => {
    const r = sampleReport([], { current: period(END, 18) });
    const html = renderPage(r, CTX);
    const v = view(r);
    has(html, `${PLAYER}, here are your numbers.`);
    if (v.body.kind !== "numbers") throw new Error("expected numbers");
    has(html, v.body.intro);
  });

  it("no model key: the built-in wording and its note", async () => {
    const { report, games } = await fullReport({ notes: ["no-key"], wording: { source: "template", wordedFor: [], calls: 0 } });
    const html = renderPage(report, CTX, { games });
    const v = view(report);
    has(html, `Wording Built-in templates. ${v.notes.lines[0]!}`);
  });

  it("stored wording with a per-100 figure shows the built-in text instead", async () => {
    const { report } = await fullReport({ summary: "{mistakeRate} mistakes per 100 moves." });
    const r = { ...report, focus: report.focus.map((f, i) => (i === 0 ? { ...f, title: "Down to {target} per 100" } : f)) };
    const html = renderPage(r, CTX);
    const v = view(r);
    expect(pageText(html)).not.toContain("Down to");
    has(html, v.summary!);
    if (v.body.kind === "focus") has(html, v.body.items[0]!.title);
  });

  it("the precise figures, in one details element", async () => {
    const { report, games } = await fullReport();
    const html = renderPage(report, CTX, { games });
    const v = view(report);
    expect(html).toMatch(/<details id="figures">\n<summary>Precise figures \(per 100 moves\)<\/summary>/);
    for (const l of v.details.focus) has(html, l);
    has(html, "Blind spots (96 games, 230 mistakes)");
    has(html, "1 · of them, from the knight that moved");
    has(html, "The four positions shown (engine depth 1)");
  });

  it("an older stored report without stories, blind spots, steps or goals", () => {
    const s: FocusItem = focusItem("hung-piece", [
      { patternId: "hung-piece", gameId: "lichess:old1", ply: 23, winPctLoss: 32, fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4", played: "Qxf7", best: "Nf3" },
    ]);
    const { goal: _g, blindSpots: _b, steps: _s, ...old } = s;
    const r = WeeklyReport.parse({ ...sampleReport([s]), focus: [old] });
    const html = renderPage(r, CTX);
    const v = view(r);
    if (v.body.kind !== "focus") throw new Error("expected focus");
    const it = v.body.items[0]!;
    for (const x of [it.title, it.goalLine, it.standing, it.examples[0]!.line, it.drill]) has(html, x);
    expect(html).toContain('<p class="habit-t">The habit to build</p>');
    expect(html).not.toContain('class="board');
  });
});

describe("as a library", () => {
  it("importing the render entry starts no server", async () => {
    const spy = vi.spyOn(http, "createServer");
    vi.resetModules();
    const mod = await import("./render");
    expect(typeof mod.renderPage).toBe("function");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    const src = readFileSync(new URL("./render.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/from "\.\/server"|node:http/);
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(pkg.exports["./render"]).toBe("./src/render.ts");
  });

  it("prefixes every internal link with basePath", async () => {
    const { report, games } = await fullReport();
    const html = renderPage(report, CTX, { games, basePath: "/u/abc/", reports: [{ periodEnd: weekEnd(1), kind: "first" }, { periodEnd: END, kind: "weekly" }] });
    const hrefs = [...html.matchAll(/href="([^"#][^"]*)"/g)].map((m) => m[1]!).filter((h) => !h.startsWith("https://"));
    expect(hrefs.length).toBeGreaterThan(1);
    for (const h of hrefs) expect(h.startsWith("/u/abc/")).toBe(true);
    expect(html).toContain(`href="/u/abc/report/${encodeURIComponent(weekEnd(1))}"`);
    expect(html).toContain('href="/u/abc/report.json"');
  });

  it("emits the trusted header and footer as given, and still escapes report data", () => {
    const r = sampleReport([], { player: XSS, track: { platform: "lichess", username: XSS, timeClass: "rapid" } });
    const html = renderPage(r, CTX, { header: '<nav class="host">Home</nav>', footer: '<p class="host">Bye</p>' });
    expect(html).toMatch(/<body data-auto="1">\n<nav class="host">Home<\/nav>/);
    expect(html).toMatch(/<p class="host">Bye<\/p>\n<script>/);
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html).toContain(esc(XSS));
  });

  it("keeps the script small", () => {
    expect(Buffer.byteLength(SCRIPT)).toBeLessThan(6 * 1024);
    expect(Buffer.byteLength(STYLE)).toBeLessThan(24 * 1024);
  });
});

describe("parity with the text report", () => {
  /*
   * Every line the terminal prints, in its precise form, appears on the page, except lines the
   * page says another way, listed here: the title (the page's <title>), the body heading, an
   * item's title line and "Drill:" label, the frequency sentence (the page shows its counts and
   * phrase), each blind-spot sentence (shown as label, count and comparison), the step list's
   * label and numbers, the example's FEN, plain line and detector evidence (terminal only for
   * stories), the stored summary when nothing was picked and the too-few intro (the page's lede says it), the "Rating band:", "Period:" and "Games:" labels (an About list), and headings.
   */
  it("shows every sentence the CLI prints that the page also shows", async () => {
    const { report, games } = await fullReport({
      notes: ["no-key", "settings-changed"],
      wording: { source: "template", wordedFor: [], calls: 0 },
      trends: PATTERN_IDS.map((id) => ({ patternId: id, previous: stat(id, 69, 20), current: stat(id, 18, 5), verdict: id === "hung-piece" ? "improved" : "flat", pValue: id === "hung-piece" ? 0.04 : null })),
    });
    for (const variant of [report, { ...report, focus: [], notes: ["few-games" as const] }]) {
      const cli = formatReport(variant, { all: true, pending: 0 });
      const text = pageText(renderPage(variant, CTX, { games }));
      const v = view(variant);
      const items = v.body.kind === "focus" ? v.body.items : [];
      const skip = new Set<string>([
        v.header.title,
        v.body.heading,
        v.notes.heading,
        v.weeks.heading,
        "Examples:",
        // With nothing picked the page leads with its own lede and leaves the stored summary out.
        ...(items.length === 0 && v.summary ? [v.summary] : []),
        // Too few games: the page's own lede stands in for the view's intro.
        ...(v.body.kind === "numbers" && variant.notes.includes("few-games") ? [v.body.intro] : []),
        "The habit to build:",
        ...items.flatMap((i) => [`${i.number}. ${i.title} [${i.patternName}]`, i.frequency, ...i.blindSpots.map((b) => `${b.sentence}${b.refinement ? ` ${b.refinement}` : ""}`), ...i.examples.flatMap((e) => [e.line, e.evidence ?? ""])]),
      ]);
      for (const raw of cli.split("\n")) {
        let line = raw.trim().replace(/^- /, "");
        if (!line || skip.has(line) || line.startsWith("Position (FEN)") || line === v.progress?.heading || line === v.retired?.heading) continue;
        if (/\S\s{2,}\S/.test(line)) {
          for (const cell of line.split(/\s{2,}/)) expect(text, `cell "${cell}"`).toContain(cell);
          continue;
        }
        line = line
          .replace(/^(Drill|You|They|Then|Better): /, "")
          .replace(/^\d\. /, "")
          .replace(/^(Rating band|Period|Games): /, "");
        // The cost line prints its detail after it; the page puts the detail in the precise figures.
        const cost = items.flatMap((i) => i.examples).find((e) => e.cost && line.startsWith(e.cost.text));
        if (cost?.cost?.detail) {
          expect(text).toContain(cost.cost.text);
          expect(text).toContain(cost.cost.detail);
          continue;
        }
        expect(text, line).toContain(line.replace(/\s+/g, " "));
      }
    }
  });
});


describe("truth", () => {
  it("says a deeper check is running only when one is set and games wait for it", async () => {
    const unfinished = { sampled: 18, analysed: 18, total: 18, complete: false, sampleOnly: false };
    for (const [settings, pending] of [[{ ...SETTINGS_NO_CHECK }, 0], [{ ...SETTINGS_NO_CHECK }, 5], [undefined, 0]] as const) {
      const { report } = await fullReport({ coverage: unfinished, ...(settings ? { settings } : {}) });
      const html = renderPage(report, { pending, history: [] });
      const v = view(report, pending);
      expect(v.page.stage).toBe("finishing");
      expect(html).not.toContain("· first look");
      expect(html).not.toContain("still to check");
      expect(html).not.toContain("deeper check is running");
      expect(html).not.toContain("Deeper check running");
      expect(html).toContain('data-auto="0"');
    }
    const { report } = await fullReport({ coverage: unfinished });
    expect(view(report, 3).page.stage).toBe("checking");
  });

  it("titles an example from its own facts, whatever its place in the list", async () => {
    const [f, o] = await Promise.all([followed(), other()]);
    expect(f.story.inGame?.paid).toBe(true);
    expect(o.story.inGame?.paid ?? false).toBe(false);
    const titles = (exs: Sample[]) => {
      const r = sampleReport([focusItem("hung-piece", exs.map((s) => example(s, "hung-piece")))]);
      const v = view(r);
      return v.page.items[0]!.examples.map((e) => e.title);
    };
    const [a, b] = titles([f, o]);
    expect(titles([o, f])).toEqual([b, a]);
    expect(a).toBe("One queen, and they took it");
    expect(b).toBe("One queen, left where it could be taken");
    // A motif is said as what it looked like, and only when the finding carries one.
    const p = await partway();
    const withMotif = view(sampleReport([focusItem("allowed-tactic", [example(p, "allowed-tactic", { motif: "fork" })])]));
    expect(withMotif.page.items[0]!.examples[0]!.lines.find((l) => l.tag === "they")?.chip).toBe("looked like a fork");
    const without = view(sampleReport([focusItem("allowed-tactic", [example(p, "allowed-tactic")])]));
    expect(without.page.items[0]!.examples[0]!.lines.some((l) => l.chip)).toBe(false);
  });

  it("says the top two cost the most only when it is true", async () => {
    const top = "The top two cost you the most";
    const { report } = await fullReport();
    const ranked = (ids: string[]) => ids.map((patternId, i) => ({ patternId, eligible: true, rank: i + 1, rate: 1, severity: 1, recentCost: 1, naiveCostThisPeriod: 1, chronicity: 1, score: 1, persistence: { weeksRecurred: 3, weeksCounted: 3, weeks: [true, true, true, null, null, null], chronicity: 1 } }));
    const yes = { ...report, priorities: ranked(["allowed-tactic", "hung-piece"]) };
    expect(view(yes).page.patterns.note).toContain(top);
    // Not ranked as this period's top two: not said.
    expect(view(report).page.patterns.note).not.toContain(top);
    // Kept, but not seen in this period's games: not said.
    const quiet = { ...yes, current: { ...yes.current, stats: yes.current.stats.map((s) => (s.patternId === "hung-piece" ? { ...s, gamesAffected: 0 } : s)) } };
    expect(view(quiet).page.patterns.note).not.toContain(top);
    expect(renderPage(quiet, CTX)).not.toContain(top);
  });

  it("refuses a basePath that is not plain path segments", async () => {
    const { report } = await fullReport();
    for (const bad of ["//evil.example", "/a//b", "https://evil.example", "/a b", "a", "/..%2f", '/x"y']) {
      expect(() => renderPage(report, CTX, { basePath: bad }), bad).toThrow(/basePath/);
    }
    for (const ok of ["", "/", "/u/abc", "/u/abc/", "/a.b_c~d-e"]) expect(() => renderPage(report, CTX, { basePath: ok })).not.toThrow();
  });

  it("words the example link by whether there is a board", () => {
    const old = focusItem("hung-piece", [{ patternId: "hung-piece", gameId: "lichess:old1", ply: 23, winPctLoss: 32, fen: "8/8/8/8/8/8/8/8 w - - 0 1", played: "Qxf7" }]);
    const html = renderPage(sampleReport([old]), CTX);
    expect(html).not.toContain("See it on the board");
    expect(html).toContain("See the example");
  });

  it("says something sensible with no game analysed yet", async () => {
    const { report } = await fullReport({ gamesAnalyzed: 0, coverage: { sampled: 0, analysed: 0, total: 18, complete: false, sampleOnly: false } });
    const html = renderPage(report, { pending: 18, history: [] });
    expect(html).not.toContain("From the first");
    has(html, view(report, 18).page.lede.map((x) => x.text).join(""));
  });
});

/** Every string and number in a value, as text. */
function strings(x: unknown, out = new Set<string>()): Set<string> {
  if (typeof x === "string") out.add(x.trim());
  else if (typeof x === "number") {
    out.add(String(x));
    out.add(x.toLocaleString("en-US"));
  } else if (Array.isArray(x)) for (const y of x) strings(y, out);
  else if (x && typeof x === "object") for (const y of Object.values(x)) strings(y, out);
  return out;
}

describe("parity, the other way", () => {
  /*
   * Every text node and text alternative on the page that holds a word or a figure is a string
   * of the view, or one of these, listed honestly: the fixed labels (`LABELS`), the arrow key's
   * legend, the board's coordinates, a piece name capitalised at the start of a sentence, and
   * the opening names and page title the game records and header give.
   */
  it("shows no sentence or number the view did not give", async () => {
    const LEGEND = ["you played", "their reply", "what it allowed", "what could follow", "their move in the game", "better"];
    for (const l of LABELS) expect(l, "a label is never a sentence or a figure").not.toMatch(/\d|\.$/);
    const variants = [
      await fullReport(),
      await fullReport({ kind: "first", progress: [], retired: [], periodStart: weekEnd(4) }),
      await fullReport({ coverage: { sampled: 18, analysed: 18, total: 18, complete: false, sampleOnly: false, checked: 7 } }),
      { report: sampleReport([], { notes: ["few-games"], gamesFound: 6, current: period(END, 6) }), games: new Map() },
    ];
    for (const { report, games } of variants) {
      const pending = report.coverage.complete ? 0 : 11;
      const html = renderPage(report, { pending, history: [] }, { games });
      const v = view(report, pending);
      const allowed = strings(v);
      for (const piece of ["pawn", "knight", "bishop", "rook", "queen", "king"]) allowed.add(piece.charAt(0).toUpperCase() + piece.slice(1));
      for (const l of [...LABELS, ...LEGEND, "12345678", "abcdefgh"].flatMap((x) => (/^\d+$|^[a-h]+$/.test(x) ? x.split("") : [x]))) allowed.add(l);
      for (const g of games.values()) if (g.opening?.name) allowed.add(g.opening.name);
      const body = html.replace(/<head>[\s\S]*?<\/head>/, "").replace(/<script>[\s\S]*?<\/script>/, "");
      const decode = (t: string) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
      const nodes = [...body.matchAll(/>([^<]+)</g)].map((m) => decode(m[1]!).trim());
      const labels = [...body.matchAll(/aria-label="([^"]*)"/g)].map((m) => decode(m[1]!).trim());
      for (const t of [...nodes, ...labels]) {
        if (!/[A-Za-z0-9]/.test(t)) continue;
        expect(allowed.has(t), `"${t}" is not a view string`).toBe(true);
      }
    }
  });
});

describe("esc", () => {
  it("escapes markup and both quote kinds", () => {
    expect(esc(`<a href="x" title='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });
});

