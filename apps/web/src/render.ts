import { createHash } from "node:crypto";
import { templateWording } from "@blunderstruck/coach/templates";
import type { GameRecord, PeriodStats, ProgressVerdict, Track, WeeklyReport } from "@blunderstruck/contracts";
import {
  OTHER_TRACKS_INTRO,
  type PageExample,
  type PageItem,
  type PageTrack,
  type ReportView,
  type StorySegment,
  type TableView,
  reportView,
  reportsList,
} from "@blunderstruck/view";
import { coverOf, exampleBoard, miniBoard } from "./board";
import { esc, safeHref } from "./html";
import { inlinePiece, pieceSprite } from "./pieces";
import { SCRIPT } from "./script";
import { STYLE } from "./styles";

export { esc } from "./html";
export { STYLE } from "./styles";
export { SCRIPT } from "./script";

/*
 * The page lays out what the view says. Every sentence and every number comes from
 * `reportView` (most of it from its `page` field); the only words written here are the fixed
 * labels in `LABELS`, and the opening name, game link and commands, which are not in a report.
 */

/** Seconds between reloads while games are still being analysed. */
export const REFRESH_SECONDS = 30;

const sha256 = (s: string): string => `'sha256-${createHash("sha256").update(s, "utf8").digest("base64")}'`;

/** The CSP sources that allow exactly the page's one stylesheet and one script. */
export const STYLE_HASH = sha256(STYLE);
export const SCRIPT_HASH = sha256(SCRIPT);

/**
 * The Content-Security-Policy every page from `renderPage` and `renderMessage` needs: nothing
 * may load from anywhere, and only the page's own inline stylesheet and script may run.
 */
