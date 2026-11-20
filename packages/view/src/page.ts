import {
  type BlindSpot,
  type ExampleStory,
  type FocusExample,
  type MoveDetail,
  type PatternStat,
  type ProgressVerdict,
  type Track,
  type WeeklyReport,
  blindSpotFamilyOf,
  blindSpotInfo,
} from "@blunderstruck/contracts";
import { REFINEMENT_PHRASES, patternName } from "./names";
import { type StoryLine, type StoryMove, type StorySegment, type StoryTag, keyMove } from "./story";
import { exampleTitle, motifChip } from "./titles";
import type { FocusView, ReportView, TableView } from "./view";
import { gamesPhrase, gamesShort } from "./view";

/*
 * The report page's own text: everything it shows beyond the fields the terminal shares, worded
 * and counted here so the page only lays out. Each field says when it is present.
 */

/** Where a report stands: done, a sample stopped on request, games waiting for their first look, the deeper check running, or only earlier weeks left. */
export type PageStage = "complete" | "sample" | "analysing" | "checking" | "finishing";

/** A run of text, strong when it is the number the sentence is about. */
export interface TextRun {
  text: string;
  strong?: boolean;
}

export interface PageBanner {
  /** "Deeper check running:". */
  lead: string;
  /** The view's coverage sentence. */
  text: string;
  /** Said only on wide screens. */
  wide?: string;
  /** The share of games done, for the progress bar, with its text alternative. */
  bar?: { share: number; label: string };
}

export interface PageLine {
  tag: StoryTag;
  /** "You", "They", "Then" or "Better". */
  who: string;
  /** The story line's segments, its first letter capitalised. */
  segments: StorySegment[];
  /** The moves the line tells, in notation: all of them, or the better line's first. */
  notation?: string;
  /** The motif chip, on the line that tells the key move. */
  chip?: string;
}

export interface PageExample {
  title?: string;
  /** "Move 22, you had White". */
  moveLabel: string;
  /** "Shows blind spot" or "Shows blind spots", when there are chips. */
  chipsLabel?: string;
  /** The item's blind spots this example shows, numbered as their rows in the routine (`step` is 0-based). */
  chips: { number: string; label: string; step: number }[];
  /** The example has a story and a position a board can be drawn from. */
  hasBoard: boolean;
  /** The board's text alternative: only the arrows it draws. */
  boardLabel?: string;
  lines: PageLine[];
  cost?: StorySegment[];
  /** For an example stored without a story: its one plain line. */
  plain?: string;
}

export interface PageStep {
  /** "Blind spot 1". */
  spotLabel: string;
  /** "Step 1". */
  stepLabel: string;
  name: string;
  /** "11" and "of your 27". */
  count?: string;
  of?: string;
  /** The bar: `count / of`, and the tick at the share of all the player's mistakes. */
  bar?: { share: number; tick?: number; label: string };
  comparison?: string;
  refinement?: string;
  text: string;
  /** The example (0-based) "See one on the board" points at, and the link's words. */
  example?: number;
  exampleLink?: string;
}

export interface PageChart {
  /** The top line's share of games: a half, or all of them when a week is over half. */
  top: number;
  topText: string;
  goalShare: number;
  /** "goal: at most 1 game in 4". */
  goalKey: string;
  /** The chart's text alternative. */
  label: string;
  /** Oldest first. `share` is null when the week has no bar; `outline` when its week was too small to count. */
  bars: { share: number | null; outline: boolean; value: string; label: string }[];
  note: string;
}

export interface PageTrack {
  start: string;
  goal: string;
  /** Where the marker stands between start (0) and goal (1). */
  share: number;
  improved: boolean;
  label: string;
}

export interface PageItem {
  /** "1". */
  number: string;
  /** "focus 1", the mark in the counted list. */
  mark: string;
  /** "22 of 64 games", for the index row. */
  index?: string;
  /** "22" over "of your 64 games". */
  count?: string;
  ofGames?: string;
  /** One dot per game: those within the goal, those over it (ringed), the rest. */
  dots?: { games: number; affected: number; over: number; label: string };
  /** "Ringed: the 6 games over the goal." */
  overText?: string;
  verdict?: { verdict: ProgressVerdict; text: string };
  /** Start to goal, on a kept item: in words on the card, with the counts in the section. */
  cardTrack?: PageTrack;
  sectionTrack?: PageTrack;
  /** "The routine: three steps". */
  routineLink: string;
  /** "See it on the board", or "See the example" when the first example has no board; absent without examples. */
  exampleLink?: string;
  habitTitle: string;
  /** "The habit to build", when the title is not already that. */
  habitLabel?: string;
  /** "Each step answers … Looking at all 27 times in your last 64 games:". */
  habitIntro?: string;
  steps: PageStep[];
  /** "Then, the drill behind all three"; absent with no steps. */
  drillLabel?: string;
  /** "Two from your own games"; absent without examples. */
  examplesHeading?: string;
  examples: PageExample[];
  chart?: PageChart;
}

