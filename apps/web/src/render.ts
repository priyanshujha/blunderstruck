import { createHash } from "node:crypto";
import {
  type FocusExample,
  type FocusItem,
  type GameRecord,
  type PatternProgress,
  type PeriodStats,
  type ProgressVerdict,
  type RetiredFocus,
  type Track,
  type WeeklyReport,
  focusTokenValues,
  renderText,
  summaryTokenValues,
} from "@blunderstruck/contracts";

// The wording below follows apps/cli/src/report-format.ts and patterns-format.ts line for line,
// so the page and the text report say the same thing. Apps do not import from each other.

const PATTERN_NAMES: Record<string, string> = {
  "missed-mate": "Missed a mate",
  "allowed-mate": "Walked into a mate",
  "hung-piece": "Left a piece hanging",
  "allowed-tactic": "Allowed a tactic",
  "missed-capture": "Missed a winning capture",
  "missed-tactic": "Missed a winning tactic",
  "thrown-win": "Let a winning position slip",
  "time-trouble": "Mistakes when short of time",
  "opening-trouble": "Same opening mistake again",
};
const patternName = (id: string): string => PATTERN_NAMES[id] ?? id;

/** Fewest games a report needs before it picks focus items. */
const MIN_GAMES_FOR_FOCUS = 10;
/** The persistence line is only worth saying when at least this many weeks were counted. */
const MIN_WEEKS_TO_QUOTE = 3;
/** Seconds between reloads while games are still being analysed. */
export const REFRESH_SECONDS = 30;

const VERDICT_WORDS: Record<ProgressVerdict, string> = {
  improved: "improved",
  flat: "no clear change",
  worse: "worse",
  "insufficient-data": "not enough games yet",
};

const RETIRED_WHY: Record<RetiredFocus["why"], string> = {
  graduated: "reached its target and stayed there",
  rotated: "worked on for a while, and another habit now costs more",
  outgrown: "no longer a priority at your rating band",
};

const BAND_SOURCE: Record<WeeklyReport["bandSource"], (r: WeeklyReport) => string> = {
  ratings: (r) =>
    r.rating === null ? "from the ratings in these games" : `from your median rating of ${r.rating} in these games`,
  override: () => "set by you",
  previous: () => "carried over from the last report, as these games carry no ratings",
  default: () => "assumed, as these games carry no ratings",
};

const f2 = (n: number): string => n.toFixed(2);
const f1 = (n: number): string => n.toFixed(1);
const count = (n: number): string => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`): string => `${count(n)} ${n === 1 ? one : many}`;
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

/** Model-written templates are validated before they are stored; if one still fails, show it as written. */
function tokens(template: string, values: Record<string, string>): string {
  try {
    return renderText(template, values);
  } catch {
    return template;
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

function headerHtml(r: WeeklyReport): string {
  const analysed = r.gamesAnalyzed === r.gamesFound ? "" : `, ${count(r.gamesAnalyzed)} analysed`;
  return [
    `<h1>${esc(`${r.kind === "first" ? "First report" : "Weekly report"} for ${r.player} (${r.track.platform}, ${r.track.timeClass})`)}</h1>`,
    `<p>${esc(`Rating band: ${r.band}, ${BAND_SOURCE[r.bandSource](r)}`)}</p>`,
    `<p>${esc(`Period: ${day(r.periodStart)} to ${day(r.periodEnd)}`)}</p>`,
    `<p>${esc(`Games: ${count(r.gamesFound)} found${analysed || ", all analysed"}`)}</p>`,
  ].join("\n");
}

function coverageHtml(r: WeeklyReport, pending: number): string | undefined {
  const { analysed, total, complete, sampleOnly } = r.coverage;
  if (complete) return undefined;
  const text = sampleOnly
    ? `Based on a sample of ${count(analysed)} of ${count(total)} games; run report again to analyse the rest.`
    : `Based on ${count(analysed)} of ${count(total)} games; ${count(pending)} still being analysed.`;
  return `<p class="banner" role="status">${esc(text)}</p>`;
}

function exampleHtml(ex: FocusExample, games: PageOptions["games"]): string {
  const better = ex.best ? `; better was ${ex.best}` : "";
  const parts = [`You played ${ex.played}${better} (-${f1(ex.winPctLoss)} win%)`];
  const why = [ex.evidence, ex.motif ? `motif: ${ex.motif}` : undefined].filter(Boolean).join("; ");
  if (why) parts.push(why);
  const game = games?.get(ex.gameId);
  const opening = [game?.opening?.eco, game?.opening?.name].filter(Boolean).join(" ");
  let link = "";
  if (game) {
    const href = safeHref(game.platform === "lichess" ? `${game.url}#${ex.ply}` : game.url);
    if (href) link = ` <a href="${esc(href)}" rel="noreferrer">Open the game</a>`;
  }
  return (
    `<li>${esc(parts.join(". "))}${opening ? ` <span class="muted">[${esc(opening)}]</span>` : ""}${link}` +
    `<br><span class="muted">Position (FEN):</span> <code>${esc(ex.fen)}</code></li>`
  );
}