export function pageSecurity(): { csp: string } {
  return {
    csp: `default-src 'none'; style-src ${STYLE_HASH}; script-src ${SCRIPT_HASH}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  };
}

/** The fixed labels the page writes itself: names of things, never sentences or figures. */
export const LABELS = [
  "Blunderstruck",
  "For the curious",
  "Everything we counted",
  "About this report",
  "All reports",
  "Your other time classes",
  "The latest report as JSON",
  "In your games",
  "At the board",
  "Off your list",
  "Fixed",
  "Start",
  "Goal",
  "Open the game",
  "Show another example",
  "What I played",
  "Better move",
  "Replay",
  "What it allowed",
  "What could follow",
  "See this mistake on the board",
  "The habits to work on",
] as const;

export interface PageOptions {
  /** The track the page is for; used on the page shown before any report exists. */
  track?: Track;
  /** The exact command that writes the first report. */
  reportCommand?: string;
  /** Every stored report of the track, for the links between them. */
  reports?: readonly Pick<WeeklyReport, "periodEnd" | "kind">[];
  /** Whether `report` is the track's newest; only the newest reloads itself. Default true. */
  latest?: boolean;
  /** The player's other tracks, and the command that serves one of them. */
  otherTracks?: readonly { track: Track; command: string }[];
  /** Records of the example games, for the opening name and the link. */
  games?: ReadonlyMap<string, Pick<GameRecord, "url" | "platform" | "opening">>;
  /**
   * Put before every internal link ("/", "/report/…", "/report.json"), for a page served under
   * a path: "" or segments like "/u/abc" (letters, digits, `.`, `_`, `~`, `-`). Anything else
   * throws, so a value like "//elsewhere.example" can never send a link off the site.
   */
  basePath?: string;
  /**
   * Trusted HTML from the program that embeds the page, put at the top of `<body>`. It is
   * inserted as given, never escaped, and must never contain report data. It must also live
   * within `pageSecurity()`: no inline styles, scripts or external resources.
   */
  header?: string;
  /** Trusted HTML put at the end of `<body>`, on the same terms as `header`. */
  footer?: string;
}

const BASE_PATH = /^(\/[A-Za-z0-9._~-]+)*$/;

/** The base path without a trailing slash; throws on anything that is not plain path segments. */
export function checkBasePath(basePath: string | undefined): string {
  const b = (basePath ?? "").replace(/\/$/, "");
  if (!BASE_PATH.test(b)) throw new Error(`basePath must be "" or path segments like "/u/abc", not ${JSON.stringify(basePath)}`);
  return b;
}

/** The URL path of one stored report. */
export function reportPath(periodEnd: string, basePath = ""): string {
  return `${checkBasePath(basePath)}/report/${encodeURIComponent(periodEnd)}`;
}

const pct = (x: number): string => `${(Math.max(0, Math.min(1, x)) * 100).toFixed(1)}%`;

function page(title: string, body: string, o: { refresh?: boolean; script?: boolean; auto?: boolean; opts: PageOptions }): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    o.refresh ? `<meta http-equiv="refresh" content="${REFRESH_SECONDS}">` : "",
    `<title>${esc(title)}</title>`,
    `<style>${STYLE}</style>`,
    "</head>",
    `<body data-auto="${o.auto ? 1 : 0}">`,
    o.opts.header ?? "",
    body,
    o.opts.footer ?? "",
    o.script ? `<script>${SCRIPT}</script>` : "",
    "</body>",
    "</html>",
    "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

const join = (parts: readonly (string | undefined | false)[]): string => parts.filter((p): p is string => typeof p === "string" && p !== "").join("\n");

function table(caption: string, t: TableView): string {
  const th = t.head.map((h) => `<th scope="col">${esc(h)}</th>`).join("");
  const rows = t.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("\n");
  return `<p class="tcap">${esc(caption)}</p>\n<div class="tbl"><table><thead><tr>${th}</tr></thead><tbody>\n${rows}\n</tbody></table></div>`;
}

const KNIGHT = inlinePiece("knight", "white");

function masthead(meta: string): string {
  return `<header class="mast"><a class="brand" href="#top">${KNIGHT}Blunderstruck</a><span class="mast-meta">${esc(meta)}</span></header>`;
}

/** A plain page with a heading, a sentence and an optional command; used before there is a report to show. */
export function renderMessage(title: string, message: string, command?: string, opts: PageOptions = {}): string {
  checkBasePath(opts.basePath);
  const body = join([
    pieceSprite(),
    '<div class="wrap">',
    masthead(""),
    '<main id="top"><section class="hero">',
    `<h1>${esc(title)}</h1>`,
    `<p class="lede">${esc(message)}</p>`,
    command ? `<code class="cmd">${esc(command)}</code>` : undefined,
    "</section></main>",
    "</div>",
  ]);
  return page(title, body, { opts });
}

function otherTracksHtml(others: PageOptions["otherTracks"]): string | undefined {
  if (!others || others.length === 0) return undefined;
  const items = others.map((o) => `<li><span>${esc(o.track.timeClass)}:</span> <code class="cmd">${esc(o.command)}</code></li>`);
  return `<h3>Your other time classes</h3>\n<p class="note">${esc(OTHER_TRACKS_INTRO)}</p>\n<ul class="rlist">${items.join("\n")}</ul>`;
}

function emptyPage(opts: PageOptions): string {
  const t = opts.track;
  const command = opts.reportCommand ?? (t ? `pnpm cli report ${t.platform} ${t.username}` : "pnpm cli report <platform> <user>");
  const who = t ? ` for ${t.username}` : "";
  const body = join([
    pieceSprite(),
    '<div class="wrap">',
    masthead(t ? `${t.username} · ${t.platform} · ${t.timeClass}` : ""),
    '<main id="top"><section class="hero">',
    `<h1>${esc(`No report yet${who}.`)}</h1>`,
    '<p class="lede">Run the report command first, then reload this page:</p>',
    `<code class="cmd">${esc(command)}</code>`,
    otherTracksHtml(opts.otherTracks),
    "</section></main>",
    "</div>",
  ]);
  return page("No report yet", body, { opts });
}

/* ---------- small parts ---------- */

const VERDICT: Record<ProgressVerdict, { cls: string; icon: string }> = {
  improved: { cls: "vd up", icon: "M2 6.5l2.6 2.6L10 3.4" },
  flat: { cls: "vd flat", icon: "M2.5 4.3h7M2.5 7.7h7" },
  worse: { cls: "vd down", icon: "M6 10V2.5M2.8 5.6 6 2.4l3.2 3.2" },
  "insufficient-data": { cls: "vd wait", icon: "M2.4 6h.1M6 6h.1M9.6 6h.1" },
};

function verdictChip(verdict: ProgressVerdict, words: string): string {
  const v = VERDICT[verdict];
  return `<span class="${v.cls}"><svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="${v.icon}"/></svg>${esc(words)}</span>`;
}

/** Text and pieces of a story sentence; a piece's name stays with its drawing. */
function segmentsHtml(segments: readonly StorySegment[]): string {
  return segments
    .map((s, i) => {
      if ("text" in s) return esc(s.text);
      // A sentence that starts with a piece starts with its name capitalised.
      const name = i === 0 ? s.piece.charAt(0).toUpperCase() + s.piece.slice(1) : s.piece;
      return `<span class="pw">${inlinePiece(s.piece, s.color)}${esc(name)}</span>`;
    })
    .join("");
}

/** A bar as SVG, so its width needs no style attribute. */
const svgBar = (cls: string, share: number): string =>
  `<svg class="${cls}" aria-hidden="true" focusable="false"><rect class="t" width="100%" height="100%" rx="4"/><rect class="f" width="${pct(share)}" height="100%" rx="4"/></svg>`;

function dotsSvg(d: NonNullable<PageItem["dots"]>): string {
  const per = 30;
  const rows = Math.max(1, Math.ceil(d.games / per));
  const circles: string[] = [];
  for (let i = 0; i < d.games; i++) {
    const solid = i < d.affected - d.over;
    const cut = !solid && i < d.affected;
    circles.push(`<circle class="${solid ? "d-on" : cut ? "d-cut" : "d-off"}" cx="${4.5 + (i % per) * 9}" cy="${4.5 + Math.floor(i / per) * 9}" r="${cut ? 2.5 : 3.3}"/>`);
  }
  return `<svg class="dots" viewBox="0 0 270 ${rows * 9}" role="img" aria-label="${esc(d.label)}">${circles.join("")}</svg>`;
}

function trackHtml(t: PageTrack): string {
  const p = pct(t.share);
  return (
    `<div class="track" role="img" aria-label="${esc(t.label)}"><div class="rail"><svg aria-hidden="true" focusable="false">` +
    `<rect class="t" y="7" width="100%" height="4" rx="2"/><rect class="f${t.improved ? " good" : ""}" y="7" width="${p}" height="4" rx="2"/>` +
    `<circle class="end" cx="100%" cy="9" r="7.75"/><circle class="nowr" cx="${p}" cy="9" r="9.75"/><circle class="now" cx="${p}" cy="9" r="7.5"/></svg></div>` +
    `<div class="ends"><span><b>Start</b>${esc(t.start)}</span><span><b>Goal</b>${esc(t.goal)}</span></div></div>`
  );
}

/* ---------- per item ---------- */

interface Item {
  n: number;
  view: ReportView["body"] extends infer B ? (B extends { kind: "focus"; items: (infer I)[] } ? I : never) : never;
  raw: WeeklyReport["focus"][number];
  text: PageItem;
}

const exampleId = (it: Item, j: number): string => `ex-${it.n}-${j + 1}`;

function cardHtml(it: Item): string {
  const v = it.view;
  const t = it.text;
  const ex0 = it.raw.examples[0];
  const mini = ex0?.story && t.examples[0]?.hasBoard ? miniBoard(ex0.fen, ex0.story, ex0.patternId) : undefined;
  return [
    `<article class="card" id="card-${it.n}">`,
    `<div class="top"><span class="num">${esc(t.number)}</span><div><p class="tag">${esc(v.patternName)}</p><h2>${esc(v.title)}</h2></div></div>`,
    '<div class="mid"><div>',
    t.count && t.ofGames ? `<p class="big"><b>${esc(t.count)}</b><span>${esc(t.ofGames)}</span></p>` : `<p class="big">${esc(v.frequency)}</p>`,
    v.frequencyPhrase ? `<p class="about">${esc(v.frequencyPhrase)}</p>` : "",
    t.verdict ? `<p class="vdrow">${verdictChip(t.verdict.verdict, t.verdict.text)}</p>` : "",
    "</div>",
    mini ? `<a class="mini" href="#${exampleId(it, 0)}" aria-label="See this mistake on the board">${mini}</a>` : "",
    "</div>",
    t.dots ? dotsSvg(t.dots) : "",
    t.overText ? `<p class="ringkey"><span class="key" aria-hidden="true"></span>${esc(t.overText)}</p>` : "",
    t.cardTrack ? trackHtml(t.cardTrack) : "",
    `<p class="aim"><b>${esc(v.goalLine)}</b> <span>${esc(v.standing)}</span></p>`,
    `<p class="links"><a class="more" href="#habit-${it.n}">${esc(t.routineLink)}</a>${t.exampleLink ? `<a class="more quiet" href="#${exampleId(it, 0)}">${esc(t.exampleLink)}</a>` : ""}</p>`,
    "</article>",
  ].join("");
}

function habitHtml(it: Item): string {
  const t = it.text;
  const rows = t.steps.map((s, i) => {
    const spot = [
      `<p class="spot-k">${esc(s.spotLabel)}</p>`,
      `<p class="spot-name">${esc(s.name)}</p>`,
      s.count && s.of ? `<p class="spot-n"><b>${esc(s.count)}</b><span>${esc(s.of)}</span></p>` : "",
      s.bar
        ? `<svg class="cmp" role="img" aria-label="${esc(s.bar.label)}" focusable="false">` +
          `<rect class="t" y="4" width="100%" height="10" rx="5"/><rect class="f" y="4" width="${pct(s.bar.share)}" height="10" rx="5"/>` +
          (s.bar.tick !== undefined ? `<rect class="k" x="${pct(s.bar.tick)}" y="0" width="3" height="18" rx="1.5" transform="translate(-1.5 0)"/>` : "") +
          "</svg>"
        : "",
      s.comparison ? `<p class="spot-vs"><span class="tk" aria-hidden="true"></span>${esc(s.comparison)}</p>` : "",
      s.refinement ? `<p class="spot-ref">${esc(s.refinement)}</p>` : "",
      s.example !== undefined && s.exampleLink ? `<a class="more" href="#${exampleId(it, s.example)}">${esc(s.exampleLink)}</a>` : "",
    ].join("");
    return (
      `<li class="step" id="focus-${it.n}-step-${i + 1}"><div class="spot">${spot}</div>` +
      '<div class="join" aria-hidden="true"><svg viewBox="0 0 26 26" focusable="false"><path d="M3 13h18M15 7l6 6-6 6"/></svg></div>' +
      `<div class="do"><p class="do-k">${esc(s.stepLabel)}</p><p class="do-t">${esc(s.text)}</p></div></li>`
    );
  });
  return join([
    `<div class="habit" id="habit-${it.n}">`,
    t.habitLabel ? `<p class="habit-k">${esc(t.habitLabel)}</p>` : undefined,
    `<p class="habit-t">${esc(t.habitTitle)}</p>`,
    t.habitIntro
      ? `<p class="habit-s">${esc(t.habitIntro)}</p>` +
        '<div class="colk" aria-hidden="true"><span>In your games</span><span>At the board</span></div>' +
        `<ol class="steps">${rows.join("")}</ol>`
      : undefined,
    `<div class="drill">${t.drillLabel ? `<p class="drill-k">${esc(t.drillLabel)}</p>` : ""}<p class="drill-t">${esc(it.view.drill)}</p></div>`,
    "</div>",
  ]);
}

const WHO_CLASS = { you: "you", they: "they", then: "they", better: "good" } as const;

function gameMeta(ev: { gameId: string; ply: number }, moveLabel: string, games: PageOptions["games"]): string {
  const game = games?.get(ev.gameId);
  const opening = game?.opening?.name ?? game?.opening?.eco;
  let link = "";
  if (game) {
    const href = safeHref(game.platform === "lichess" ? `${game.url}#${ev.ply}` : game.url);
    if (href) link = `<a href="${esc(href)}" rel="noreferrer">Open the game</a>`;
  }
  return [`<span>${esc(moveLabel)}</span>`, opening ? `<span>${esc(opening)}</span>` : "", link].filter(Boolean).join(" · ");
}

