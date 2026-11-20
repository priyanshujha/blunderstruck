import {
  type BlindSpot,
  type FocusExample,
  type FocusItem,
  GAMES_TENTHS_FROM,
  type GameGoal,
  type PatternProgress,
  type PatternStat,
  type PeriodStats,
  type ProgressVerdict,
  type RetiredFocus,
  type WeeklyReport,
  blindSpotTokenValues,
  focusTokenValues,
  gameGoalOf,
  meetsGoal,
  renderText,
  summaryTokenValues,
} from "@blunderstruck/contracts";
import { REFINEMENT_PHRASES, blindSpotLabel, patternName } from "./names";
import { type StoryCost, type StoryLine, storyCost, storyLines } from "./story";

export * from "./story";

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
  /** "Move 12, you had White". */
  moveLabel: string;
  /** The example told move by move; absent on examples stored without a story (use `line`). */
  story?: StoryLine[];
  /** "It cost your queen.", with winning chances before and after as its detail. */
  cost?: StoryCost;
}

/** One week of a focus pattern, in games, for a chart. */
export interface WeekShare {
  /** "2026-10-22 to 2026-10-29" on a first report, the end day on later ones. */
  label: string;
  end: string;
  games: number;
  /** Games of the week the pattern came up in; null when the week had no games or no figure. */
  affected: number | null;
  /** `affected / games`; null when not drawn. */
  share: number | null;
  /** The week had no games: mark it, do not draw it as zero. */
  noGames: boolean;
  /** "5 of 23 games", "no games" or "no data". */
  text: string;
}

export interface BlindSpotView {
  id: string;
  basis: BlindSpot["basis"];
  label: string;
  /** "23 of your 62". */
  count: string;
  /** "against about 1 in 8 of your mistakes overall"; absent when there is nothing to compare with. */
  comparison?: string;
  /** "9 of them by a knight." */
  refinement?: string;
  /** Label, count and comparison as one sentence. */
  sentence: string;
}