function focusHtml(item: FocusItem, index: number, r: WeeklyReport, games: PageOptions["games"]): string {
  const values = focusTokenValues(item, r);
  const out = [
    `<h3>${esc(`${index + 1}. ${tokens(item.title, values)}`)} <span class="muted">[${esc(patternName(item.patternId))}]</span></h3>`,
    `<p>${esc(tokens(item.why, values))}</p>`,
    `<p>${esc(`Drill: ${tokens(item.drill, values)}`)}</p>`,
  ];

  const { weeksRecurred, weeksCounted, kind } = item.reason;
  const bits: string[] = [];
  if (weeksCounted >= MIN_WEEKS_TO_QUOTE) bits.push(`It came up in ${weeksRecurred} of your last ${weeksCounted} weeks.`);
  if (kind === "kept") bits.push(`Kept from your last report (since ${day(item.since)}).`);
  else if (kind === "returned") bits.push("Back on the list after a break.");
  else if (kind === "rose") bits.push("It has moved up the list.");
  else bits.push("New on your list.");
  out.push(`<p>${esc(bits.join(" "))}</p>`);

  const now = r.current.stats.find((s) => s.patternId === item.patternId);
  out.push(
    `<p>${esc(
      `Now ${f2(now?.per100Moves ?? 0)} per 100 moves; started at ${f2(item.baseline.per100Moves)}; target ${f2(item.target)}.`,
    )}</p>`,
  );
  if (item.examples.length > 0) {
    out.push("<p>Examples:</p>", `<ul>${item.examples.map((ex) => exampleHtml(ex, games)).join("\n")}</ul>`);
  }
  return out.join("\n");
}

function numbersHtml(r: WeeklyReport): string {
  const rows = r.current.stats.map((s) => [
    patternName(s.patternId),
    f2(s.per100Moves),
    String(s.occurrences),
    `${s.gamesAffected}/${s.games}`,
  ]);
  return `<h2>The numbers</h2>\n${table(["Pattern", "Per 100 moves", "Count", "Games"], rows)}`;
}

function progressHtml(progress: readonly PatternProgress[]): string {
  const items = progress.map((p) => {
    const p3 = p.pValue === null ? "" : `, p = ${p.pValue.toFixed(3)}`;
    return `<li>${esc(
      `${patternName(p.patternId)}: ${VERDICT_WORDS[p.verdict]} ` +
        `(${f2(p.previous.per100Moves)} before, ${f2(p.current.per100Moves)} now, per 100 moves${p3})`,
    )}</li>`;
  });
  return `<h2>Last report's focus, since then</h2>\n<ul>${items.join("\n")}</ul>`;
}

function retiredHtml(retired: readonly RetiredFocus[]): string {
  const items = retired.map(
    (x) =>
      `<li>${esc(
        `${patternName(x.patternId)}: ${RETIRED_WHY[x.why]}. ` +
          `${f2(x.baseline.per100Moves)} per 100 moves on ${day(x.since)}, ${f2(x.current.per100Moves)} now.`,
      )}</li>`,
  );
  return `<h2>Retired from your list</h2>\n<ul>${items.join("\n")}</ul>`;
}

/** Every stored week, oldest first; the report's own six weeks when nothing else is stored. */
function weeklyHtml(r: WeeklyReport, history: readonly PeriodStats[]): string {
  const weeks = history.length > 0 ? [...history].sort((a, b) => Date.parse(a.end) - Date.parse(b.end)) : [...r.weeks].reverse();
  const ids = r.focus.map((f) => f.patternId);
  const head = ["Week ending", "Games", "Mistakes /100", ...ids.map((id) => `${patternName(id)} /100`)];
  const rows = weeks.map((w) => [
    day(w.end),
    String(w.games),
    w.games === 0 ? "-" : f2(w.mistakesPer100Moves),
    ...ids.map((id) => {
      const s = w.stats.find((x) => x.patternId === id);
      return w.games === 0 || !s ? "-" : f2(s.per100Moves);
    }),
  ]);
  return `<h2>Week by week (rates per 100 moves)</h2>\n${table(head, rows)}`;
}