export interface PageText {
  stage: PageStage;
  /** Boards may play by themselves: only once nothing will change under them. */
  autoplay: boolean;
  /** "mossy_gambit · Lichess · rapid". */
  masthead: string;
  eyebrow: string;
  headline: string;
  lede: TextRun[];
  /** Said after the lede on wide screens only. */
  ledeWide?: string;
  banner?: PageBanner;
  /** The stored summary is shown (not when nothing was picked). */
  showSummary: boolean;
  /** "Last report's two, since then", when last report's items are measured. */
  progressHeading?: string;
  items: PageItem[];
  patterns: { note: string; rows: { name: string; count: string; share: number; mark?: string }[] };
  about: { key: string; value: string }[];
  /** Notes not about the wording. */
  aboutNotes: string[];
  /** Tables the precise figures add: blind spots and the positions shown. */
  tables: { caption: string; table: TableView }[];
  /** The line shown under a board before anything plays. */
  hint: string;
  footer: string;
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const word = (n: number): string => WORDS[n] ?? n.toLocaleString("en-US");
const Word = (n: number): string => {
  const w = word(n);
  return w.charAt(0).toUpperCase() + w.slice(1);
};
const count = (n: number): string => n.toLocaleString("en-US");
const games = (n: number): string => (n === 1 ? "1 game" : `${count(n)} games`);
const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const SITE: Record<Track["platform"], string> = { lichess: "Lichess", chesscom: "Chess.com" };
const WHO: Record<StoryTag, string> = { you: "You", they: "They", then: "Then", better: "Better" };

export const PAGE_HINT = "Press a button, or tap a sentence below, to go through it move by move.";
export const PAGE_FOOTER = "Blunderstruck is open source. This page was made on your own machine from your own games.";
export const OTHER_TRACKS_INTRO = "This page shows one time class. To see another, stop this server and run:";

/** "rapid:", before the command that serves another time class. */
export const otherTrackLabel = (timeClass: string): string => `${timeClass}:`;

/** "mossy_gambit · Lichess · rapid". */
export const mastheadText = (t: Track): string => `${t.username} · ${SITE[t.platform]} · ${t.timeClass}`;

/** The page shown before a track has any report. */
export function noReportText(t: Track | undefined): { title: string; headline: string; lede: string; masthead: string } {
  return {
    title: "No report yet",
    headline: t ? `No report yet for ${t.username}.` : "No report yet.",
    lede: "Run the report command first, then reload this page:",
    masthead: t ? mastheadText(t) : "",
  };
}

/** Where the report stands (see `PageStage`). A deeper check runs only when one is set and games wait for it. */
export function pageStage(r: WeeklyReport, pending: number): PageStage {
  const c = r.coverage;
  if (c.complete) return "complete";
  if (c.sampleOnly) return "sample";
  if (c.analysed < c.total) return "analysing";
  if ((r.settings.checkDepth ?? 0) > 0 && pending > 0) return "checking";
  return "finishing";
}

/** "17 Oct to 16 Nov 2026", "9 to 16 Nov 2026", "28 Dec 2026 to 4 Jan 2027". */
function daySpan(startIso: string, endIso: string, year = true): string {
  const a = new Date(Date.parse(startIso));
  const b = new Date(Date.parse(endIso));
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return `${startIso.slice(0, 10)} to ${endIso.slice(0, 10)}`;
  const m = (d: Date): string => d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }).slice(0, 3);
  // Across a year's end both years are given, whatever `year` asks.
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${a.getUTCDate()} ${m(a)} ${a.getUTCFullYear()} to ${b.getUTCDate()} ${m(b)} ${b.getUTCFullYear()}`;
  const end = `${b.getUTCDate()} ${m(b)}${year ? ` ${b.getUTCFullYear()}` : ""}`;
  if (a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()} to ${end}`;
  return `${a.getUTCDate()} ${m(a)} to ${end}`;
}

