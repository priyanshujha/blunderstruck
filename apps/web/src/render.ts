import { createHash } from "node:crypto";
import type { GameRecord, PeriodStats, Track, WeeklyReport } from "@blunderstruck/contracts";
import { type ExampleView, type FocusView, type ReportView, type SectionView, type TableView, reportView } from "@blunderstruck/view";

/** Seconds between reloads while games are still being analysed. */
export const REFRESH_SECONDS = 30;

const day = (iso: string): string => iso.slice(0, 10);

/** Escapes text for HTML element content and for quoted attribute values. */
export function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only plain web links become `href`s; anything else is shown as text. */
function safeHref(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/** The URL path of one stored report. */
export function reportPath(periodEnd: string): string {
  return `/report/${encodeURIComponent(periodEnd)}`;
}

export const STYLE = `
:root { color-scheme: light dark; --fg: #1b1b1b; --bg: #ffffff; --muted: #5c5c5c; --line: #d6d6d6; --note: #fff6d6; --link: #0b57d0; }
@media (prefers-color-scheme: dark) {
  :root { --fg: #e8e8e8; --bg: #161616; --muted: #a8a8a8; --line: #3a3a3a; --note: #3a3218; --link: #8ab4f8; }
}
body { margin: 0 auto; max-width: 52rem; padding: 1rem 1rem 3rem; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--fg); background: var(--bg); }
a { color: var(--link); }
h1 { font-size: 1.5rem; margin: 1rem 0 0.25rem; }
h2 { font-size: 1.15rem; margin: 2rem 0 0.5rem; }
h3 { font-size: 1rem; margin: 1.25rem 0 0.25rem; }
p, ul, ol { margin: 0.4rem 0; }
.muted, nav { color: var(--muted); font-size: 0.9rem; }
.banner { background: var(--note); border: 1px solid var(--line); border-radius: 4px; padding: 0.6rem 0.8rem; margin: 1rem 0; }
.table { overflow-x: auto; }
table { border-collapse: collapse; margin: 0.5rem 0; font-variant-numeric: tabular-nums; }
th, td { border-bottom: 1px solid var(--line); padding: 0.3rem 0.6rem; text-align: right; white-space: nowrap; }
th:first-child, td:first-child { text-align: left; }
th { font-weight: 600; }
code { font: 0.85rem ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow-wrap: anywhere; }
`;

/** The CSP source that allows exactly the one stylesheet above and nothing else. */
export const STYLE_HASH = `'sha256-${createHash("sha256").update(STYLE).digest("base64")}'`;

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
}

function table(head: readonly string[], rows: readonly (readonly string[])[]): string {
  const th = head.map((h) => `<th scope="col">${esc(h)}</th>`).join("");
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("\n");
  return `<div class="table"><table><thead><tr>${th}</tr></thead><tbody>\n${body}\n</tbody></table></div>`;
}

function page(title: string, body: string, refresh: boolean): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    refresh ? `<meta http-equiv="refresh" content="${REFRESH_SECONDS}">` : "",
    `<title>${esc(title)}</title>`,
    `<style>${STYLE}</style>`,
    "</head>",
    "<body>",
    body,
    "</body>",
    "</html>",
    "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

const tableHtml = (t: TableView): string => table(t.head, t.rows);

function sectionHtml(s: SectionView | undefined): string | undefined {
  if (!s || s.lines.length === 0) return undefined;
  return `<h2>${esc(s.heading)}</h2>\n<ul>${s.lines.map((l) => `<li>${esc(l)}</li>`).join("\n")}</ul>`;
}

function exampleHtml(ex: ExampleView, games: PageOptions["games"]): string {
  const game = games?.get(ex.gameId);
  const opening = [game?.opening?.eco, game?.opening?.name].filter(Boolean).join(" ");
  let link = "";
  if (game) {
    const href = safeHref(game.platform === "lichess" ? `${game.url}#${ex.ply}` : game.url);
    if (href) link = ` <a href="${esc(href)}" rel="noreferrer">Open the game</a>`;
  }
  return [
    `<li>Position (FEN): <code>${esc(ex.position)}</code>`,
    `<br>${esc(ex.line)}${opening ? ` <span class="muted">[${esc(opening)}]</span>` : ""}${link}`,
    ex.evidence ? `<br><span class="muted">${esc(ex.evidence)}</span>` : "",
    "</li>",
  ].join("");
}

function focusHtml(item: FocusView, games: PageOptions["games"]): string {
  const out = [
    `<h3>${esc(`${item.number}. ${item.title}`)} <span class="muted">[${esc(item.patternName)}]</span></h3>`,
    `<p>${esc(item.why)}</p>`,
    `<p>${esc(`Drill: ${item.drill}`)}</p>`,
    `<p>${esc(item.reason)}</p>`,
    `<p>${esc(item.figures)}</p>`,
  ];
  if (item.examples.length > 0) {
    out.push("<p>Examples:</p>", `<ul>${item.examples.map((ex) => exampleHtml(ex, games)).join("\n")}</ul>`);
  }
  return out.join("\n");
}