export interface StepView {
  blindSpot: string;
  /** The blind spot's label, so the step can be shown beside it. */
  label: string;
  text: string;
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
  /** "In 51 of your 162 games, about 1 game in 3." */
  frequency: string;
  /** The goal in games: the item's own, or derived from its baseline on older items. */
  goal: GameGoal;
  /** "at most 1 game in 4". */
  goalText: string;
  /** "Goal: at most 1 game in 4." */
  goalLine: string;
  /** Where the player stands against the goal, in games. */
  standing: string;
  /** Week by week in games, oldest first, with the goal line at `goal.per / goal.of`. */
  weeks: WeekShare[];
  /** "Looking at all 62 times in your last 80 games:"; absent without blind spots. */
  blindSpotsIntro?: string;
  blindSpots: BlindSpotView[];
  /** One step per blind spot; `drill` is the general drill that follows them. */
  steps: StepView[];
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
    | {
        kind: "numbers";
        heading: string;
        intro: string;
        table: TableView;
        /** Each pattern in games: "Left a piece hanging: 5 of 7 games, about 7 in every 10 games." */
        lines: string[];
      };
  /** Per 100 moves; `progressInGames` says the same in games. */
  progress?: SectionView;
  retired?: SectionView;
  progressInGames?: SectionView;
  retiredInGames?: SectionView;
  /** "How often, week by week": the heading for each focus item's `weeks`. */
  weeksInGames: string;
  /** Per 100 moves. */
  weeks: { heading: string; table: TableView };
  trends: { heading: string; table?: TableView; empty?: string };
  notes: SectionView;
  /** The precise figures, per 100 moves, for whoever wants them. */
  details: {
    heading: string;
    /** "Left a piece hanging: Now 2.10 per 100 moves; started at 3.00; target 2.25." */
    focus: string[];
    progress?: SectionView;
    retired?: SectionView;
    weeks: ReportView["weeks"];
    trends: ReportView["trends"];
  };
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

/** `GAMES_TENTHS_FROM` as thousandths, so shares compare in integers. */
const TENTHS_FROM_MILLI = Math.round(GAMES_TENTHS_FROM * 1000);

/** `a / g` is at least `GAMES_TENTHS_FROM`, the share from which counts are said in tenths. */
const inTenths = (a: number, g: number): boolean => a * 1000 >= TENTHS_FROM_MILLI * g;
/** round(10a / g), halves up, in integers. */
const tenthsOf = (a: number, g: number): number => Math.floor((20 * a + g) / (2 * g));
/** round(g / a), halves up, in integers. */
const oneIn = (a: number, g: number): number => Math.floor((2 * g + a) / (2 * a));

/**
 * How often something happened in a set of games, as a player can picture it: "not once",
 * "about 1 game in 3" (only when the share is within a tenth of 1 in 3, else the tenths form),
 * "about 8 in every 10 games" (from a share of `GAMES_TENTHS_FROM`; "about 1 game in 2" for
 * 5 in 10, so one share always has one wording),
 * "in almost every game" (when that rounds to 10 of 10 but was not all), "in every game", and
 * "in your only game" when there was one game and it happened there.
 */
export function gamesPhrase(affected: number, games: number): string {
  return statedShare(affected, games).text;
}

/** A phrase and the share it states, as a fraction (`num / den`). */
interface Stated {
  text: string;
  num: number;
  den: number;
}

/** "about X in every 10 games", said as "about 1 game in N" when X/10 is 1/N, so one share has one wording. */
function tenthsPhrase(x: number): Stated {
  if (x > 0 && 10 % x === 0) return { text: `about 1 game in ${10 / x}`, num: 1, den: 10 / x };
  return { text: `about ${x} in every 10 games`, num: x, den: 10 };
}

/** The phrase for `affected` of `games` and the share it states (see `gamesPhrase`). */
function statedShare(affected: number, games: number): Stated {
  if (games <= 0) return { text: "no games yet", num: 0, den: 1 };
  if (affected <= 0) return { text: "not once", num: 0, den: 1 };
  if (affected >= games) return { text: games === 1 ? "in your only game" : "in every game", num: 1, den: 1 };
  if (inTenths(affected, games)) {
    const x = tenthsOf(affected, games);
    return x >= 10 ? { text: "in almost every game", num: 19, den: 20 } : tenthsPhrase(x);
  }
  const n = oneIn(affected, games);
  // "1 game in N" only when the true share is within a tenth of 1/N: |a·N − g| ≤ g/10.
  if (10 * Math.abs(affected * n - games) <= games) return { text: `about 1 game in ${n}`, num: 1, den: n };
  return tenthsPhrase(tenthsOf(affected, games));
}

/**
 * A goal in the same words: "at most 1 game in 4", "at most 6 in every 10 games", "not in a
 * single game". A goal in tenths that is one game in N is said that way ("at most 1 game in 5"
 * for 2 in 10), as the frequency is.
 */
export function goalPhrase(goal: GameGoal): string {
  if (goal.per <= 0) return "not in a single game";
  if (goal.per === 1) return `at most 1 game in ${goal.of}`;
  if (goal.of % goal.per === 0) return `at most 1 game in ${goal.of / goal.per}`;
  if (goal.of === 10) return `at most ${goal.per} in every 10 games`;
  return `at most ${goal.per} games in every ${goal.of}`;
}

/** The item's goal, or for an item stored before goals were in games, the one its baseline gives. */
export const goalOf = (item: Pick<FocusItem, "goal" | "baseline">): GameGoal => item.goal ?? gameGoalOf(item.baseline);

/**
 * "In 51 of your 162 games, about 1 game in 3." and the edges. Given a goal that is not met,
 * the rounded phrase is left out whenever the share it states is at or under the goal's
 * (compared as fractions), so a missed goal never reads as reached: only the counts are said.
 */
export function frequencySentence(stat: Pick<PatternStat, "games" | "gamesAffected"> | undefined, goal?: GameGoal): string {
  if (!stat) return "No data for this period.";
  const { games: g, gamesAffected: a } = stat;
  if (g <= 0) return "No games this period.";
  if (a <= 0) return g === 1 ? "Not once in your one game." : `Not once in your ${count(g)} games.`;
  if (a >= g) return g === 1 ? "In your one game." : `In all ${count(g)} of your games.`;
  const stated = statedShare(a, g);
  // stated ≤ goal  ⇔  num · goal.of ≤ goal.per · den
  if (goal && !meetsGoal(stat, goal) && stated.num * goal.of <= goal.per * stated.den) {
    return `In ${count(a)} of your ${count(g)} games.`;
  }
  return `In ${count(a)} of your ${count(g)} games, ${stated.text}.`;
}

/**
 * What the goal means in this period's games, after "Goal: …": "In these 31 games that means 10
 * or fewer; you are at 12." Checks for no games first, as `meetsGoal` passes those.
 */
export function standingSentence(stat: Pick<PatternStat, "games" | "gamesAffected"> | undefined, goal: GameGoal): string {
  if (!stat || stat.games <= 0) return "No games this period to measure it against.";
  const allowed = Math.floor((goal.per * stat.games) / goal.of);
  const limit = allowed === 0 ? "none" : `${count(allowed)} or fewer`;
  const games = stat.games === 1 ? "In your one game" : `In these ${count(stat.games)} games`;
  const inside = meetsGoal(stat, goal) ? ", inside the goal" : "";
  return `${games} that means ${limit}; you are at ${count(stat.gamesAffected)}${inside}.`;
}

/** "38 of 120 games (about 1 game in 3)". */
const gamesShort = (s: Pick<PatternStat, "games" | "gamesAffected">): string =>
  `${count(s.gamesAffected)} of ${plural(s.games, "game")} (${gamesPhrase(s.gamesAffected, s.games)})`;

/** "against about 1 in 8 of your mistakes overall": the share of all the player's mistakes with the property. */
function baselinePhrase(bc: number, bo: number): string | undefined {
  if (bo <= 0) return undefined;
  const tail = "of your mistakes overall";
  if (bc <= 0) return `against none ${tail}`;
  if (bc >= bo) return `against all ${tail}`;
  // Small numbers are given exactly; "about 1 in 3" of 7 mistakes says more than it knows.
  if (bo < SMALL_BASELINE) return `against ${count(bc)} of your ${plural(bo, "mistake")} overall`;
  if (inTenths(bc, bo)) return `against about ${Math.min(9, tenthsOf(bc, bo))} in 10 ${tail}`;
  return `against about 1 in ${oneIn(bc, bo)} ${tail}`;
}

/** Below this many mistakes in all, the comparison gives the exact counts. */
const SMALL_BASELINE = 20;

function blindSpotView(spot: BlindSpot): BlindSpotView {
  const label = blindSpotLabel(spot.id);
  const countText = `${count(spot.count)} of your ${count(spot.of)}`;
  const comparison = baselinePhrase(spot.baselineCount, spot.baselineOf);
  const ref = spot.refinement;
  const phrase = ref ? REFINEMENT_PHRASES[ref.id] : undefined;
  return {
    id: spot.id,
    basis: spot.basis,
    label,
    count: countText,
    ...(comparison ? { comparison } : {}),
    ...(ref && phrase ? { refinement: `${count(ref.count)} of them ${phrase}.` } : {}),
    sentence: `${label}: ${countText}${comparison ? `, ${comparison}` : ""}.`,
  };
}

/** "Move 12, you had White", from the ply and the side to move in the position before it. */
function moveLabel(ex: FocusExample): string {
  const side = ex.story?.played.color ?? (ex.fen.split(" ")[1] === "b" ? "black" : "white");
  return `Move ${Math.ceil(ex.ply / 2)}, you had ${side === "white" ? "White" : "Black"}`;
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
    moveLabel: moveLabel(ex),
    ...(ex.story ? { story: storyLines(ex.story, ex.patternId), cost: storyCost(ex.story, ex.patternId) } : {}),
  };
}

