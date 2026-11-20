import {
  type FocusExample,
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
import { patternName } from "./names";

/** A table as text cells; the first column is a label, the rest are figures. */
export interface TableView {
  head: string[];
  rows: string[][];
}

export interface ExampleView {
  gameId: string;
  ply: number;
  /** FEN of the position before the move. */
  position: string;
  played: string;
  better?: string;
  /** "-32.4 win%". */
  loss: string;
  /** "You played Qxf7; better was Nf3 (-32.4 win%)". */
  line: string;
  /** The detector's own words and the motif, when there are any. */
  evidence?: string;
}

export interface FocusView {
  patternId: string;
  patternName: string;
  /** 1-based. */
  number: number;
  title: string;
  why: string;
  drill: string;
  /** How often it came back and why it is on the list. */
  reason: string;
  now: string;
  started: string;
  target: string;
  /** "Now 2.10 per 100 moves; started at 3.00; target 2.25." */
  figures: string;
  examples: ExampleView[];
}

export interface SectionView {
  heading: string;
  lines: string[];
}

export interface ReportView {
  header: { title: string; band: string; period: string; games: string };
  /** The provisional or sample-only line; absent once every game is analysed. */
  coverage?: string;
  /** Games are still being analysed (not stopped after a sample on request). */
  provisional: boolean;
  pending: number;
  summary?: string;
  /** Focus items, or the numbers when there are none. */
  body:
    | { kind: "focus"; heading: string; items: FocusView[] }
    | { kind: "numbers"; heading: string; intro: string; table: TableView };
  progress?: SectionView;
  retired?: SectionView;
  weeks: { heading: string; table: TableView };
  trends: { heading: string; table?: TableView; empty?: string };
  notes: SectionView;
}

export interface ReportViewOptions {
  /** Games still waiting for analysis. Defaults to `coverage.total - coverage.analysed`. */
  pending?: number;
  /** Weeks for the week table, any order. Defaults to the report's own six weeks. */
  weeks?: readonly PeriodStats[];
}

/** Stands in for a stored template that no longer renders. */
export const UNSHOWN_WORDING = "Wording for this item could not be shown.";
export const UNSHOWN_SUMMARY = "The summary could not be shown.";
export const UNSHOWN_NOTE = "Some stored wording could not be shown, so a plain sentence stands in its place.";
export const NO_DATA = "no data";

/** The persistence sentence is only worth saying when at least this many weeks were counted. */
const MIN_WEEKS_TO_QUOTE = 3;

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

const statOf = (stats: readonly PatternStat[], id: string): PatternStat | undefined =>
  stats.find((s) => s.patternId === id);

/** Renders a stored template, or reports that it could not be. */
function tryRender(template: string, values: Record<string, string>): string | undefined {
  try {
    return renderText(template, values);
  } catch {
    return undefined;
  }
}

function exampleView(ex: FocusExample): ExampleView {
  const loss = `-${f1(ex.winPctLoss)} win%`;
  const better = ex.best ? `; better was ${ex.best}` : "";
  const evidence = [ex.evidence, ex.motif ? `motif: ${ex.motif}` : undefined].filter(Boolean).join("; ");
  return {
    gameId: ex.gameId,
    ply: ex.ply,
    position: ex.fen,
    played: ex.played,
    ...(ex.best ? { better: ex.best } : {}),
    loss,
    line: `You played ${ex.played}${better} (${loss})`,
    ...(evidence ? { evidence } : {}),
  };
}

function focusView(item: FocusItem, index: number, r: WeeklyReport, failed: () => void): FocusView {
  const stat = statOf(r.current.stats, item.patternId);
  const values: Record<string, string> = focusTokenValues(item, r);
  if (!stat) {
    // Without this period's stat these would be made-up zeros; a template that uses them falls back.
    delete values.gamesAffected;
    delete values.occurrences;
    delete values.rate;
  }
  const text = (template: string): string => {
    const out = tryRender(template, values);
    if (out === undefined) {
      failed();
      return UNSHOWN_WORDING;
    }
    return out;
  };

  const { weeksRecurred, weeksCounted, kind } = item.reason;
  const bits: string[] = [];
  if (weeksCounted >= MIN_WEEKS_TO_QUOTE) bits.push(`It came up in ${weeksRecurred} of your last ${weeksCounted} weeks.`);
  if (kind === "kept") bits.push(`Kept from your last report (since ${day(item.since)}).`);
  else if (kind === "returned") bits.push("Back on the list after a break.");
  else if (kind === "rose") bits.push("It has moved up the list.");
  else bits.push("New on your list.");

  const now = stat ? f2(stat.per100Moves) : NO_DATA;
  const started = f2(item.baseline.per100Moves);
  const target = f2(item.target);
  const figures = stat
    ? `Now ${now} per 100 moves; started at ${started}; target ${target}.`
    : `Now: ${NO_DATA} this period; started at ${started} per 100 moves; target ${target}.`;

  return {
    patternId: item.patternId,
    patternName: patternName(item.patternId),
    number: index + 1,
    title: text(item.title),
    why: text(item.why),
    drill: text(item.drill),
    reason: bits.join(" "),
    now,
    started,
    target,
    figures,
    examples: item.examples.map(exampleView),
  };
}

function progressLine(p: PatternProgress): string {
  const p3 = p.pValue === null ? "" : `, p = ${p.pValue.toFixed(3)}`;
  return (
    `${patternName(p.patternId)}: ${VERDICT_WORDS[p.verdict]} ` +
    `(${f2(p.previous.per100Moves)} before, ${f2(p.current.per100Moves)} now, per 100 moves${p3})`
  );
}

function retiredLine(x: RetiredFocus): string {
  return (
    `${patternName(x.patternId)}: ${RETIRED_WHY[x.why]}. ` +
    `${f2(x.baseline.per100Moves)} per 100 moves on ${day(x.since)}, ${f2(x.current.per100Moves)} now.`
  );
}

function weekTable(r: WeeklyReport, weeks: readonly PeriodStats[]): TableView {
  const ids = r.focus.map((f) => f.patternId);
  const sorted = [...weeks].sort((a, b) => Date.parse(a.end) - Date.parse(b.end));
  return {
    head: ["Week ending", "Games", "Mistakes /100", ...ids.map((id) => `${patternName(id)} /100`)],
    rows: sorted.map((w) => [
      day(w.end),
      count(w.games),
      w.games === 0 ? "-" : f2(w.mistakesPer100Moves),
      ...ids.map((id) => {
        if (w.games === 0) return "-";
        const s = statOf(w.stats, id);
        return s ? f2(s.per100Moves) : NO_DATA;
      }),
    ]),
  };
}

function noteLines(r: WeeklyReport, fewGamesSaid: boolean, wordingFailed: boolean): string[] {
  const out: string[] = [];
  for (const n of r.notes) {
    if (n === "few-games") {
      if (!fewGamesSaid) out.push("Too few games in this period, so no focus items were picked.");
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
  if (wordingFailed) out.push(UNSHOWN_NOTE);
  return out;
}

/** Every sentence and figure a report shows, ready to lay out as text or HTML. Never throws on stored wording. */
export function reportView(report: WeeklyReport, opts: ReportViewOptions = {}): ReportView {
  const r = report;
  let wordingFailed = false;
  const failed = (): void => {
    wordingFailed = true;
  };

  const analysedPart = r.gamesAnalyzed === r.gamesFound ? ", all analysed" : `, ${count(r.gamesAnalyzed)} analysed`;
  const header = {
    title: `${r.kind === "first" ? "First report" : "Weekly report"} for ${r.player} (${r.track.platform}, ${r.track.timeClass})`,
    band: `Rating band: ${r.band}, ${BAND_SOURCE[r.bandSource](r)}`,
    period: `Period: ${day(r.periodStart)} to ${day(r.periodEnd)}`,
    games: `Games: ${count(r.gamesFound)} found${analysedPart}`,
  };

  const { analysed, total, complete, sampleOnly } = r.coverage;
  const pending = complete ? 0 : (opts.pending ?? Math.max(0, total - analysed));
  const coverage = complete
    ? undefined
    : sampleOnly
      ? `Based on a sample of ${count(analysed)} of ${count(total)} games; run report again to analyse the rest.`
      : `Based on ${count(analysed)} of ${count(total)} games; ${count(pending)} still being analysed.`;

  let summary = tryRender(r.summary, summaryTokenValues(r))?.trim();
  if (summary === undefined) {
    failed();
    summary = UNSHOWN_SUMMARY;
  }

  const fewGames = r.focus.length === 0 && r.notes.includes("few-games");
  let body: ReportView["body"];
  if (r.focus.length === 0) {
    body = {
      kind: "numbers",
      heading: "The numbers",
      intro: fewGames
        ? `Too few games to pick focus items (${plural(r.gamesFound, "game")} found). Here are the numbers.`
        : "No habit repeated often enough to pick a focus item this week. Here are the numbers.",
      table: {
        head: ["Pattern", "Per 100 moves", "Count", "Games"],
        rows: r.current.stats.map((s) => [
          patternName(s.patternId),
          f2(s.per100Moves),
          count(s.occurrences),
          `${s.gamesAffected}/${s.games}`,
        ]),
      },
    };
  } else {
    body = {
      kind: "focus",
      heading: r.focus.length === 1 ? "Focus" : `Focus (${r.focus.length} things)`,
      items: r.focus.map((item, i) => focusView(item, i, r, failed)),
    };
  }

  const trends: ReportView["trends"] =
    r.trends.length === 0
      ? { heading: "All patterns", empty: "No earlier games to compare with yet." }
      : {
          heading: "All patterns against the 30 days before this period (rates per 100 moves)",
          table: {
            head: ["Pattern", "Before", "Now", "Verdict", "p"],
            rows: r.trends.map((t) => [
              patternName(t.patternId),
              f2(t.previous.per100Moves),
              f2(t.current.per100Moves),
              VERDICT_WORDS[t.verdict],
              t.pValue === null ? "-" : t.pValue.toFixed(3),
            ]),
          },
        };

  return {
    header,
    ...(coverage ? { coverage } : {}),
    provisional: !complete && !sampleOnly,
    pending,
    ...(summary ? { summary } : {}),
    body,
    ...(r.progress.length > 0
      ? { progress: { heading: "Last report's focus, since then", lines: r.progress.map(progressLine) } }
      : {}),
    ...(r.retired.length > 0 ? { retired: { heading: "Retired from your list", lines: r.retired.map(retiredLine) } } : {}),
    weeks: { heading: "Week by week (rates per 100 moves)", table: weekTable(r, opts.weeks ?? r.weeks) },
    trends,
    notes: { heading: "Notes", lines: noteLines(r, fewGames, wordingFailed) },
  };
}