/** A FEN whose board field is eight well-formed ranks. */
export function boardFenValid(fen: string): boolean {
  const rows = fen.trim().split(/\s+/, 1)[0]?.split("/") ?? [];
  return rows.length === 8 && rows.every((row) => /^[1-8pnbrqkPNBRQK]+$/.test(row) && [...row].reduce((n, ch) => n + (/\d/.test(ch) ? Number(ch) : 1), 0) === 8);
}

/** The move a story line names, from where the story stores it. */
export function storyMoveAt(story: ExampleStory, m: StoryMove): MoveDetail | undefined {
  switch (m.source) {
    case "played":
      return story.played;
    case "inGame":
      return story.inGame?.moves[m.index];
    case "actualReply":
      return story.actualReply;
    case "punish":
      return story.punish[m.index];
    case "better":
      return story.better[m.index];
  }
}

/** Segments with the first letter capitalised, as a sentence starts. */
export function sentenceSegments(segments: readonly StorySegment[]): StorySegment[] {
  return segments.map((s, i) => {
    if (i > 0) return s;
    return "text" in s ? { text: capitalise(s.text) } : s;
  });
}

const share = (s: Pick<PatternStat, "games" | "gamesAffected">): number => (s.games > 0 ? s.gamesAffected / s.games : 0);

/** The board's text alternative, describing only the arrows the resting picture draws. */
function boardLabel(ex: FocusExample, lines: readonly StoryLine[]): string {
  const side = ex.story!.played.color === "white" ? "White" : "Black";
  const out = [`The position before your move, seen from ${side}'s side.`, "The arrow that starts from a dot is the move you played."];
  const they = lines.find((l) => l.tag === "they");
  if (they) out.push(they.moves[0]?.played ? "The plain dark arrow is their reply." : "The broken arrow is the reply your move allowed, which was not played.");
  if (lines.some((l) => l.tag === "better")) out.push("The arrow with a line down its middle is the better move.");
  return out.join(" ");
}

function exampleText(ex: FocusExample, view: FocusView["examples"][number], item: FocusView): PageExample {
  const traits = ex.traits ?? [];
  const chips = item.steps
    .map((s, i) => ({ number: String(i + 1), label: s.label, step: i, on: traits.includes(s.blindSpot) }))
    .filter((c) => c.on)
    .map(({ number, label, step }) => ({ number, label, step }));
  const title = exampleTitle(ex);
  const base = {
    ...(title ? { title } : {}),
    moveLabel: view.moveLabel,
    ...(chips.length > 0 ? { chipsLabel: chips.length > 1 ? "Shows blind spots" : "Shows blind spot" } : {}),
    chips,
  };
  const story = ex.story;
  const lines = view.story;
  if (!story || !lines) return { ...base, hasBoard: false, lines: [], plain: view.line };
  const key = keyMove(story);
  const chip = motifChip(ex);
  const chipOn: StoryTag = key.line === "better" ? "better" : "they";
  const hasBoard = boardFenValid(ex.fen);
  return {
    ...base,
    hasBoard,
    ...(hasBoard ? { boardLabel: boardLabel(ex, lines) } : {}),
    lines: lines.map((l) => {
      const moves = (l.tag === "better" ? l.moves.slice(0, 1) : l.moves).map((m) => storyMoveAt(story, m)?.san).filter((s): s is string => !!s);
      return {
        tag: l.tag,
        who: WHO[l.tag],
        segments: sentenceSegments(l.segments),
        ...(moves.length > 0 ? { notation: moves.join(" ") } : {}),
        ...(chip && l.tag === chipOn ? { chip } : {}),
      };
    }),
    ...(view.cost ? { cost: sentenceSegments(view.cost.segments) } : {}),
  };
}

/** Which example "See one on the board" points at for each step: the first that shows it and no earlier step took, else the first that shows it. */
function stepExamples(item: FocusView, examples: readonly FocusExample[]): (number | undefined)[] {
  const taken = new Set<number>();
  return item.steps.map((s) => {
    const shows = examples.map((e, j) => ((e.traits ?? []).includes(s.blindSpot) ? j : -1)).filter((j) => j >= 0);
    const j = shows.find((x) => !taken.has(x)) ?? shows[0];
    if (j !== undefined) taken.add(j);
    return j;
  });
}