function exampleHtml(it: Item, j: number, hint: string, games: PageOptions["games"]): string {
  const pe: PageExample = it.text.examples[j]!;
  const raw = it.raw.examples[j]!;
  const ev = it.view.examples[j]!;
  const id = exampleId(it, j);
  const fold = j >= 1;
  const more = fold ? `<button type="button" class="morebtn" data-open="${id}">Show another example</button>` : "";
  const chips = pe.chips.map((c) => `<a class="spotchip" href="#focus-${it.n}-step-${c.step + 1}"><i>${esc(c.number)}</i>${esc(c.label)}</a>`);
  const spots = pe.chipsLabel ? `<p class="exspots"><span class="lab">${esc(pe.chipsLabel)}</span>${chips.join("")}</p>` : "";
  const head = `${spots}${pe.title ? `<p class="extitle">${esc(pe.title)}</p>` : ""}<p class="exmeta">${gameMeta(ev, pe.moveLabel, games)}</p>`;
  if (pe.plain !== undefined || !raw.story) {
    // Stored before stories: the plain line in place of the board and sentences.
    return `${more}<article class="ex plain" id="${id}"${fold ? " data-fold" : ""}><div>${head}<p class="plainex">${esc(pe.plain ?? ev.line)}</p></div></article>`;
  }
  const board = pe.hasBoard ? exampleBoard(raw.fen, raw.story, raw.patternId, ev.story, pe.boardLabel ?? "") : undefined;
  const plan = board?.plan;
  const items: string[] = [];
  const caps: string[] = [`<p class="c hint on">${esc(hint)}</p>`];
  for (const l of pe.lines) {
    const cover = plan ? coverOf(plan, l.tag) : undefined;
    const cls = WHO_CLASS[l.tag];
    const code = l.notation ? ` <code>${esc(l.notation)}</code>` : "";
    const chip = l.chip ? ` <span class="motif">${esc(l.chip)}</span>` : "";
    if (l.tag === "better") items.push('<li class="bettersep" aria-hidden="true"></li>');
    const data = cover ? ` data-v="${cover.view}" data-n="${cover.n}"` : "";
    items.push(`<li class="line${l.tag === "better" ? " g" : ""}"${data}><span class="who ${cls}">${esc(l.who)}</span><span>${segmentsHtml(l.segments)}${code}${chip}</span></li>`);
    if (data) caps.push(`<p class="c"><span class="who ${cls}">${esc(l.who)}</span>${segmentsHtml(l.segments)}</p>`);
  }
  const cost = pe.cost ? `<p class="swing">${segmentsHtml(pe.cost)}</p>` : "";
  const left = board
    ? `<div class="bwrap">${board.html}<div class="cap" aria-hidden="true">${caps.join("")}</div>${board.keyHtml}` +
      `<div class="ctl"><button type="button" class="bp" data-do="p" aria-pressed="false">What I played</button>` +
      (raw.story.better.length > 0 ? '<button type="button" class="bb" data-do="b" aria-pressed="false">Better move</button>' : "") +
      '<button type="button" class="ba" data-do="all">Replay</button></div></div>'
    : "";
  const attrs = board ? ` data-b="${esc(board.data)}"` : "";
  return `${more}<article class="ex" id="${id}"${fold ? " data-fold" : ""}${attrs}>${left}<div>${head}<ol class="lines">${items.join("")}</ol>${cost}</div></article>`;
}

