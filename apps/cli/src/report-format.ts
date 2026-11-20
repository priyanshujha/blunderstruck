import type { WeeklyReport } from "@blunderstruck/contracts";
import { type ExampleView, type FocusView, type ReportView, type StoryTag, type TableView, reportView } from "@blunderstruck/view";

export interface ReportFormatOptions {
  /** Games of the period still waiting to be analysed. Defaults to `coverage.total - coverage.analysed`. */
  pending?: number;
  /**
   * The precise figures: rates per 100 moves in place of the counts in games, the week-by-week
   * table on a weekly report, all nine trends, the positions and the engine's own words.
   */
  all?: boolean;
}

const TAG_WORD: Record<StoryTag, string> = { you: "You", they: "They", then: "Then", better: "Better" };

function formatTable({ head, rows }: TableView): string[] {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const fmt = (r: string[]): string =>
    r.map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!))).join("  ").trimEnd();
  return [fmt(head), ...rows.map(fmt)];
}

function exampleLines(ex: ExampleView, all: boolean): string[] {
  const out = [all ? `   - Position (FEN): ${ex.position}` : `   - ${ex.moveLabel}`];
  if (ex.story) {
    for (const l of ex.story) out.push(`     ${TAG_WORD[l.tag]}: ${l.text}`);
    if (ex.cost) out.push(`     ${ex.cost.text}${all ? ` ${ex.cost.detail}` : ""}`);
    if (all) out.push(`     ${ex.line}`);
  } else {
    out.push(`     ${ex.line}`);
  }
  if (ex.evidence && (all || !ex.story)) out.push(`     ${ex.evidence}`);
  return out;
}

function focusLines(item: FocusView, all: boolean, v: ReportView): string[] {
  const out = [`${item.number}. ${item.title} [${item.patternName}]`, `   ${item.why}`];
  if (all) out.push(`   ${item.figures}`);
  else out.push(`   ${item.frequency}`, `   ${item.goalLine} ${item.standing}`);
  out.push(`   ${item.reason}`);

  if (item.blindSpots.length > 0) {
    if (item.blindSpotsIntro) out.push(`   ${item.blindSpotsIntro}`);
    for (const b of item.blindSpots) out.push(`   - ${b.sentence}${b.refinement ? ` ${b.refinement}` : ""}`);
  }
  if (item.steps.length > 0) {
    out.push("   The habit to build:");
    item.steps.forEach((s, i) => out.push(`   ${i + 1}. ${s.text}`));
  }
  out.push(`   Drill: ${item.drill}`);

  if (!all && item.weeks.length > 0) {
    out.push(`   ${v.weeksInGames} (goal: ${item.goalText}):`);
    for (const w of item.weeks) out.push(`   - ${w.label}: ${w.text}`);
  }
  if (item.examples.length > 0) {
    out.push("   Examples:");
    for (const ex of item.examples) out.push(...exampleLines(ex, all));
  }
  return out;
}

/**
 * The human-readable weekly report: focus items first, in games and words. `all` gives the
 * precise figures instead (rates per 100 moves) and the per-pattern detail.
 */
export function formatReport(report: WeeklyReport, opts: ReportFormatOptions = {}): string {
  const all = opts.all ?? false;
  const v = reportView(report, opts.pending === undefined ? {} : { pending: opts.pending });
  const { header } = v;
  const out: string[] = [header.title, header.band, header.period, header.games];

  if (v.coverage) out.push("", v.coverage);
  if (v.summary) out.push("", v.summary);

  if (v.body.kind === "numbers") {
    out.push("", v.body.intro, "", v.body.heading);
    if (all) out.push(...formatTable(v.body.table));
    else out.push(...v.body.lines.map((l) => `- ${l}`));
  } else {
    out.push("", v.body.heading);
    for (const item of v.body.items) out.push(...focusLines(item, all, v));
  }

  for (const section of all ? [v.progress, v.retired] : [v.progressInGames, v.retiredInGames]) {
    if (section) out.push("", section.heading, ...section.lines.map((l) => `- ${l}`));
  }
  if (all && v.body.kind === "focus") {
    out.push("", v.weeks.heading, ...formatTable(v.weeks.table));
  }
  if (all) {
    out.push("", v.trends.heading, ...(v.trends.table ? formatTable(v.trends.table) : [v.trends.empty ?? ""]));
  }
  if (v.notes.lines.length > 0) out.push("", v.notes.heading, ...v.notes.lines.map((n) => `- ${n}`));

  return out.join("\n");
}