function chartText(r: WeeklyReport, item: FocusView, flags: readonly (boolean | null)[]): PageChart | undefined {
  const weeks = item.weeks;
  const n = weeks.length;
  if (n === 0) return undefined;
  const flagOf = (j: number): boolean | null | undefined => flags[n - 1 - j];
  const top = weeks.some((w) => (w.share ?? 0) > 0.5) ? 1 : 0.5;
  const value = (w: FocusView["weeks"][number]): string => (w.affected !== null && !w.noGames ? `${count(w.affected)} of ${count(w.games)}` : w.text);
  const notes = ["Each bar is the share of that week's games where it happened; a week is named by the day it ends."];
  if (r.kind === "first") {
    const w0 = weeks[0]!;
    if (Date.parse(w0.start) < Date.parse(r.periodStart) && flagOf(0) === null) {
      notes.push(`The first bar covers only ${daySpan(r.periodStart, w0.end, false)}, too few games to count, so it is drawn as an outline.`);
    }
    notes.push(`${Word(n)} ${n === 1 ? "week is" : "weeks is"} not a trend. It is a starting line.`);
  }
  return {
    top,
    topText: top === 1 ? "top line: all your games" : "top line: half your games",
    goalShare: item.goal.per / item.goal.of,
    goalKey: `goal: ${item.goalText}`,
    label: `Games with this mistake, by week: ${weeks.map(value).join(", ")}. The goal is ${item.goalText}.`,
    bars: weeks.map((w, j) => ({ share: w.share && w.share > 0 ? w.share : null, outline: flagOf(j) === null, value: value(w), label: w.label })),
    note: notes.join(" "),
  };
}

function itemText(r: WeeklyReport, v: Omit<ReportView, "page">, item: FocusView, i: number): PageItem {
  const raw = r.focus[i]!;
  const stat = r.current.stats.find((s) => s.patternId === raw.patternId);
  const n = String(item.number);
  const k = item.steps.length;
  const missed = blindSpotFamilyOf(raw.patternId) === "missed";
  const p = v.progressInGames?.items.find((x) => x.patternId === raw.patternId);
  const verdict = raw.reason.kind === "kept" && p ? { verdict: p.verdict, text: p.verdictText } : undefined;
  const g = item.goal;
  const over = stat ? Math.max(0, stat.gamesAffected - Math.floor((stat.games * g.per) / g.of)) : 0;
  const track = (start: string): PageTrack | undefined => {
    if (raw.reason.kind !== "kept") return undefined;
    const s0 = share(raw.baseline);
    const now = stat ? share(stat) : s0;
    const goal = g.per / g.of;
    const pos = s0 === now || s0 === goal ? 0 : Math.max(0, Math.min(1, (s0 - now) / (s0 - goal)));
    return { start, goal: item.goalText, share: pos, improved: p?.verdict === "improved", label: `Start: ${start}. Goal: ${item.goalText}.` };
  };
  const targets = stepExamples(item, raw.examples);
  const steps: PageStep[] = item.steps.map((s, j) => {
    const spot: BlindSpot | undefined = raw.blindSpots.find((b) => b.id === s.blindSpot);
    const bv = item.blindSpots.find((b) => b.id === s.blindSpot);
    const target = targets[j];
    return {
      spotLabel: `Blind spot ${j + 1}`,
      stepLabel: `Step ${j + 1}`,
      name: s.label,
      ...(spot ? { count: count(spot.count), of: `of your ${count(spot.of)}` } : {}),
      ...(spot && spot.of > 0
        ? {
            bar: {
              share: spot.count / spot.of,
              ...(spot.baselineOf > 0 ? { tick: spot.baselineCount / spot.baselineOf } : {}),
              label: `${count(spot.count)} of your ${count(spot.of)}${bv?.comparison ? `, ${bv.comparison}` : ""}`,
            },
          }
        : {}),
      ...(bv?.comparison ? { comparison: bv.comparison } : {}),
      ...(bv?.refinement ? { refinement: bv.refinement } : {}),
      text: s.text,
      ...(target !== undefined ? { example: target, exampleLink: raw.examples[target]?.story && boardFenValid(raw.examples[target]!.fen) ? "See one on the board" : "See one in your games" } : {}),
    };
  });
  const exCount = raw.examples.length;
  const first = raw.examples[0];
  return {
    number: n,
    mark: `focus ${n}`,
    ...(stat ? { index: `${count(stat.gamesAffected)} of ${games(stat.games)}`, count: count(stat.gamesAffected), ofGames: `of your ${games(stat.games)}` } : {}),
    ...(stat
      ? {
          dots: {
            games: stat.games,
            affected: stat.gamesAffected,
            over,
            label: `One dot per game. ${count(stat.gamesAffected)} of ${count(stat.games)} ${stat.gamesAffected === 1 ? "is" : "are"} filled in${over ? `; ${count(over)} of ${stat.gamesAffected === 1 ? "it" : "those"} ${over === 1 ? "is" : "are"} ringed.` : "."}`,
          },
        }
      : {}),
    ...(over > 0 ? { overText: `Ringed: the ${games(over)} over the goal.` } : {}),
    ...(verdict ? { verdict } : {}),
    ...(track(gamesPhrase(raw.baseline.gamesAffected, raw.baseline.games)) ? { cardTrack: track(gamesPhrase(raw.baseline.gamesAffected, raw.baseline.games))! } : {}),
    ...(track(gamesShort(raw.baseline)) ? { sectionTrack: track(gamesShort(raw.baseline))! } : {}),
    routineLink: k === 0 ? "The habit to build" : `The routine: ${word(k)} ${k === 1 ? "step" : "steps"}`,
    ...(first ? { exampleLink: first.story && boardFenValid(first.fen) ? "See it on the board" : "See the example" } : {}),
    habitTitle: k === 0 ? "The habit to build" : `Your routine at the board: ${word(k)} ${k === 1 ? "step" : "steps"}`,
    ...(k > 0 ? { habitLabel: "The habit to build" } : {}),
    ...(k > 0
      ? { habitIntro: `Each step answers something these ${missed ? "misses" : "mistakes"} had in common.${item.blindSpotsIntro ? ` ${item.blindSpotsIntro}` : ""}` }
      : {}),
    steps,
    ...(k > 0 ? { drillLabel: `Then, the drill behind ${k === 1 ? "it" : k === 2 ? "both" : `all ${word(k)}`}` } : {}),
    ...(exCount > 0 ? { examplesHeading: `${Word(exCount)} from ${r.kind === "weekly" ? "your games since your last report" : "your own games"}` } : {}),
    examples: raw.examples.map((e, j) => exampleText(e, item.examples[j]!, item)),
    ...(chartText(r, item, raw.reason.weeks) ? { chart: chartText(r, item, raw.reason.weeks)! } : {}),
  };
}