function chartHtml(c: NonNullable<PageItem["chart"]>): string {
  const n = c.bars.length;
  const bars = c.bars
    .map((b, j) => {
      if (b.share === null) return "";
      const h = Math.min(100, (b.share / c.top) * 100);
      return `<svg x="${(((j + 0.5) / n) * 100).toFixed(2)}%" width="1" height="100%" overflow="visible"><rect class="${b.outline ? "few" : "cb"}" x="-17" y="${(100 - h).toFixed(1)}%" width="34" height="${h.toFixed(1)}%" rx="2"/></svg>`;
    })
    .join("");
  const gy = (100 - Math.min(100, (c.goalShare / c.top) * 100)).toFixed(1);
  const labels = c.bars.map((b) => `<span><b>${esc(b.value)}</b>${esc(b.label)}</span>`).join("");
  return (
    `<div class="chart" role="img" aria-label="${esc(c.label)}"><div class="chead"><span>${esc(c.topText)}</span>` +
    `<span class="gk"><i></i>${esc(c.goalKey)}</span></div>` +
    `<svg class="plot" aria-hidden="true" focusable="false">${bars}<line class="gl" x1="0" x2="100%" y1="${gy}%" y2="${gy}%"/></svg>` +
    `<div class="cx">${labels}</div></div><p class="note">${esc(c.note)}</p>`
  );
}