function bodyHtml(v: ReportView, games: PageOptions["games"]): string {
  if (v.body.kind === "numbers") {
    return `<p>${esc(v.body.intro)}</p>\n<h2>${esc(v.body.heading)}</h2>\n${tableHtml(v.body.table)}`;
  }
  return [`<h2>${esc(v.body.heading)}</h2>`, ...v.body.items.map((i) => focusHtml(i, games))].join("\n");
}

function reportsNav(r: WeeklyReport, reports: PageOptions["reports"]): string | undefined {
  if (!reports || reports.length < 2) return undefined;
  const sorted = [...reports].sort((a, b) => Date.parse(b.periodEnd) - Date.parse(a.periodEnd));
  const items = sorted.map((x, i) => {
    const label = `${x.kind === "first" ? "First report" : "Week"} ending ${day(x.periodEnd)}${i === 0 ? " (latest)" : ""}`;
    if (Date.parse(x.periodEnd) === Date.parse(r.periodEnd)) return `<li>${esc(label)} (this one)</li>`;
    const href = i === 0 ? "/" : reportPath(x.periodEnd);
    return `<li><a href="${esc(href)}">${esc(label)}</a></li>`;
  });
  return `<h2>All reports</h2>\n<ul>${items.join("\n")}</ul>`;
}

function otherTracksHtml(others: PageOptions["otherTracks"]): string | undefined {
  if (!others || others.length === 0) return undefined;
  const items = others.map((o) => `<li>${esc(o.track.timeClass)}: <code>${esc(o.command)}</code></li>`);
  return `<h2>Your other time classes</h2>\n<p>This page shows one time class. To see another, stop this server and run:</p>\n<ul>${items.join("\n")}</ul>`;
}

const join = (parts: readonly (string | undefined)[]): string => parts.filter((p): p is string => p !== undefined).join("\n");

/** A plain page with a heading, a sentence and an optional command; used before there is a report to show. */
export function renderMessage(title: string, message: string, command?: string): string {
  return page(title, join([`<h1>${esc(title)}</h1>`, `<p>${esc(message)}</p>`, command ? `<p><code>${esc(command)}</code></p>` : undefined]), false);
}

function emptyPage(opts: PageOptions): string {
  const t = opts.track;
  const command = opts.reportCommand ?? (t ? `pnpm cli report ${t.platform} ${t.username}` : "pnpm cli report <platform> <user>");
  const who = t ? ` for ${t.username} (${t.platform})` : "";
  const body = join([
    `<h1>${esc(`No report yet${who}`)}</h1>`,
    "<p>Run the report command first, then reload this page:</p>",
    `<p><code>${esc(command)}</code></p>`,
    otherTracksHtml(opts.otherTracks),
  ]);
  return page("No report yet", body, false);
}

/**
 * The report as one HTML page: no scripts, inline styles, every value escaped. `pending` is
 * the number of games still waiting for analysis; `history` is the weekly stats of the track.
 */
export function renderPage(
  report: WeeklyReport | undefined,
  ctx: { pending: number; history: PeriodStats[] },
  opts: PageOptions = {},
): string {
  if (!report) return emptyPage(opts);
  const v = reportView(report, { pending: ctx.pending, ...(ctx.history.length > 0 ? { weeks: ctx.history } : {}) });
  const h = v.header;
  const body = join([
    `<h1>${esc(h.title)}</h1>`,
    `<p>${esc(h.band)}</p>`,
    `<p>${esc(h.period)}</p>`,
    `<p>${esc(h.games)}</p>`,
    v.coverage ? `<p class="banner" role="status">${esc(v.coverage)}</p>` : undefined,
    v.summary ? `<p>${esc(v.summary)}</p>` : undefined,
    bodyHtml(v, opts.games),
    sectionHtml(v.progress),
    sectionHtml(v.retired),
    `<h2>${esc(v.weeks.heading)}</h2>\n${tableHtml(v.weeks.table)}`,
    `<h2>${esc(v.trends.heading)}</h2>\n${v.trends.table ? tableHtml(v.trends.table) : `<p>${esc(v.trends.empty ?? "")}</p>`}`,
    sectionHtml(v.notes),
    reportsNav(report, opts.reports),
    otherTracksHtml(opts.otherTracks),
    '<nav><p><a href="/report.json">The latest report as JSON</a></p></nav>',
  ]);
  const title = `${report.player}: ${report.track.timeClass}, week ending ${day(report.periodEnd)}`;
  return page(title, body, v.provisional && (opts.latest ?? true));
}