function headline(r: WeeklyReport, stage: PageStage, k: number): string {
  const p = r.player;
  if (stage === "analysing" && r.coverage.analysed <= 0 && k > 0) return `${p}, your games are waiting to be analysed.`;
  if (stage !== "complete" && stage !== "sample" && k > 0) return `${p}, ${k === 1 ? "one habit stands out" : `${word(k)} habits stand out`} so far.`;
  if (k === 0 && r.notes.includes("few-games")) {
    const g = r.gamesFound;
    return g === 0 ? `${p}, no games to go on yet.` : `${p}, ${word(g)} ${g === 1 ? "game" : "games"} is not enough to go on.`;
  }
  if (k === 0) return `${p}, here are your numbers.`;
  if (r.kind === "first") return `${p}, ${k === 1 ? "one habit is" : `${word(k)} habits are`} costing you the most.`;
  const grad = r.retired.filter((x) => x.why === "graduated").length;
  if (grad > 0) return `${p}, ${word(grad)} ${grad === 1 ? "habit is" : "habits are"} off your list.`;
  const pn = r.progress.length;
  const said = (verdict: ProgressVerdict, what: string): string | undefined => {
    const c = r.progress.filter((x) => x.verdict === verdict).length;
    if (c === 0) return undefined;
    if (pn === 1) return `${p}, your habit is getting ${what}.`;
    if (c === pn && pn === 2) return `${p}, both of your two are getting ${what}.`;
    return `${p}, ${word(c)} of your ${word(pn)} ${c === 1 ? "is" : "are"} getting ${what}.`;
  };
  const kept = r.focus.filter((f) => f.reason.kind === "kept").length;
  const joined = k - kept;
  return (
    said("improved", "rarer") ??
    said("worse", "more common") ??
    (joined === 0
      ? `${p}, ${k === 1 ? "the same habit" : `the same ${word(k)} habits`} as your last report.`
      : `${p}, ${joined === 1 ? "one new habit" : `${word(joined)} new habits`} to work on.`)
  );
}