function pipsHtml(it: Item): string {
  if (it.raw.reason.weeksCounted < 3) return "";
  const pips = [...it.raw.reason.weeks]
    .reverse()
    .filter((f) => f !== null)
    .map((f) => (f ? "<i></i>" : '<i class="no"></i>'))
    .join("");
  return pips ? `<span class="pips" aria-hidden="true">${pips}</span>` : "";
}

function focusSection(it: Item, v: ReportView, opts: PageOptions): string {
  const fv = it.view;
  const t = it.text;
  return join([
    `<section class="focus" id="focus-${it.n}">`,
    `<div class="top"><span class="num">${esc(t.number)}</span><div><p class="tag">${esc(fv.patternName)}</p><h2>${esc(fv.title)}</h2>`,
    `<p class="reason">${pipsHtml(it)}<span>${esc(fv.reason)}</span>${t.verdict ? verdictChip(t.verdict.verdict, t.verdict.text) : ""}</p></div></div>`,
    `<p class="why">${esc(fv.why)}</p>`,
    habitHtml(it),
    t.examplesHeading ? `<h3>${esc(t.examplesHeading)}</h3>` : undefined,
    ...it.raw.examples.map((_, j) => exampleHtml(it, j, v.page.hint, opts.games)),
    `<h3>${esc(v.weeksInGames)}</h3>`,
    `<div class="two"><div>${t.chart ? chartHtml(t.chart) : ""}</div><div>`,
    t.sectionTrack ? trackHtml(t.sectionTrack) : undefined,
    `<p class="stand"><b>${esc(fv.goalLine)}</b> <span>${esc(fv.standing)}</span></p></div></div>`,
    "</section>",
  ]);
}