/** The weeks a report shows, oldest first, with their labels (see `weekTable`). */
function shownWeeks(r: WeeklyReport, weeks: readonly PeriodStats[]): { week: PeriodStats; label: string }[] {
  const first = r.kind === "first";
  const periodStart = Date.parse(r.periodStart);
  return [...weeks]
    .filter((w) => !first || Date.parse(w.end) > periodStart)
    .sort((a, b) => Date.parse(a.end) - Date.parse(b.end))
    .map((w) => ({
      week: w,
      label: first ? `${day(Date.parse(w.start) < periodStart ? r.periodStart : w.start)} to ${day(w.end)}` : day(w.end),
    }));
}

function weekShares(r: WeeklyReport, weeks: readonly PeriodStats[], patternId: string): WeekShare[] {
  return shownWeeks(r, weeks).map(({ week, label }) => {
    const base = { label, end: week.end, games: week.games };
    if (week.games === 0) return { ...base, affected: null, share: null, noGames: true, text: "no games" };
    const s = statOf(week.stats, patternId);
    if (!s) return { ...base, affected: null, share: null, noGames: false, text: NO_DATA };
    return {
      ...base,
      affected: s.gamesAffected,
      share: s.gamesAffected / week.games,
      noGames: false,
      text: `${count(s.gamesAffected)} of ${plural(week.games, "game")}`,
    };
  });
}