function lede(r: WeeklyReport, v: Omit<ReportView, "page">, stage: PageStage, k: number): { lede: TextRun[]; wide?: string } {
  const tc = r.track.timeClass;
  const c = r.coverage;
  if (k === 0) {
    if (r.notes.includes("few-games")) return { lede: [{ text: "Play a few more and run the report again. Until then, here are the numbers." }] };
    return { lede: v.body.kind === "numbers" ? [{ text: v.body.intro }] : [] };
  }
  if (stage === "checking") {
    if (c.total === 1) return { lede: [{ text: `A first look at your one ${tc} game. The deeper check is running.` }] };
    return { lede: [{ text: "A first look at all " }, { text: count(c.total), strong: true }, { text: ` of your ${tc} games. The deeper check is running.` }] };
  }
  if (stage === "analysing") {
    if (c.analysed <= 0) {
      if (c.total === 1) return { lede: [{ text: `Your one ${tc} game has not been analysed yet.` }] };
      return { lede: [{ text: "None of your " }, { text: count(c.total), strong: true }, { text: ` ${tc} games has been analysed yet.` }] };
    }
    if (c.analysed === 1) return { lede: [{ text: `From the first of your ${count(c.total)} ${tc} games. The rest are in the queue.` }] };
    return { lede: [{ text: "From the first " }, { text: count(c.analysed), strong: true }, { text: ` of your ${count(c.total)} ${tc} games. The rest are in the queue.` }] };
  }
  if (stage === "sample") {
    if (c.analysed === 1) return { lede: [{ text: `From the first of your ${count(c.total)} ${tc} games.` }] };
    return { lede: [{ text: "From the first " }, { text: count(c.analysed), strong: true }, { text: ` of your ${count(c.total)} ${tc} games.` }] };
  }
  const twice = stage === "complete" && c.checked !== undefined && c.checked === c.total && (r.settings.checkDepth ?? 0) > 0 ? ", every mistake checked twice" : "";
  if (r.kind === "first") {
    const days = Math.round((Date.parse(r.periodEnd) - Date.parse(r.periodStart)) / 86_400_000);
    return {
      lede:
        r.gamesFound === 1
          ? [{ text: `Your one ${tc} game from the last ${days === 1 ? "day" : `${count(days)} days`}${twice}.` }]
          : [{ text: "All " }, { text: count(r.gamesFound), strong: true }, { text: ` of your ${tc} games from the last ${days === 1 ? "day" : `${count(days)} days`}${twice}.` }],
      wide: k === 1 ? "Work on this one." : `Work on these ${word(k)}. Everything else can wait.`,
    };
  }
  const kinds = [
    [r.retired.filter((x) => x.why === "graduated").length, "is fixed", "are fixed"],
    [r.focus.filter((f) => f.reason.kind === "kept").length, "carries on", "carry on"],
    [r.focus.filter((f) => f.reason.kind !== "kept").length, "joins the list", "join the list"],
  ] as const;
  const bits = kinds.filter(([n]) => n > 0).map(([n, one, many], i) => `${i === 0 ? `${Word(n)} ${n === 1 ? "habit" : "habits"}` : word(n)} ${n === 1 ? one : many}`);
  const wide = bits.length === 0 ? undefined : `${bits.length === 1 ? bits[0]! : `${bits.slice(0, -1).join(", ")}, and ${bits.at(-1)}`}.`;
  return {
    lede: [{ text: count(r.gamesFound), strong: true }, { text: ` ${tc} ${r.gamesFound === 1 ? "game" : "games"} since your last report${twice}.` }],
    ...(wide ? { wide } : {}),
  };
}

function bannerText(r: WeeklyReport, v: Omit<ReportView, "page">, stage: PageStage): PageBanner | undefined {
  if (stage === "complete" || !v.coverage) return undefined;
  const total = r.coverage.total;
  const done = Math.max(0, Math.min(total, total - v.pending));
  if (stage === "sample") return { lead: "A sample, as you asked:", text: v.coverage };
  if (stage === "checking") {
    return {
      lead: "Deeper check running:",
      text: v.coverage,
      wide: "The picks and the examples may change a little too. This page updates itself, and the boards wait for a click until then.",
      bar: { share: total > 0 ? done / total : 0, label: `${count(done)} of ${games(total)} checked` },
    };
  }
  if (stage === "analysing") {
    return {
      lead: "Still analysing:",
      text: v.coverage,
      wide: "This page updates as they finish, and the picks below may change.",
      bar: { share: total > 0 ? r.coverage.analysed / total : 0, label: `${count(r.coverage.analysed)} of ${games(total)} analysed` },
    };
  }
  return { lead: "Still analysing:", text: v.coverage, wide: "This page updates as they finish." };
}