/* ---------- the rest ---------- */

function aboutHtml(v: ReportView, base: string): string {
  return join([
    "<div><h3>About this report</h3>",
    `<dl class="facts">${v.page.about.map((r) => `<dt>${esc(r.key)}</dt><dd>${esc(r.value)}</dd>`).join("")}</dl>`,
    ...v.page.aboutNotes.map((n) => `<p class="note">${esc(n)}</p>`),
    `<p class="note"><a class="more quiet" href="${esc(`${base}/report.json`)}">The latest report as JSON</a></p></div>`,
  ]);
}

function reportsNav(r: WeeklyReport, opts: PageOptions, base: string): string | undefined {
  const reports = opts.reports;
  if (!reports || reports.length < 2) return undefined;
  const items = reportsList(reports, r.periodEnd).map((x) => {
    if (x.current) return `<li><span>${esc(x.text)}</span></li>`;
    const href = x.latest ? `${base}/` : reportPath(x.periodEnd, base);
    return `<li><a href="${esc(href)}">${esc(x.text)}</a></li>`;
  });
  return `<h3>All reports</h3>\n<ul class="rlist">${items.join("\n")}</ul>`;
}

function detailsHtml(v: ReportView): string {
  const d = v.details;
  const lines = [...d.focus, ...(d.progress?.lines ?? []), ...(d.retired?.lines ?? [])];
  return join([
    '<details id="figures">',
    `<summary>${esc(d.heading)}</summary>`,
    lines.length > 0 ? `<ul class="dlines">${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : undefined,
    v.body.kind === "numbers" ? table(v.body.heading, v.body.table) : undefined,
    v.body.kind === "focus" ? table(d.weeks.heading, d.weeks.table) : undefined,
    d.trends.table ? table(d.trends.heading, d.trends.table) : `<p class="tcap">${esc(d.trends.heading)}</p><p class="note">${esc(d.trends.empty ?? "")}</p>`,
    ...v.page.tables.map((t) => table(t.caption, t.table)),
    "</details>",
  ]);
}

function bannerHtml(v: ReportView): string | undefined {
  const b = v.page.banner;
  if (!b) return undefined;
  const bar = b.bar
    ? `<svg class="bar" role="img" aria-label="${esc(b.bar.label)}" focusable="false"><rect class="t" width="100%" height="6" rx="3"/><rect class="f" width="${pct(b.bar.share)}" height="6" rx="3"/></svg>`
    : "";
  return `<div class="banner" role="status"><p><b>${esc(b.lead)}</b> <span>${esc(b.text)}</span>${b.wide ? `<span class="wide"> ${esc(b.wide)}</span>` : ""}</p>${bar}</div>`;
}

function sinceHtml(v: ReportView): string | undefined {
  const prog = v.progressInGames?.items ?? [];
  const ret = v.retiredInGames?.items ?? [];
  if (prog.length === 0 && ret.length === 0) return undefined;
  return join([
    '<section class="since">',
    v.page.progressHeading ? `<h3>${esc(v.page.progressHeading)}</h3>` : undefined,
    prog.length > 0
      ? `<ul class="verdicts">${prog.map((p) => `<li>${verdictChip(p.verdict, p.verdictText)}<span><b>${esc(p.patternName)}</b>: <span>${esc(p.counts)}</span></span></li>`).join("")}</ul>`
      : undefined,
    ret.length > 0 ? "<h3>Off your list</h3>" : undefined,
    ...ret.map(
      (x) =>
        `<div class="done">${x.why === "graduated" ? '<span class="stamp">Fixed</span>' : ""}<p><b>${esc(x.patternName)}</b>: <span>${esc(x.verdictText)}</span>. <span>${esc(x.counts)}</span></p></div>`,
    ),
    "</section>",
  ]);
}

/**
 * The report as one HTML page: one inline stylesheet, one inline script, every value escaped.
 * Complete without the script. `pending` is the number of games not yet fully checked;
 * `history` is the weekly stats of the track. Throws on a `basePath` that is not plain path segments.
 */
export function renderPage(report: WeeklyReport | undefined, ctx: { pending: number; history: PeriodStats[] }, opts: PageOptions = {}): string {
  const base = checkBasePath(opts.basePath);
  if (!report) return emptyPage(opts);
  const r = report;
  const v = reportView(r, {
    pending: ctx.pending,
    fallback: templateWording(r),
    ...(ctx.history.length > 0 ? { weeks: ctx.history } : {}),
  });
  const pt = v.page;
  const views = v.body.kind === "focus" ? v.body.items : [];
  const items: Item[] = views.map((view, i) => ({ n: i + 1, view, raw: r.focus[i]!, text: pt.items[i]! }));
  const index =
    items.length > 0
      ? `<ol class="index" aria-label="The habits to work on">${items
          .map(
            (it) =>
              `<li><a href="#card-${it.n}"><span class="ix-n">${esc(it.text.number)}</span><span class="ix-t">${esc(it.view.title)}</span>` +
              `<span class="ix-c">${esc(it.text.index ?? "")}</span></a></li>`,
          )
          .join("")}</ol>`
      : undefined;
  const cards = items.length > 0 ? `<div class="cards${items.length === 1 ? " one" : ""}">${items.map(cardHtml).join("")}</div>` : undefined;
  const lede = pt.lede.map((run) => (run.strong ? `<b>${esc(run.text)}</b>` : esc(run.text))).join("");
  const pats = pt.patterns.rows
    .map(
      (row) =>
        `<li${row.mark ? ' class="f"' : ""}><span>${esc(row.name)}${row.mark ? `<em>${esc(row.mark)}</em>` : ""}</span>${svgBar("pbar", row.share)}<span class="n">${esc(row.count)}</span></li>`,
    )
    .join("");
  const right = join([reportsNav(r, opts, base), otherTracksHtml(opts.otherTracks)]);
  const body = join([
    pieceSprite(),
    '<div class="wrap">',
    masthead(pt.masthead),
    '<main id="top">',
    bannerHtml(v),
    '<section class="hero">',
    `<p class="eyebrow">${esc(pt.eyebrow)}</p>`,
    `<h1>${esc(pt.headline)}</h1>`,
    `<p class="lede">${lede}${pt.ledeWide ? `<span class="wide"> ${esc(pt.ledeWide)}</span>` : ""}</p>`,
    index,
    cards,
    pt.showSummary && v.summary ? `<p class="overall">${esc(v.summary)}</p>` : undefined,
    "</section>",
    sinceHtml(v),
    ...items.map((it) => focusSection(it, v, opts)),
    '<section class="rest" id="rest">',
    '<p class="eyebrow">For the curious</p>',
    "<h2>Everything we counted</h2>",
    `<p class="note">${esc(pt.patterns.note)}</p>`,
    `<ul class="pats">${pats}</ul>`,
    `<div class="cols">${aboutHtml(v, base)}${right ? `<div>${right}</div>` : ""}</div>`,
    detailsHtml(v),
    "</section>",
    "</main>",
    `<footer class="foot">${esc(pt.footer)}</footer>`,
    "</div>",
  ]);
  return page(v.header.title, body, { refresh: v.provisional && (opts.latest ?? true), script: true, auto: pt.autoplay, opts });
}