function focusView(
  item: FocusItem,
  index: number,
  r: WeeklyReport,
  weeks: readonly PeriodStats[],
  failed: () => void,
): FocusView {
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

  const goal = goalOf(item);
  const spots = item.blindSpots ?? [];
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
    frequency: frequencySentence(stat, goal),
    goal,
    goalText: goalPhrase(goal),
    goalLine: `Goal: ${goalPhrase(goal)}.`,
    standing: standingSentence(stat, goal),
    weeks: weekShares(r, weeks, item.patternId),
    ...(spots.length > 0 ? { blindSpotsIntro: blindSpotsIntro(item) } : {}),
    blindSpots: spots.map(blindSpotView),
    steps: (item.steps ?? []).map((step) => {
      const spot = spots.find((b) => b.id === step.blindSpot);
      const out = spot ? tryRender(step.text, blindSpotTokenValues(spot)) : undefined;
      if (out === undefined) failed();
      return { blindSpot: step.blindSpot, label: blindSpotLabel(step.blindSpot), text: out ?? UNSHOWN_WORDING };
    }),
  };
}

/** "Looking at all 62 times in your last 80 games:". */
function blindSpotsIntro(item: FocusItem): string {
  const of = item.blindSpots[0]?.of ?? 0;
  const times = of === 1 ? "the one time" : `all ${count(of)} times`;
  const w = item.blindSpotWindow;
  return w ? `Looking at ${times} in your last ${plural(w.games, "game")}:` : `Looking at ${times}:`;
}

function progressLine(p: PatternProgress): string {
  const p3 = p.pValue === null ? "" : `, p = ${p.pValue.toFixed(3)}`;
  return (
    `${patternName(p.patternId)}: ${VERDICT_WORDS[p.verdict]} ` +
    `(${f2(p.previous.per100Moves)} before, ${f2(p.current.per100Moves)} now, per 100 moves${p3})`
  );
}

function progressGamesLine(p: PatternProgress): string {
  return `${patternName(p.patternId)}: ${VERDICT_WORDS[p.verdict]}. ${gamesShort(p.previous)} before, ${gamesShort(p.current)} since.`;
}

function retiredGamesLine(x: RetiredFocus): string {
  return (
    `${patternName(x.patternId)}: ${RETIRED_WHY[x.why]}. ` +
    `${gamesShort(x.baseline)} when it was chosen on ${day(x.since)}, ${gamesShort(x.current)} now.`
  );
}