/** The two items are this period's top two picks, both seen in its games and in at least two weeks. */
function topTwoTrue(r: WeeklyReport): boolean {
  if (r.focus.length !== 2) return false;
  const ranked = r.priorities.filter((p) => p.rank !== null).sort((a, b) => a.rank! - b.rank!).slice(0, 2).map((p) => p.patternId);
  return r.focus.every((f) => {
    const s = r.current.stats.find((x) => x.patternId === f.patternId);
    return ranked.includes(f.patternId) && !!s && s.gamesAffected > 0 && f.reason.weeksRecurred >= 2;
  });
}

function patternsText(r: WeeklyReport, items: readonly FocusView[]): PageText["patterns"] {
  const stats = r.current.stats;
  const ranked = r.priorities.filter((p) => p.rank !== null).sort((a, b) => a.rank! - b.rank!);
  const order: PatternStat[] = [];
  for (const p of ranked) {
    const s = stats.find((x) => x.patternId === p.patternId);
    if (s && !order.includes(s)) order.push(s);
  }
  const rest = stats.filter((s) => !order.includes(s)).map((s, i) => ({ s, i }));
  rest.sort((a, b) => b.s.gamesAffected - a.s.gamesAffected || a.i - b.i);
  order.push(...rest.map((x) => x.s));
  const total = r.current.games;
  const zeros = order.filter((s) => s.gamesAffected === 0);
  const fold = items.length === 0 && zeros.length >= 2;
  const rows = order
    .filter((s) => !(fold && s.gamesAffected === 0))
    .map((s) => {
      const it = items.find((x) => x.patternId === s.patternId);
      return { name: patternName(s.patternId), count: games(s.gamesAffected), share: total > 0 ? s.gamesAffected / total : 0, ...(it ? { mark: `focus ${it.number}` } : {}) };
    });
  if (fold) rows.push({ name: `${Word(zeros.length)} other patterns`, count: games(0), share: 0 });
  const note = `${total === 1 ? "Whether each thing happened in your one game." : `Games out of ${count(total)} where each thing happened at least once. One game can appear in more than one row.`}${
    topTwoTrue(r) ? " The top two cost you the most and kept coming back, which is why they are your two." : ""
  }`;
  return { note, rows };
}

function aboutText(r: WeeklyReport, v: Omit<ReportView, "page">): PageText["about"] {
  const split = (s: string): { key: string; value: string } => {
    const i = s.indexOf(": ");
    return i < 0 ? { key: "", value: s } : { key: s.slice(0, i), value: s.slice(i + 2) };
  };
  const rows = [{ key: "Player", value: `${r.track.username} on ${SITE[r.track.platform]}, ${r.track.timeClass}` }];
  rows.push(split(v.header.period), split(v.header.games), split(v.header.band));
  const e = r.settings.engine;
  const cd = r.settings.checkDepth ?? 0;
  rows.push({
    key: "Engine",
    value: cd > 0 ? `${e.name}. A first look at depth ${e.depth}, then every flagged move checked again at depth ${cd}.` : `${e.name}, depth ${e.depth}.`,
  });
  const win = r.focus.find((f) => f.blindSpots.length > 0 && f.blindSpotWindow)?.blindSpotWindow;
  if (win) {
    const where = `in your ${games(win.games)} from ${daySpan(win.start, win.end)}`;
    rows.push({
      key: "Blind spots",
      value: `Looked for across ${win.mistakes === 1 ? "your one mistake" : `all ${count(win.mistakes)} of your mistakes`} ${where}. "Looked like" marks one read by a rule of thumb; the rest are read from the engine's own line.`,
    });
  }
  const who =
    r.wording.source === "model"
      ? `Titles, reasons, steps and drills written by a model${r.wording.model ? ` (${r.wording.model})` : ""} around numbers that code worked out. Move sentences are written by code.`
      : "Built-in templates.";
  rows.push({ key: "Wording", value: [who, ...v.notes.wording].join(" ") });
  rows.push({ key: "Compared with", value: r.comparison ? `The 30 days before this period: ${games(r.comparison.games)}.` : (v.trends.empty ?? "No earlier games to compare with yet.") });
  return rows;
}