function trendsHtml(r: WeeklyReport): string {
  if (r.trends.length === 0) return "<h2>All patterns</h2>\n<p>No earlier games to compare with yet.</p>";
  const rows = r.trends.map((t) => [
    patternName(t.patternId),
    f2(t.previous.per100Moves),
    f2(t.current.per100Moves),
    VERDICT_WORDS[t.verdict],
    t.pValue === null ? "-" : t.pValue.toFixed(3),
  ]);
  return (
    "<h2>All patterns against the 30 days before this period (rates per 100 moves)</h2>\n" +
    table(["Pattern", "Before", "Now", "Verdict", "p"], rows)
  );
}

function notesHtml(r: WeeklyReport, showFewGames: boolean): string | undefined {
  const out: string[] = [];
  for (const n of r.notes) {
    if (n === "few-games") {
      if (showFewGames) out.push(`Fewer than ${MIN_GAMES_FOR_FOCUS} games in this period, so no focus items were picked.`);
    } else if (n === "no-key") {
      out.push("No model key was set, so the wording comes from built-in templates.");
    } else if (n === "model-failed") {
      out.push("The model did not give usable wording, so the text comes from built-in templates.");
    } else if (n === "settings-changed") {
      out.push("Analysis settings changed since the last report. Games were analysed again; older reports were left as they were.");
    } else if (n === "sample-only") {
      out.push("Stopped after the sample, as asked; run report again to analyse the rest.");
    }
  }
  if (out.length === 0) return undefined;
  return `<h2>Notes</h2>\n<ul>${out.map((n) => `<li>${esc(n)}</li>`).join("\n")}</ul>`;
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

function emptyPage(opts: PageOptions): string {
  const t = opts.track;
  const command = opts.reportCommand ?? (t ? `pnpm cli report ${t.platform} ${t.username}` : "pnpm cli report <platform> <user>");
  const who = t ? ` for ${t.username} (${t.platform})` : "";
  const body = [
    `<h1>${esc(`No report yet${who}`)}</h1>`,
    "<p>Run the report command first, then reload this page:</p>",
    `<p><code>${esc(command)}</code></p>`,
    otherTracksHtml(opts.otherTracks),
  ];
  return page("No report yet", body.filter((x): x is string => x !== undefined).join("\n"), false);
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
  const r = report;
  const parts: (string | undefined)[] = [headerHtml(r)];

  const provisional = !r.coverage.complete && !r.coverage.sampleOnly;
  parts.push(coverageHtml(r, ctx.pending));

  const summary = tokens(r.summary, summaryTokenValues(r)).trim();
  if (summary) parts.push(`<p>${esc(summary)}</p>`);

  const numbersOnly = r.focus.length === 0;
  if (numbersOnly) {
    const fewGames = r.notes.includes("few-games") || r.gamesFound < MIN_GAMES_FOR_FOCUS;
    parts.push(
      `<p>${esc(
        fewGames
          ? `Too few games to pick focus items (${plural(r.gamesFound, "game")} found, at least ${MIN_GAMES_FOR_FOCUS} needed). Here are the numbers.`
          : "No habit repeated often enough to pick a focus item this week. Here are the numbers.",
      )}</p>`,
      numbersHtml(r),
    );
  } else {
    parts.push(`<h2>${esc(r.focus.length === 1 ? "Focus" : `Focus (${r.focus.length} things)`)}</h2>`);
    r.focus.forEach((item, i) => parts.push(focusHtml(item, i, r, opts.games)));
  }

  if (r.progress.length > 0) parts.push(progressHtml(r.progress));
  if (r.retired.length > 0) parts.push(retiredHtml(r.retired));
  parts.push(weeklyHtml(r, ctx.history));
  parts.push(trendsHtml(r));
  parts.push(notesHtml(r, !numbersOnly));
  parts.push(reportsNav(r, opts.reports));
  parts.push(otherTracksHtml(opts.otherTracks));
  parts.push('<nav><p><a href="/report.json">The latest report as JSON</a></p></nav>');

  const title = `${r.player}: ${r.track.timeClass}, week ending ${day(r.periodEnd)}`;
  const refresh = provisional && (opts.latest ?? true);
  return page(title, parts.filter((p): p is string => p !== undefined).join("\n"), refresh);
}