function retiredLine(x: RetiredFocus): string {
  return (
    `${patternName(x.patternId)}: ${RETIRED_WHY[x.why]}. ` +
    `${f2(x.baseline.per100Moves)} per 100 moves on ${day(x.since)}, ${f2(x.current.per100Moves)} now.`
  );
}

/**
 * The week table, oldest first. A first report shows only the weeks that overlap its period,
 * labelled by their days within it; later reports show every week they are given, by end day.
 */
function weekTable(r: WeeklyReport, weeks: readonly PeriodStats[]): TableView {
  const ids = r.focus.map((f) => f.patternId);
  return {
    head: [r.kind === "first" ? "Week" : "Week ending", "Games", "Mistakes /100", ...ids.map((id) => `${patternName(id)} /100`)],
    rows: shownWeeks(r, weeks).map(({ week: w, label }) => [
      label,
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

/**
 * Every sentence and figure a report shows, ready to lay out as text or HTML. Never throws on stored wording.
 * Counts are written with thousands separators, except inside coach wording, where the `{games}`-style
 * token values from the contracts package are plain, unformatted numbers.
 */
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

  const weeks = opts.weeks ?? r.weeks;
  const fewGames = r.focus.length === 0 && r.notes.includes("few-games");
  let body: ReportView["body"];
  if (r.focus.length === 0) {
    body = {
      kind: "numbers",
      heading: "The numbers",
      intro: fewGames
        ? `Too few games to pick focus items (${plural(r.gamesFound, "game")} found). Here are the numbers.`
        : "No habit repeated often enough to pick a focus item this week. Here are the numbers.",
      lines: r.current.stats.map(
        (s) => {
          const f = frequencySentence(s);
          return `${patternName(s.patternId)}: ${f.charAt(0).toLowerCase()}${f.slice(1)}`;
        },
      ),
      table: {
        head: ["Pattern", "Per 100 moves", "Count", "Games"],
        rows: r.current.stats.map((s) => [
          patternName(s.patternId),
          f2(s.per100Moves),
          count(s.occurrences),
          `${count(s.gamesAffected)}/${count(s.games)}`,
        ]),
      },
    };
  } else {
    body = {
      kind: "focus",
      heading: r.focus.length === 1 ? "Focus" : `Focus (${r.focus.length} things)`,
      items: r.focus.map((item, i) => focusView(item, i, r, weeks, failed)),
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

  const progress: SectionView | undefined =
    r.progress.length > 0 ? { heading: "Last report's focus, since then", lines: r.progress.map(progressLine) } : undefined;
  const retired: SectionView | undefined =
    r.retired.length > 0 ? { heading: "Retired from your list", lines: r.retired.map(retiredLine) } : undefined;
  const weekView = { heading: "Week by week (rates per 100 moves)", table: weekTable(r, weeks) };
  const items = body.kind === "focus" ? body.items : [];

  return {
    header,
    ...(coverage ? { coverage } : {}),
    provisional: !complete && !sampleOnly,
    pending,
    ...(summary ? { summary } : {}),
    body,
    ...(progress ? { progress } : {}),
    ...(retired ? { retired } : {}),
    ...(r.progress.length > 0
      ? { progressInGames: { heading: progress!.heading, lines: r.progress.map(progressGamesLine) } }
      : {}),
    ...(r.retired.length > 0 ? { retiredInGames: { heading: retired!.heading, lines: r.retired.map(retiredGamesLine) } } : {}),
    weeksInGames: "How often, week by week",
    weeks: weekView,
    trends,
    notes: { heading: "Notes", lines: noteLines(r, fewGames, wordingFailed) },
    details: {
      heading: "Precise figures (per 100 moves)",
      focus: items.map((i) => `${i.patternName}: ${i.figures}`),
      ...(progress ? { progress } : {}),
      ...(retired ? { retired } : {}),
      weeks: weekView,
      trends,
    },
  };
}