function tablesText(r: WeeklyReport, items: readonly FocusView[]): PageText["tables"] {
  const out: PageText["tables"] = [];
  const read = (basis: BlindSpot["basis"] | undefined): string => (basis === "motif" ? "rule of thumb" : "engine line");
  const rows: string[][] = [];
  let win: WeeklyReport["focus"][number]["blindSpotWindow"];
  r.focus.forEach((f, i) => {
    const item = items[i];
    if (!item) return;
    win ??= f.blindSpots.length > 0 ? f.blindSpotWindow : undefined;
    for (const b of f.blindSpots) {
      const label = item.blindSpots.find((x) => x.id === b.id)?.label ?? b.id;
      rows.push([`${item.number} · ${label}`, count(b.count), count(b.games), count(b.of), `${count(b.baselineCount)}/${count(b.baselineOf)}`, read(b.basis)]);
      const ref = b.refinement;
      const phrase = ref ? REFINEMENT_PHRASES[ref.id] : undefined;
      if (ref && phrase) rows.push([`${item.number} · of them, ${phrase}`, count(ref.count), "", count(b.count), "", read(blindSpotInfo(ref.id)?.basis)]);
    }
  });
  if (rows.length > 0) {
    out.push({
      caption: win ? `Blind spots (${games(win.games)}, ${win.mistakes === 1 ? "1 mistake" : `${count(win.mistakes)} mistakes`})` : "Blind spots",
      table: { head: ["Focus and blind spot", "Times", "Games", "Out of", "All mistakes", "Read from"], rows },
    });
  }
  const positions: string[][] = [];
  let depth = 0;
  r.focus.forEach((f, i) => {
    f.examples.forEach((e, j) => {
      const ev = items[i]?.examples[j];
      if (!e.story || !ev) return;
      depth = Math.max(depth, e.story.depth);
      positions.push([`${ev.moveLabel}: ${e.story.played.san}`, ev.cost?.detail ?? ""]);
    });
  });
  if (positions.length > 0) {
    const n = positions.length;
    out.push({
      caption: `The ${n === 1 ? "position" : `${word(n)} positions`} shown (engine depth ${depth})`,
      table: { head: ["Move", "Winning chances"], rows: positions },
    });
  }
  return out;
}

/** The page's own text for a report, from the report and the rest of its view. */
export function pageText(r: WeeklyReport, v: Omit<ReportView, "page">): PageText {
  const stage = pageStage(r, v.pending);
  const items = v.body.kind === "focus" ? v.body.items : [];
  const k = items.length;
  const kind = r.kind === "first" ? "First report" : "Weekly report";
  const suffix = stage === "checking" ? " · first look" : stage === "analysing" || stage === "finishing" ? " · provisional" : "";
  const l = lede(r, v, stage, k);
  const banner = bannerText(r, v, stage);
  const prog = v.progressInGames?.items.length ?? 0;
  return {
    stage,
    autoplay: stage === "complete" || stage === "sample",
    masthead: mastheadText(r.track),
    eyebrow: `${kind} · ${daySpan(r.periodStart, r.periodEnd)}${suffix}`,
    headline: headline(r, stage, k),
    lede: l.lede,
    ...(l.wide ? { ledeWide: l.wide } : {}),
    ...(banner ? { banner } : {}),
    showSummary: k > 0,
    ...(r.kind === "weekly" && prog > 0 ? { progressHeading: `Last report's ${word(prog)}, since then` } : {}),
    items: items.map((item, i) => itemText(r, v, item, i)),
    patterns: patternsText(r, items),
    about: aboutText(r, v),
    aboutNotes: v.notes.other,
    tables: tablesText(r, items),
    hint: PAGE_HINT,
    footer: PAGE_FOOTER,
  };
}

/** The rows of "All reports", newest first: "Week ending 7 Dec 2026 (latest)", the one shown marked "(this one)". */
export function reportsList(
  reports: readonly Pick<WeeklyReport, "periodEnd" | "kind">[],
  current: string,
): { text: string; periodEnd: string; latest: boolean; current: boolean }[] {
  const sorted = [...reports].sort((a, b) => Date.parse(b.periodEnd) - Date.parse(a.periodEnd));
  return sorted.map((x, i) => {
    const here = Date.parse(x.periodEnd) === Date.parse(current);
    const label = `${x.kind === "first" ? "First report" : "Week"} ending ${x.periodEnd.slice(0, 10)}${i === 0 ? " (latest)" : ""}${here ? " (this one)" : ""}`;
    return { text: label, periodEnd: x.periodEnd, latest: i === 0, current: here };
  });
}
