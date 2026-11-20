import {
  type FocusItem,
  type PatternProgress,
  type PatternStat,
  type PeriodStats,
  type ProgressVerdict,
  type RetiredFocus,
  type WeeklyReport,
  focusTokenValues,
  renderText,
  summaryTokenValues,
} from "@blunderstruck/contracts";
import { patternName } from "./patterns-format";

export interface ReportFormatOptions {
  /** Games of the period still waiting to be analysed. Defaults to `coverage.total - coverage.analysed`. */
  pending?: number;
  /** Also print the week-by-week table on a weekly report and all nine trends. */
  all?: boolean;
}

/** Fewest games a report needs before it picks focus items (the plan's `MIN_REPORT_GAMES`). */
const MIN_GAMES_FOR_FOCUS = 10;
/** The persistence line is only worth saying when at least this many weeks were counted. */
const MIN_WEEKS_TO_QUOTE = 3;

const f2 = (n: number): string => n.toFixed(2);
const f1 = (n: number): string => n.toFixed(1);
const count = (n: number): string => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`): string => `${count(n)} ${n === 1 ? one : many}`;
const day = (iso: string): string => iso.slice(0, 10);

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

function formatTable(head: string[], rows: string[][]): string[] {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const fmt = (r: string[]): string =>
    r.map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!))).join("  ").trimEnd();
  return [fmt(head), ...rows.map(fmt)];
}

function headerLines(r: WeeklyReport): string[] {
  const analysed = r.gamesAnalyzed === r.gamesFound ? "" : `, ${count(r.gamesAnalyzed)} analysed`;
  return [
    `${r.kind === "first" ? "First report" : "Weekly report"} for ${r.player} (${r.track.platform}, ${r.track.timeClass})`,
    `Rating band: ${r.band}, ${BAND_SOURCE[r.bandSource](r)}`,
    `Period: ${day(r.periodStart)} to ${day(r.periodEnd)}`,
    `Games: ${count(r.gamesFound)} found${analysed || ", all analysed"}`,
  ];
}

function coverageLine(r: WeeklyReport, pending: number | undefined): string | undefined {
  const { analysed, total, complete, sampleOnly } = r.coverage;
  if (complete) return undefined;
  if (sampleOnly) {
    return `Based on a sample of ${count(analysed)} of ${count(total)} games; run report again to analyse the rest.`;
  }
  const left = pending ?? Math.max(0, total - analysed);
  return `Based on ${count(analysed)} of ${count(total)} games; ${count(left)} still analysing.`;
}

function statLine(s: PatternStat | undefined): string {
  return s ? `${f2(s.per100Moves)} per 100 moves` : "no data";
}

function focusLines(item: FocusItem, index: number, r: WeeklyReport): string[] {
  const values = focusTokenValues(item, r);
  const out = [`${index + 1}. ${renderText(item.title, values)}  [${patternName(item.patternId)}]`];
  out.push(`   ${renderText(item.why, values)}`);
  out.push(`   Drill: ${renderText(item.drill, values)}`);

  const { weeksRecurred, weeksCounted, kind } = item.reason;
  const bits: string[] = [];
  if (weeksCounted >= MIN_WEEKS_TO_QUOTE) {
    bits.push(`It came up in ${weeksRecurred} of your last ${weeksCounted} weeks.`);
  }
  if (kind === "kept") bits.push(`Kept from your last report (since ${day(item.since)}).`);
  else if (kind === "returned") bits.push("Back on the list after a break.");
  else if (kind === "rose") bits.push("It has moved up the list.");
  else bits.push("New on your list.");
  out.push(`   ${bits.join(" ")}`);

  const now = r.current.stats.find((s) => s.patternId === item.patternId);
  out.push(
    `   Now ${f2(now?.per100Moves ?? 0)} per 100 moves; started at ${f2(item.baseline.per100Moves)}; ` +
      `target ${f2(item.target)}.`,
  );

  if (item.examples.length > 0) {
    out.push("   Examples:");
    for (const ex of item.examples) {
      out.push(`   - Position (FEN): ${ex.fen}`);
      const better = ex.best ? `; better was ${ex.best}` : "";
      out.push(`     You played ${ex.played}${better} (-${f1(ex.winPctLoss)} win%)`);
    }
  }
  return out;
}

function progressLines(progress: readonly PatternProgress[]): string[] {
  const out = ["Last report's focus, since then"];
  for (const p of progress) {
    const p3 = p.pValue === null ? "" : `, p = ${p.pValue.toFixed(3)}`;
    out.push(
      `- ${patternName(p.patternId)}: ${VERDICT_WORDS[p.verdict]} ` +
        `(${f2(p.previous.per100Moves)} before, ${f2(p.current.per100Moves)} now, per 100 moves${p3})`,
    );
  }
  return out;
}

function retiredLines(retired: readonly RetiredFocus[]): string[] {
  const out = ["Retired from your list"];
  for (const x of retired) {
    out.push(
      `- ${patternName(x.patternId)}: ${RETIRED_WHY[x.why]}. ` +
        `${f2(x.baseline.per100Moves)} per 100 moves on ${day(x.since)}, ${f2(x.current.per100Moves)} now.`,
    );
  }
  return out;
}

function weeklyTable(r: WeeklyReport): string[] {
  const ids = r.focus.map((f) => f.patternId);
  const head = ["Week ending", "Games", ...ids.map((id) => `${patternName(id)} /100`)];
  // Weeks are stored newest first; read them oldest first.
  const rows = [...r.weeks].reverse().map((w: PeriodStats) => [
    day(w.end),
    String(w.games),
    ...ids.map((id) => {
      const s = w.stats.find((x) => x.patternId === id);
      return w.games === 0 || !s ? "-" : f2(s.per100Moves);
    }),
  ]);
  return ["Week by week (rates per 100 moves)", ...formatTable(head, rows)];
}

function trendLines(r: WeeklyReport): string[] {
  if (r.trends.length === 0) return ["All patterns", "No earlier games to compare with yet."];
  const rows = r.trends.map((t) => [
    patternName(t.patternId),
    f2(t.previous.per100Moves),
    f2(t.current.per100Moves),
    VERDICT_WORDS[t.verdict],
    t.pValue === null ? "-" : t.pValue.toFixed(3),
  ]);
  return [
    "All patterns against the 30 days before this period (rates per 100 moves)",
    ...formatTable(["Pattern", "Before", "Now", "Verdict", "p"], rows),
  ];
}

function numbersTable(r: WeeklyReport): string[] {
  const rows = r.current.stats.map((s) => [
    patternName(s.patternId),
    f2(s.per100Moves),
    String(s.occurrences),
    `${s.gamesAffected}/${s.games}`,
  ]);
  return ["The numbers", ...formatTable(["Pattern", "Per 100 moves", "Count", "Games"], rows)];
}

function noteLines(r: WeeklyReport, showFewGames: boolean): string[] {
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
  return out;
}

/** The human-readable weekly report: focus items first, the week-by-week and per-pattern detail only when asked for. */
export function formatReport(report: WeeklyReport, opts: ReportFormatOptions = {}): string {
  const out: string[] = [...headerLines(report)];

  const provisional = coverageLine(report, opts.pending);
  if (provisional) out.push("", provisional);

  const summary = renderText(report.summary, summaryTokenValues(report)).trim();
  if (summary) out.push("", summary);

  const numbersOnly = report.focus.length === 0;
  if (numbersOnly) {
    const fewGames = report.notes.includes("few-games") || report.gamesFound < MIN_GAMES_FOR_FOCUS;
    out.push(
      "",
      fewGames
        ? `Too few games to pick focus items (${plural(report.gamesFound, "game")} found, at least ${MIN_GAMES_FOR_FOCUS} needed). Here are the numbers.`
        : "No habit repeated often enough to pick a focus item this week. Here are the numbers.",
      "",
      ...numbersTable(report),
    );
  } else {
    out.push("", report.focus.length === 1 ? "Focus" : `Focus (${report.focus.length} things)`);
    report.focus.forEach((item, i) => out.push(...focusLines(item, i, report)));
  }

  if (report.progress.length > 0) out.push("", ...progressLines(report.progress));
  if (report.retired.length > 0) out.push("", ...retiredLines(report.retired));
  if ((report.kind === "first" || opts.all) && report.focus.length > 0) out.push("", ...weeklyTable(report));
  if (opts.all) out.push("", ...trendLines(report));

  const notes = noteLines(report, !numbersOnly);
  if (notes.length > 0) out.push("", "Notes", ...notes.map((n) => `- ${n}`));

  return out.join("\n");
}
