import type { WeeklyReport } from "@blunderstruck/contracts";
import { type FocusView, type TableView, reportView } from "@blunderstruck/view";

export interface ReportFormatOptions {
  /** Games of the period still waiting to be analysed. Defaults to `coverage.total - coverage.analysed`. */
  pending?: number;
  /** Also print the week-by-week table on a weekly report and all nine trends. */
  all?: boolean;
}

function formatTable({ head, rows }: TableView): string[] {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const fmt = (r: string[]): string =>
    r.map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!))).join("  ").trimEnd();
  return [fmt(head), ...rows.map(fmt)];
}

function focusLines(item: FocusView): string[] {
  const out = [
    `${item.number}. ${item.title} [${item.patternName}]`,
    `   ${item.why}`,
    `   Drill: ${item.drill}`,
    `   ${item.reason}`,
    `   ${item.figures}`,
  ];
  if (item.examples.length > 0) {
    out.push("   Examples:");
    for (const ex of item.examples) {
      out.push(`   - Position (FEN): ${ex.position}`);
      out.push(`     ${ex.line}`);
      if (ex.evidence) out.push(`     ${ex.evidence}`);
    }
  }
  return out;
}

/** The human-readable weekly report: focus items first, the week-by-week and per-pattern detail only when asked for. */
export function formatReport(report: WeeklyReport, opts: ReportFormatOptions = {}): string {
  const v = reportView(report, opts.pending === undefined ? {} : { pending: opts.pending });
  const { header } = v;
  const out: string[] = [header.title, header.band, header.period, header.games];

  if (v.coverage) out.push("", v.coverage);
  if (v.summary) out.push("", v.summary);

  if (v.body.kind === "numbers") {
    out.push("", v.body.intro, "", v.body.heading, ...formatTable(v.body.table));
  } else {
    out.push("", v.body.heading);
    for (const item of v.body.items) out.push(...focusLines(item));
  }

  for (const section of [v.progress, v.retired]) {
    if (section) out.push("", section.heading, ...section.lines.map((l) => `- ${l}`));
  }
  if ((report.kind === "first" || opts.all) && v.body.kind === "focus") {
    out.push("", v.weeks.heading, ...formatTable(v.weeks.table));
  }
  if (opts.all) {
    out.push("", v.trends.heading, ...(v.trends.table ? formatTable(v.trends.table) : [v.trends.empty ?? ""]));
  }
  if (v.notes.lines.length > 0) out.push("", v.notes.heading, ...v.notes.lines.map((n) => `- ${n}`));

  return out.join("\n");
}
