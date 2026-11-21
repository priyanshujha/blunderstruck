import {
  BLIND_SPOT_TOKENS,
  EXAMPLE_MARKERS,
  blindSpotFamilyOf,
  exampleMarkerValues,
  type FocusChoice,
  type FocusExample,
  type MoveDetail,
  type ReportDraft,
  SUMMARY_TOKENS,
  summaryTokenValues,
} from "@blunderstruck/contracts";

/** One habit step as the wording gives it: the blind spot it is for and its text (a token template, `BLIND_SPOT_TOKENS`). */
export interface StepText {
  blindSpot: string;
  text: string;
}

/**
 * The words of a report: a summary and, for each focus item, a title, why and drill, and one
 * step per blind spot (token templates).
 */
export interface WordingText {
  summary: string;
  focus: { patternId: string; title: string; why: string; drill: string; steps: StepText[] }[];
}

export type WordingResult = { ok: true; value: WordingText } | { ok: false; errors: string[] };

/** The why's limit is measured with each example marker as the phrase it stands for. */
const LIMITS = { title: 60, why: 480, drill: 400, summary: 600, step: 200 } as const;

/**
 * Tokens a newly written summary may use. `{mistakeRate}` stays a valid token for stored
 * reports, but per-hundred-move figures are shown only in the report's details, so new wording
 * states the overall level with `{mistakesPerGame}`.
 */
export const WORDING_SUMMARY_TOKENS = SUMMARY_TOKENS.filter((t) => t !== "mistakeRate");

/** Tokens a habit step may use, filled from its blind spot. */
export const STEP_TOKENS = BLIND_SPOT_TOKENS;

/**
 * Tokens a focus item's title, why and drill may use. The other focus tokens are left out
 * because the report prints those lines itself, right under the wording.
 */
export const WORDING_FOCUS_TOKENS = ["games", "gamesAffected", "occurrences"] as const;

/** Focus tokens the report prints on its own lines (weeks, rate, starting rate, target); refused in the wording so it does not repeat them. */
export const PRINTED_TOKENS = ["rate", "baselineRate", "target", "weeksRecurred", "weeksCounted"] as const;

/*
 * The count rule. The player's own numbers reach the text only through tokens, which code
 * fills in, because a number the model writes itself can be wrong. The check aims at what a
 * model really does wrong (copying a value it was shown, or writing a statistic) and lets
 * every other number through: positions, clock times, move numbers, study quantities and
 * schedules.
 */

/** Nouns that make a number a tally of the player's record: "9 games", "12 times". */
export const RECORD_NOUNS: ReadonlySet<string> = new Set([
  "game", "games", "time", "times", "occasion", "occasions", "loss", "losses", "win", "wins",
  "week", "weeks", "outing", "outings", "match", "matches",
]);

/** After a record noun, these turn a count into a schedule ("3 games a day", "2 times per week"). */
export const SCHEDULE_LEADS: ReadonlySet<string> = new Set(["a", "per", "each", "every"]);
/** The periods a schedule runs over. */
export const SCHEDULE_PERIODS: ReadonlySet<string> = new Set(["day", "week", "session", "sitting"]);
/** Single words that make a schedule on their own: "3 games daily". */
export const SCHEDULE_WORDS: ReadonlySet<string> = new Set(["daily", "weekly", "today", "tonight"]);
/** Two-word schedules after a record noun: "5 games this week", "2 games in a row" (three words). */
export const SCHEDULE_PHRASES: readonly (readonly string[])[] = [["this", "week"], ["in", "a", "row"]];

/** Words just before a shown value that make a drill sentence a statement about the record: "in 9 games", "9 of your games". */
export const RECORD_LEADS: ReadonlySet<string> = new Set(["in", "of"]);
/** Verbs that, within three words after "you", make a drill sentence a statement about what the player did. */
export const RECORD_VERBS: ReadonlySet<string> = new Set([
  "hung", "lost", "blundered", "missed", "dropped", "left", "allowed", "made", "gave",
]);

/** Words before a number that make it a move number ("by move 12 of the game"), not a count. */
export const MOVE_WORDS: ReadonlySet<string> = new Set(["move", "moves"]);

/** Number words, for shares written in words ("nine of thirty-one games"). */
export const NUMBER_WORDS: ReadonlySet<string> = new Set([
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
  "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "dozen",
]);

/** Number words that count the player's games in a record field (two to twenty, and a few round ones). */
export const COUNT_WORDS: ReadonlySet<string> = new Set([
  "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
  "thirty", "forty", "fifty", "dozen",
]);

/** "once" and "twice" count only before these ("twice in your games"); "once you drop under 10 seconds" is a condition. */
export const REPEAT_BEFORE: ReadonlySet<string> = new Set(["in", "per", "every"]);

/** Words skipped between a number and its noun or second number: "nine of your thirty-one games". */
export const FILLERS: ReadonlySet<string> = new Set(["of", "your", "the", "my", "these", "last", "recent", "a", "an", "every", "each"]);

/** Words that, beside a decimal, make it a rate ("1.2 per game", "a rate of 0.8"). */
export const RATE_WORDS: ReadonlySet<string> = new Set(["per", "rate", "average"]);

/** Fractions that, before "of the games", make a share of the record. */
export const FRACTIONS: readonly (readonly string[])[] = [
  ["half"], ["a", "third"], ["a", "quarter"], ["one", "third"], ["one", "quarter"], ["two", "thirds"], ["three", "quarters"],
];
/** What a fraction must take a share of: "half of your losses". */
export const SHARE_OF: ReadonlySet<string> = new Set(["your", "the", "these"]);
export const SHARE_NOUNS: ReadonlySet<string> = new Set(["games", "losses", "wins"]);

/** Words that put the player in a sentence, for the number-word rule. */
export const SECOND_PERSON: ReadonlySet<string> = new Set(["you", "your", "you've", "you'd", "you're", "yourself"]);

const DIGIT = /\p{Nd}/u;
const LETTER = /\p{L}/u;
/** A move in SAN at a position, to tell a move number ("1. e4") from the end of a sentence. */
const SAN_AT = /(?:O-O|0-0|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h](?:x[a-h])?[1-8])(?!\w)/y;

/**
 * The sentences of a field, split on ".", "!", "?", ";" and line breaks. A dot inside a
 * decimal ("1.5") or after a move number ("1.e4", "1. e4", "20...Qxh2") does not end one.
 */
export function sentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  const cut = (end: number, next: number) => {
    const s = text.slice(start, end).trim();
    if (s) out.push(s);
    start = next;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "!" || ch === "?" || ch === ";" || ch === "\n" || ch === "\r") {
      cut(i, i + 1);
      continue;
    }
    if (ch !== ".") continue;
    let j = i;
    while (j < text.length && text[j] === ".") j++;
    if (DIGIT.test(text[i - 1] ?? "")) {
      if (j === i + 1 && DIGIT.test(text[j] ?? "")) continue; // a decimal
      let d = i - 1;
      while (d > 0 && DIGIT.test(text[d - 1]!)) d--;
      const standalone = d === 0 || !LETTER.test(text[d - 1]!);
      SAN_AT.lastIndex = text[j] === " " ? j + 1 : j;
      if (standalone && SAN_AT.test(text)) {
        i = j - 1; // a move number: keep the dots with the move
        continue;
      }
    }
    cut(i, j);
    i = j - 1;
  }
  cut(text.length, text.length);
  return out;
}

/**
 * Lower-cased words of a sentence, tokens blanked to "token". "3+2", "1.5", "1,500", "9/31",
 * "twenty-one" and "you've" stay one word each.
 */
function wordsOf(sentence: string): string[] {
  const text = sentence.replace(/\{[^{}]*\}/g, " token ").replace(/’/g, "'");
  return Array.from(text.matchAll(/[\p{L}\p{N}\p{M}]+(?:[-+.,/'][\p{L}\p{N}\p{M}]+)*|[%％]/gu), (m) => m[0].toLowerCase());
}

/** A digit in any script as its ASCII digit: digit blocks run 0 to 9 from their first code point. */
function asciiDigits(w: string): string {
  return w.replace(/\p{Nd}/gu, (d) => {
    let n = 0;
    for (let cp = d.codePointAt(0)! - 1; DIGIT.test(String.fromCodePoint(cp)); cp--) n++;
    return String(n % 10);
  });
}

/** The value of a word written in digits ("12", "1,500", "1.5", "٩"), or undefined. */
function digitValue(word: string): number | undefined {
  const w = asciiDigits(word);
  if (/^\d{1,3}(?:,\d{3})+$/.test(w)) return Number(w.replace(/,/g, ""));
  if (/^\d+(?:\.\d+)?$/.test(w)) return Number(w);
  return undefined;
}

const isDecimal = (w: string) => /^\d+[.,]\d+$/.test(w) && !/^\d{1,3}(?:,\d{3})+$/.test(w);
/** "nine", "thirty-one", "two-point-one". */
const isNumberWord = (w: string) => w.split("-").every((p) => NUMBER_WORDS.has(p) || p === "point") && w !== "point";
const isNumber = (w: string) => digitValue(w) !== undefined || isNumberWord(w);

/** Whether a record noun is among the `n` words after `i`. */
function nounWithin(ws: readonly string[], i: number, n: number): number {
  for (let j = i + 1; j <= i + n && j < ws.length; j++) {
    // "each week", "this week": the period of a schedule, not what is counted
    if (RECORD_NOUNS.has(ws[j]!) && !SCHEDULE_LEADS.has(ws[j - 1]!) && ws[j - 1] !== "this") return j;
  }
  return -1;
}

/** Whether a record noun is among the next `n` words after `i`, not counting fillers. */
function nounAfterFillers(ws: readonly string[], i: number, n: number): boolean {
  let seen = 0;
  for (let j = i + 1; j < ws.length && seen < n; j++) {
    if (FILLERS.has(ws[j]!)) continue;
    if (RECORD_NOUNS.has(ws[j]!)) return true;
    seen++;
  }
  return false;
}

/** Whether the words after a record noun at `k` make it a schedule: "a day", "per session", "daily". */
function isSchedule(ws: readonly string[], k: number): boolean {
  const next = ws[k + 1] ?? "";
  if (SCHEDULE_WORDS.has(next) || (SCHEDULE_LEADS.has(next) && SCHEDULE_PERIODS.has(ws[k + 2] ?? ""))) return true;
  return SCHEDULE_PHRASES.some((p) => p.every((w, n) => ws[k + 1 + n] === w));
}

/** "mate in 2", "mate in two": the length of a forced line, never a count. */
const isMateIn = (ws: readonly string[], i: number) => ws[i - 1] === "in" && ws[i - 2] === "mate";

/** Whether "you" is followed within three words by a verb from `RECORD_VERBS`: "you hung a piece". */
function youDid(ws: readonly string[]): boolean {
  return ws.some((w, i) => w === "you" && ws.slice(i + 1, i + 4).some((v) => RECORD_VERBS.has(v)));
}

/** Whether "in", "of" or "out of" comes within four words before `i`: "in 9 games", "out of 12 games". */
function ledByRecord(ws: readonly string[], i: number): boolean {
  return ws.slice(Math.max(0, i - 4), i).some((w) => RECORD_LEADS.has(w));
}

/**
 * Rule A: a value the model was shown, copied in digits before a record noun ("in 9 games"),
 * unless it is a schedule. In a drill, where numbers are mostly practice ("play 5 games, then
 * review them"), only when the sentence also states the record: the value comes after "in",
 * "of" or "out of", is followed by "of" ("9 of your games"), or "you" did something.
 */
export function copiesShownValue(ws: readonly string[], shown: ReadonlySet<number>, record: boolean): boolean {
  const did = !record && youDid(ws);
  return ws.some((w, i) => {
    const v = digitValue(w);
    if (v === undefined || !shown.has(v) || isMateIn(ws, i)) return false;
    if (MOVE_WORDS.has(ws[i - 1] ?? "") || MOVE_WORDS.has(ws[i + 1] ?? "")) return false; // "move 12", "after 14 moves"
    const k = nounWithin(ws, i, 3);
    if (k < 0 || isSchedule(ws, k)) return false;
    return record || did || ledByRecord(ws, i) || ws[i + 1] === "of";
  });
}

/** Rule B: a statistic, whatever its numbers: a percentage, a rate per hundred, a share of games, a decimal rate. */
export function isStatistic(ws: readonly string[]): boolean {
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i]!;
    if (w === "%" || w === "％" || w === "percent" || w === "percentage" || (w === "per" && ws[i + 1] === "cent")) return true;
    // "two per hundred moves"; with a token ("{mistakeRate} mistakes per hundred moves") it is the intended form.
    if (w === "per" && (ws[i + 1] === "hundred" || ws[i + 1] === "100") && ws.slice(Math.max(0, i - 3), i).some(isNumber)) return true;
    if (/^\d+\/\d+$/.test(w) && nounAfterFillers(ws, i, 3)) return true;
    if (isNumber(w)) {
      let j = i + 1;
      if (ws[j] === "out" && ws[j + 1] === "of") j += 2;
      else if (ws[j] === "of" || ws[j] === "in") j += 1;
      else j = -1;
      if (j > 0) {
        while (j < ws.length && FILLERS.has(ws[j]!)) j++;
        if (j < ws.length && isNumber(ws[j]!) && nounAfterFillers(ws, j, 3)) return true;
      }
    }
    if (isDecimal(w)) {
      const before = ws[i - 1] === "of" ? ws[i - 2] : ws[i - 1];
      if (RATE_WORDS.has(ws[i + 1] ?? "") || RATE_WORDS.has(before ?? "")) return true;
    }
    for (const f of FRACTIONS) {
      if (f.every((p, n) => ws[i + n] === p)) {
        const at = i + f.length;
        if (ws[at] === "of" && SHARE_OF.has(ws[at + 1] ?? "") && SHARE_NOUNS.has(ws[at + 2] ?? "")) return true;
      }
    }
  }
  return false;
}

/** Words after a number that make it a count of the examples shown: "two of those games", "two of them", "two examples". */
const OF_GROUP: ReadonlySet<string> = new Set(["those", "these", "them"]);
const EXAMPLE_NOUNS: ReadonlySet<string> = new Set(["example", "examples"]);
const GROUP_NOUNS: ReadonlySet<string> = new Set(["game", "games", "example", "examples"]);

/**
 * Rule C's other half, with or without "you": a number word counting the games or examples
 * shown ("Two of those games show it", "Two of them", "two examples"). "one of them" alone may
 * be about pieces, so "one" counts only before "of those games" or "example".
 */
function countsExamples(ws: readonly string[]): boolean {
  return ws.some((w, i) => {
    const many = COUNT_WORDS.has(w) || (w.includes("-") && isNumberWord(w));
    if (!many && w !== "one") return false;
    const next = ws[i + 1] ?? "";
    if (EXAMPLE_NOUNS.has(next)) return true;
    if (next !== "of" || !OF_GROUP.has(ws[i + 2] ?? "")) return false;
    return many || GROUP_NOUNS.has(ws[i + 3] ?? "");
  });
}

/** Rule C, record fields only: a count in words before a record noun in a sentence about the player ("you hung a piece in nine games"). */
export function countsInWords(ws: readonly string[]): boolean {
  if (countsExamples(ws)) return true;
  if (!ws.some((w) => SECOND_PERSON.has(w))) return false;
  return ws.some((w, i) => {
    // "at once" means at the same time, not one time.
    const repeat = (w === "once" && ws[i - 1] !== "at") || w === "twice";
    // "fifty-two" counts like "fifty".
    const compound = w.includes("-") && isNumberWord(w);
    const counts = COUNT_WORDS.has(w) || compound || (repeat && REPEAT_BEFORE.has(ws[i + 1] ?? ""));
    return counts && !isMateIn(ws, i) && nounAfterFillers(ws, i, 2);
  });
}

/** What a field is checked against: the values the model was shown, and whether it describes the record (summary, title, why). */
export interface CountContext {
  shown: ReadonlySet<number>;
  record: boolean;
  /** The summary's token values, set only when checking a newly written summary. */
  summaryShown?: ReadonlySet<number>;
}

/*
 * The per-game form. New wording states the overall level only with `{mistakesPerGame}` and
 * never a per-hundred-move figure, which the report shows only in its details.
 */

/** Nouns a per-game level counts: "1.4 mistakes a game". */
export const MISTAKE_NOUNS: ReadonlySet<string> = new Set(["mistake", "mistakes", "blunder", "blunders", "error", "errors"]);
/** Words that, before "game", make a per-game level: "a game", "per game", "each game", "every game". */
export const PER_GAME_LEADS: ReadonlySet<string> = new Set(["a", "per", "each", "every"]);
/** Words a summary's own value may not stand next to in digits. */
export const SUMMARY_VALUE_NOUNS: ReadonlySet<string> = new Set(["game", "games", "mistake", "mistakes"]);

/** "per hundred" or "per 100", whatever comes before it. */
export function perHundred(ws: readonly string[]): boolean {
  return ws.some((w, i) => w === "per" && (ws[i + 1] === "hundred" || ws[i + 1] === "100"));
}

/**
 * A level written as a number of the model's own in a summary: a number followed within two
 * words by a mistake noun and "a/per/each/every game" ("1.4 mistakes a game"), or a digit copy
 * of one of the summary's token values next to "game(s)" or "mistake(s)" ("31 games").
 */
export function writesLevel(ws: readonly string[], summaryShown: ReadonlySet<number>): boolean {
  return ws.some((w, i) => {
    const v = digitValue(w);
    if (v === undefined) return false;
    for (let k = i + 1; k <= i + 2 && k < ws.length; k++) {
      if (MISTAKE_NOUNS.has(ws[k]!) && PER_GAME_LEADS.has(ws[k + 1] ?? "") && ws[k + 2] === "game") return true;
    }
    return summaryShown.has(v) && (SUMMARY_VALUE_NOUNS.has(ws[i + 1] ?? "") || SUMMARY_VALUE_NOUNS.has(ws[i - 1] ?? ""));
  });
}

/** Whether one sentence states a count about the player's games. */
export function statesCount(sentence: string, ctx: CountContext): boolean {
  const ws = wordsOf(sentence);
  return copiesShownValue(ws, ctx.shown, ctx.record) || isStatistic(ws) || (ctx.record && countsInWords(ws));
}

/** The sentences of `text` that state a count about the player's games. */
export function countSentences(text: string, ctx: CountContext): string[] {
  return sentences(text).filter((s) => statesCount(s, ctx));
}

/** The summary's token values the model was shown, as numbers. */
export function summaryValues(draft: ReportDraft): Set<number> {
  const values = new Set<number>();
  for (const t of WORDING_SUMMARY_TOKENS) {
    const v = digitValue(summaryTokenValues(draft)[t]);
    if (v !== undefined) values.add(v);
  }
  return values;
}

/** The record values the model was shown for this draft: games, and each focus item's games affected and occurrences. */
export function shownValues(draft: ReportDraft): Set<number> {
  const values = new Set<number>([draft.current.games]);
  for (const f of draft.focus) {
    const stat = draft.current.stats.find((s) => s.patternId === f.patternId);
    values.add(stat?.games ?? draft.current.games);
    values.add(stat?.gamesAffected ?? 0);
    values.add(stat?.occurrences ?? 0);
  }
  return values;
}

/**
 * The values shown for one item's why and steps: the draft's record values and the item's
 * blind spots' counts, totals and games. Its drill and the summary are checked against the
 * record values alone, so a blind-spot number never blocks a practice quantity there.
 */
export function shownForItem(draft: ReportDraft, item: Pick<FocusChoice, "blindSpots"> | undefined): Set<number> {
  const values = shownValues(draft);
  for (const b of item?.blindSpots ?? []) {
    values.add(b.count);
    values.add(b.of);
    values.add(b.games);
  }
  return values;
}

/*
 * The move rule. The model may name the moves and squares of the example stories it was shown
 * for an item, and nothing else, so a move in the text is always one the page can show. The
 * summary is about the whole period and names no move or square at all.
 */

/** A move in SAN in running text: piece moves, pawn captures, promotions and castling. A bare pawn move reads as a square. */
const SAN_IN_TEXT =
  /(?<![\p{L}\p{N}])(?:[O0]-[O0](?:-[O0])?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=?[QRBN])?|[a-h]x[a-h][1-8](?:=?[QRBN])?|[a-h][18]=?[QRBN])[+#]?(?![\p{L}\p{N}])/gu;
/** A square name in running text. */
const SQUARE_IN_TEXT = /(?<![\p{L}\p{N}])[a-h][1-8](?![\p{L}\p{N}])/gu;
const SAN_PARTS = /^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=?([QRBN]))?$/;

/**
 * A move's identity for matching: castling by side; a piece move by piece and destination
 * (so "Nd2", "Nxd2" and "Nbd2" all name the same knight move); a pawn move by its file when it
 * captures, destination and promotion. Check, mate and annotation marks are ignored.
 */
export function moveKey(san: string): string {
  const s = san.replace(/[+#!?]/g, "").replace(/0/g, "O");
  if (s.startsWith("O-O")) return s.startsWith("O-O-O") ? "O-O-O" : "O-O";
  const m = SAN_PARTS.exec(s);
  if (!m) return s;
  const [, piece, file, , x, dest, promo] = m;
  if (piece) return `${piece}${dest}`;
  return `${x && file ? `${file}x` : ""}${dest}${promo ?? ""}`;
}

/** The squares holding a piece in a FEN's placement field; none when the field does not read as one. */
function occupiedSquares(fen: string): string[] {
  const ranks = (fen.split(" ")[0] ?? "").split("/");
  if (ranks.length !== 8) return [];
  const out: string[] = [];
  ranks.forEach((row, r) => {
    let file = 0;
    for (const ch of row) {
      if (ch >= "1" && ch <= "8") file += Number(ch);
      else {
        if (file < 8) out.push(`${"abcdefgh"[file]}${8 - r}`);
        file++;
      }
    }
  });
  return out;
}

/** The destination square of a move in SAN, when it has one. */
function sanSquare(san: string): string | undefined {
  return SAN_PARTS.exec(san.replace(/[+#!?]/g, ""))?.[5];
}

/** What an item's text may name: its example stories' moves (played, punishing line, better line) and their squares. */
export interface ExampleMoves {
  /** `moveKey` of every move. */
  keys: ReadonlySet<string>;
  /** The moves in SAN, in story order, for the repair hint. */
  sans: readonly string[];
  /** Squares of those moves and of the pieces the stories name. */
  squares: ReadonlySet<string>;
}

/**
 * The moves and squares of an item's examples. With a story: the move played, the punishing
 * line, the moves the game went on with (`inGame`) and the better line, their from and to
 * squares, and the pieces hit, behind or lost.
 * An example without a story gives its move played and best move, the squares of its
 * position's pieces, and the moves and squares its fact names.
 */
export function exampleMoves(examples: readonly FocusExample[]): ExampleMoves {
  const keys = new Set<string>();
  const sans: string[] = [];
  const squares = new Set<string>();
  const addSan = (san: string) => {
    keys.add(moveKey(san));
    if (!sans.includes(san)) sans.push(san);
    const sq = sanSquare(san);
    if (sq) squares.add(sq);
  };
  const addMove = (m: MoveDetail) => {
    addSan(m.san);
    squares.add(m.from);
    squares.add(m.to);
  };
  for (const e of examples) {
    const st = e.story;
    if (st) {
      for (const m of [st.played, ...st.punish, ...st.better, ...(st.inGame?.moves ?? [])]) addMove(m);
      for (const p of [...st.targets, st.rear, st.lost, st.inGame?.lost]) if (p) squares.add(p.square);
      if (st.betterReason?.square) squares.add(st.betterReason.square);
    } else {
      // An example from before stories is shown with its position and fact, so its pieces and
      // the moves and squares its fact names may be named.
      addSan(e.played);
      if (e.best) addSan(e.best);
      for (const sq of occupiedSquares(e.fen)) squares.add(sq);
      const fact = namedMoves(e.evidence ?? "");
      for (const m of fact.moves) addSan(m);
      for (const sq of fact.squares) squares.add(sq);
    }
  }
  return { keys, sans, squares };
}

/** The moves and the squares (outside those moves) a text names, in order, tokens left out. */
export function namedMoves(text: string): { moves: string[]; squares: string[] } {
  const plain = text
    .replace(/\{[^{}]*\}/g, " ")
    // "nxe5" is a knight capture written in lower case ("bxe5" stays a pawn capture); "E5" is the square e5.
    .replace(/(?<![\p{L}\p{N}])([kqrn])x([a-h][1-8])/gu, (_, p: string, sq: string) => `${p.toUpperCase()}x${sq}`)
    .replace(/(?<![\p{L}\p{N}])([A-H])([1-8])(?![\p{L}\p{N}])/gu, (_, f: string, r: string) => `${f.toLowerCase()}${r}`);
  const moves = Array.from(plain.matchAll(SAN_IN_TEXT), (m) => m[0]);
  const rest = plain.replace(SAN_IN_TEXT, " ");
  const squares = Array.from(rest.matchAll(SQUARE_IN_TEXT), (m) => m[0]);
  return { moves, squares };
}

/*
 * Pointing at the examples. A why may hold `{example1}` and `{example2}`, each opening the
 * sentence about that example; the reader sees "In your first example (move 23, as White)" in
 * its place. The text before the first marker (the lead) says what the pattern is in plain
 * words and names no move or square. Each segment, from a marker to the next one or the end,
 * names only its own example's moves and squares, and only a few of them.
 */

/** Distinct moves and squares one segment may name. */
export const MAX_NAMES_PER_EXAMPLE = 3;

/** One part of a why: the lead (`example` 0) or the text from marker `{exampleN}` up to the next marker. */
export interface WhySegment {
  example: number;
  text: string;
}

const MARKER_IN_TEXT = /\{example(\d+)\}/g;

/** A why cut at its example markers: the lead first (possibly empty), then one segment per marker, marker left out. */
export function whySegments(why: string): WhySegment[] {
  const out: WhySegment[] = [];
  let at = 0;
  let example = 0;
  for (const m of why.matchAll(MARKER_IN_TEXT)) {
    out.push({ example, text: why.slice(at, m.index) });
    example = Number(m[1]);
    at = m.index + m[0].length;
  }
  out.push({ example, text: why.slice(at) });
  return out;
}

/** The why as the reader sees it: each marker the item has an example for as its phrase. */
function filledWhy(why: string, examples: readonly FocusExample[]): string {
  const values: Record<string, string> = exampleMarkerValues(examples);
  return why.replace(MARKER_IN_TEXT, (m, n: string) => values[`example${n}`] ?? m);
}

const ORDINAL = ["", "first", "second"];
const exampleName = (n: number, count: number) => (count === 1 ? "the example" : `your ${ORDINAL[n] ?? `#${n}`} example`);

/**
 * Errors for moves and squares the why names, segment by segment. A segment names only its own
 * example's moves and squares; a move both examples share passes in either. With `strict`
 * (new wording), the lead names none; otherwise (kept wording) the lead is checked against all
 * the item's examples, as text written before markers existed was.
 */
function whyMoveErrors(where: string, why: string, examples: readonly FocusExample[], strict: boolean): string[] {
  const errors: string[] = [];
  for (const seg of whySegments(why)) {
    if (seg.example === 0) {
      if (!strict) {
        errors.push(...checkMoves(where, seg.text, exampleMoves(examples)));
        continue;
      }
      const { moves, squares } = namedMoves(seg.text);
      for (const m of new Set([...moves, ...squares])) {
        errors.push(
          examples.length === 0
            ? `${where} names ${m}; this item has no examples, so say it in words without a move or square.`
            : `${where} names ${m} before any example marker. Open with the pattern in plain words, with no move or square; cite a move only in a sentence that starts with its example's marker (${EXAMPLE_MARKERS.slice(0, examples.length).map((t) => `{${t}}`).join(", ")}) and a comma.`,
        );
      }
      continue;
    }
    const ex = examples[seg.example - 1];
    if (!ex) {
      // The marker check says what is wrong; kept text with such a marker cannot be shown.
      if (!strict) errors.push(`${where} uses {example${seg.example}}, but the item has no such example.`);
      continue;
    }
    const own = exampleMoves([ex]);
    const name = exampleName(seg.example, examples.length);
    const { moves, squares } = namedMoves(seg.text);
    const seen = new Set<string>();
    for (const m of moves) {
      if (own.keys.has(moveKey(m)) || seen.has(m)) continue;
      seen.add(m);
      errors.push(
        `${where} names ${m} after {example${seg.example}}, but it is not a move of ${name} (its moves: ${own.sans.join(", ") || "none"}). After a marker cite only that example's moves; put it under the right example's marker, or say it in words.`,
      );
    }
    for (const sq of squares) {
      if (own.squares.has(sq) || seen.has(sq)) continue;
      seen.add(sq);
      errors.push(
        `${where} names the square ${sq} after {example${seg.example}}, but it is not on a move or piece of ${name}. After a marker name only that example's squares, or leave the square out.`,
      );
    }
  }
  return errors;
}

/** A clause about the item itself: "This keeps coming back", "Another one", "Here". */
const ITEM_CLAUSE = /^(?:this|that|another|also|here)\b/i;
/** Words that lean on the other item: "also" anywhere in such a clause, or these at its end. */
const LEANING_END = /\b(too|as well|either)\s*$/i;
const ALSO = /\balso\b/i;
/** Words that state a loss as fact: checked under an example whose game did not take it. */
const LOSS =
  /\b(?:cost(?:s|ing)?|lost|lose|loses|losing|gone|fell|won\s+(?:your|the|an?|material))\b/gi;
/** What follows a loss word when it is not a loss: "a losing position", "fell back", "lost time". */
const NOT_A_LOSS: Readonly<Record<string, RegExp>> = {
  losing: /^\s+(?:move|moves|position|positions|side)\b/i,
  fell: /^\s+back\b/i,
  gone: /^\s+to\b/i,
  lost: /^\s+(?:time|track)\b/i,
};
/** How many words before a loss word a hedge may stand: "could have also cost". */
export const HEDGE_WINDOW = 4;
const HEDGE_WORDS: ReadonlySet<string> = new Set(["could", "would", "might", "couldn't", "wouldn't"]);
/** Denials, right before the loss word (one adverb or "have" may come between): "did not cost", "never really cost". */
const DENIALS: readonly (readonly string[])[] = [
  ["didn't"], ["doesn't"], ["never"], ["did", "not"], ["does", "not"], ["at", "no"], ["wouldn't", "have"],
];
const ADVERBS: ReadonlySet<string> = new Set(["really", "actually", "even", "quite", "ever", "just", "still", "yet", "have"]);
/** Right after the loss word: "cost nothing", "cost you nothing". */
const NOTHING_AFTER = /^\s+(?:you\s+|them\s+)?nothing\b/i;

/** Whether the loss word at `at` in `clause` is not a loss, or is hedged or denied in its own clause. */
function hedged(clause: string, at: number, word: string): boolean {
  const after = clause.slice(at + word.length);
  if (NOTHING_AFTER.test(after)) return true;
  const kind = word.toLowerCase();
  if (NOT_A_LOSS[kind]?.test(after)) return true;
  const words = clause.slice(0, at).replace(/’/g, "'").toLowerCase().split(/\s+/).filter(Boolean);
  if (words.slice(-HEDGE_WINDOW).some((w) => HEDGE_WORDS.has(w))) return true;
  const ends = (ws: readonly string[]) => DENIALS.some((d) => d.every((w, i) => ws[ws.length - d.length + i] === w));
  if (ends(words)) return true;
  const last = words.at(-1) ?? "";
  return (ADVERBS.has(last) || /^\p{L}+ly$/u.test(last)) && ends(words.slice(0, -1));
}

/** A clause that is only "too", "as well" or "either": "This one keeps coming back, too." */
const LONE_LEANING = /^(?:too|as well|either)$/i;

/**
 * Errors for words that lean on the other item in the why's first sentence: a clause about
 * the item itself ("This keeps coming back too", "This one also keeps coming back", "This too
 * keeps coming back"). Elsewhere, and in clauses about something else ("a check that could hit
 * it too"), they mean "as well" within the item and pass. A lone "too" joins the clause before it.
 */
function leaningErrors(where: string, text: string): string[] {
  const errors: string[] = [];
  const parts: string[] = [];
  for (const raw of firstSentence(text).split(/[,;:]/)) {
    const part = raw.trim();
    if (LONE_LEANING.test(part) && parts.length > 0) parts[parts.length - 1] += ` ${part}`;
    else parts.push(part);
  }
  for (const part of parts) {
    // ", and this one keeps coming back too": the joining word is not the clause's subject.
    const clause = part.replace(/^(?:and|but|so)\s+(?=(?:this|another|here)\b)/i, "");
    if (!ITEM_CLAUSE.test(clause)) continue;
    const word = ALSO.exec(clause)?.[0] ?? LEANING_END.exec(clause)?.[1] ?? /^this\s+(too)\b/i.exec(clause)?.[1];
    if (!word) continue;
    errors.push(
      `${where}, the clause "${quote(clause)}": "${word}" leans on the other item, but each item is read on its own; say it without "${word}".`,
    );
  }
  return errors;
}

/** Clauses of a text, split on , . ; : ! ? */
const clauses = (text: string) => text.split(/[,.;:!?]/);

/** The first sentence of a text, ending only at ".", "!" or "?" (a ";" does not end it). */
const firstSentence = (text: string): string => sentences(text.replace(/;/g, ","))[0] ?? "";

/**
 * The rules for a newly written why: its markers (each at most once, in order, only for
 * examples the item has, opening a sentence and followed by a comma), how many moves and squares
 * a segment names, a first sentence that leans on the other item, and a loss stated as fact
 * only for an example whose game took it.
 */
function whyRules(where: string, why: string, examples: readonly FocusExample[]): string[] {
  const errors: string[] = [];
  const found = Array.from(why.matchAll(MARKER_IN_TEXT));
  const counts = new Map<number, number>();
  let last = 0;
  for (const m of found) {
    const n = Number(m[1]);
    const token = m[0];
    counts.set(n, (counts.get(n) ?? 0) + 1);
    if (examples.length === 0) {
      errors.push(`${where} uses ${token}, but this item has no examples; say it in plain words with no marker.`);
      continue;
    }
    if (n < 1 || n > examples.length) {
      if (n <= EXAMPLE_MARKERS.length) {
        errors.push(`${where} uses ${token}, but this item has only ${examples.length === 1 ? "one example: use {example1}" : `${examples.length} examples`}.`);
      }
      continue;
    }
    if (counts.get(n) === 2) errors.push(`${where} uses ${token} more than once; use each marker once, opening the sentence about that example.`);
    if (n < last) errors.push(`${where} uses ${token} after {example${last}}; write about the examples in order, {example1} first.`);
    last = Math.max(last, n);
    const before = why.slice(0, m.index).trimEnd();
    if (before !== "" && !/[.!?]$/.test(before)) {
      errors.push(`${where}: ${token} must open a sentence (it reads "In your first example (move 23, as White)"); end the sentence before it with a full stop.`);
    }
    if (why[m.index + token.length] !== ",") {
      errors.push(`${where}: ${token} must be followed by a comma, as in "${token}, pawn to b3 opened the long diagonal".`);
    }
  }
  errors.push(...leaningErrors(where, why));
  for (const seg of whySegments(why)) {
    if (seg.example === 0) continue;
    const ex = examples[seg.example - 1];
    if (!ex) continue;
    const { moves, squares } = namedMoves(seg.text);
    const names = new Set([...moves.map(moveKey), ...squares]);
    if (names.size > MAX_NAMES_PER_EXAMPLE) {
      errors.push(
        `${where} names ${names.size} moves and squares after {example${seg.example}}; name at most ${MAX_NAMES_PER_EXAMPLE} per example, in words ("pawn to b3", "their bishop took your rook on a1").`,
      );
    }
    const missed = blindSpotFamilyOf(ex.patternId) === "missed";
    // A missed win's cost is the win not taken, so its loss words are not checked.
    if (!missed && ex.story?.inGame?.paid !== true) {
      for (const clause of clauses(seg.text)) {
        for (const c of clause.matchAll(LOSS)) {
          if (hedged(clause, c.index, c[0])) continue;
          errors.push(
            `${where} says "${c[0]}" after {example${seg.example}}, but in that game what the move allowed was not taken (paid is not true). Say what the move allowed or could have cost ("which could have cost your knight"); never that a piece was lost, gone or won.`,
          );
        }
      }
    }
  }
  return errors;
}

/** Errors for moves and squares a field names: outside the item's examples, or any at all when `allowed` is null (the summary). */
function checkMoves(where: string, text: string, allowed: ExampleMoves | null): string[] {
  const errors: string[] = [];
  const { moves, squares } = namedMoves(text);
  const seen = new Set<string>();
  const once = (k: string) => !seen.has(k) && (seen.add(k), true);
  if (!allowed) {
    for (const m of [...moves, ...squares]) {
      if (once(m)) errors.push(`${where} names ${m}; the summary names no move or square, so say it in words.`);
    }
    return errors;
  }
  const shown = allowed.sans.length > 0 ? `the moves shown: ${allowed.sans.join(", ")}` : "this item's examples show no moves";
  for (const m of moves) {
    if (allowed.keys.has(moveKey(m)) || !once(m)) continue;
    errors.push(
      `${where} names ${m}: this move is not in the examples shown (${shown}). Name only those moves, or say it in words without a move.`,
    );
  }
  for (const sq of squares) {
    if (allowed.squares.has(sq) || !once(sq)) continue;
    errors.push(
      `${where} names the square ${sq}, which is not on a move or piece in this item's examples. Name only squares from the examples shown, or leave the square out.`,
    );
  }
  return errors;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The `WORDING_SCHEMA` shape, checked by hand: every field present, a non-empty string, nothing extra. */
function readShape(json: unknown): { value?: WordingText; errors: string[] } {
  const errors: string[] = [];
  if (!isObject(json)) return { errors: ["the answer must be a JSON object with summary and focus"] };
  const str = (v: unknown, where: string): string => {
    if (typeof v !== "string" || v.trim() === "") {
      errors.push(`${where} must be a non-empty string`);
      return "";
    }
    return v;
  };
  for (const key of Object.keys(json)) if (key !== "summary" && key !== "focus") errors.push(`unexpected field ${key}`);
  const summary = str(json.summary, "summary");
  if (!Array.isArray(json.focus)) {
    errors.push("focus must be an array");
    return { errors };
  }
  // A missing steps array reads as none; the step check then says which steps are owed.
  const steps = (v: unknown, at: string): StepText[] => {
    if (v === undefined) return [];
    if (!Array.isArray(v)) {
      errors.push(`${at}.steps must be an array`);
      return [];
    }
    return v.map((s: unknown, j) => {
      const sat = `${at}.steps[${j}]`;
      if (!isObject(s)) {
        errors.push(`${sat} must be an object`);
        return { blindSpot: "", text: "" };
      }
      for (const key of Object.keys(s)) if (key !== "blindSpot" && key !== "text") errors.push(`${sat} has unexpected field ${key}`);
      return { blindSpot: str(s.blindSpot, `${sat}.blindSpot`), text: str(s.text, `${sat}.text`) };
    });
  };
  const focus = json.focus.map((f: unknown, i) => {
    const at = `focus[${i}]`;
    if (!isObject(f)) {
      errors.push(`${at} must be an object`);
      return { patternId: "", title: "", why: "", drill: "", steps: [] };
    }
    for (const key of Object.keys(f)) {
      if (!["patternId", "title", "why", "drill", "steps"].includes(key)) errors.push(`${at} has unexpected field ${key}`);
    }
    return {
      patternId: str(f.patternId, `${at}.patternId`),
      title: str(f.title, `${at}.title`),
      why: str(f.why, `${at}.why`),
      drill: str(f.drill, `${at}.drill`),
      steps: steps(f.steps, at),
    };
  });
  return errors.length > 0 ? { errors } : { value: { summary, focus }, errors };
}

/** Strips a Markdown code fence some models put around JSON. */
function unfence(text: string): string {
  const t = text.trim();
  if (!t.startsWith("```") || t.length < 6 || !t.endsWith("```")) return text;
  let body = t.slice(3, t.lastIndexOf("```"));
  if (body.slice(0, 4).toLowerCase() === "json") body = body.slice(4);
  return body;
}

const quote = (s: string) => (s.length > 120 ? `${s.slice(0, 117)}...` : s);

/** Errors for one field's text: length, tokens and sentences that state a count. */
function checkField(
  where: string,
  text: string,
  max: number,
  allowed: readonly string[],
  ctx: CountContext,
  opts: { markers?: boolean; length?: number } = {},
): string[] {
  const errors: string[] = [];
  const length = opts.length ?? text.length;
  const tooLong = length > max;
  if (tooLong) {
    errors.push(
      `${where} is ${length} characters${opts.markers ? ", counting each example marker as the phrase it stands for" : ""}; the limit is ${max}`,
    );
  }
  const list = allowed.map((t) => `{${t}}`).join(", ");
  const markers: readonly string[] = opts.markers ? EXAMPLE_MARKERS : [];
  for (const m of text.matchAll(/\{([^{}]*)\}/g)) {
    const name = m[1]!;
    if (allowed.includes(name) || markers.includes(name)) continue;
    if (name === "mistakeRate" && where === "summary") {
      errors.push(
        `summary uses {mistakeRate}; per-hundred-move figures are shown only in the report's details, so state the overall level with {mistakesPerGame} (mistakes a game) instead (allowed: ${list})`,
      );
    } else if ((PRINTED_TOKENS as readonly string[]).includes(name) && where !== "summary") {
      errors.push(
        `${where} uses {${name}}; the report prints the weeks, rate, starting rate and target lines itself, right under the wording, so leave it out (allowed: ${list})`,
      );
    } else {
      errors.push(`${where} uses {${name}}, which is not an allowed token (allowed: ${list})`);
    }
  }
  if (/[{}]/.test(text.replace(/\{[^{}]*\}/g, ""))) errors.push(`${where} has an unmatched brace; braces are only for tokens`);
  // An over-long field is already rejected; scanning it for counts would only cost time.
  if (tooLong) return errors;
  for (const s of countSentences(text, ctx)) {
    errors.push(`${where}, the sentence "${quote(s)}": Write this count with its token (${list}) or leave the number out.`);
  }
  for (const s of sentences(text)) {
    const ws = wordsOf(s);
    if (perHundred(ws)) {
      errors.push(
        `${where}, the sentence "${quote(s)}": per-hundred-move figures are shown only in the report's details, so leave "per hundred" out${where === "summary" ? " and state the overall level with {mistakesPerGame} mistakes a game" : ""}.`,
      );
    } else if (ctx.summaryShown && writesLevel(ws, ctx.summaryShown)) {
      errors.push(`${where}, the sentence "${quote(s)}": state the overall level only with {mistakesPerGame} and the counts with their tokens (${list}), never as numbers of your own.`);
    }
  }
  return errors;
}

/**
 * Parse and check the model's text against the schema and the draft: pattern ids, lengths,
 * allowed tokens, no counts written by the model, one step per blind spot in order, and moves
 * and squares only from each item's examples (none in the summary), in a why each under the
 * marker of the example it comes from (see `whyRules`). `only` limits the expected ids.
 */
export function parseWording(text: string, draft: ReportDraft, only?: string[]): WordingResult {
  let json: unknown;
  try {
    json = JSON.parse(unfence(text));
  } catch {
    return { ok: false, errors: ["the answer is not valid JSON"] };
  }
  const shape = readShape(json);
  if (!shape.value) return { ok: false, errors: shape.errors };
  const value = shape.value;

  const errors: string[] = [];
  const expected = draft.focus.map((f) => f.patternId).filter((id) => !only || only.includes(id));
  const got = value.focus.map((f) => f.patternId);
  if (got.length !== expected.length || got.some((id, i) => id !== expected[i])) {
    errors.push(
      `focus must hold exactly these patternIds in this order: [${expected.join(", ")}]; got [${got.join(", ")}]`,
    );
  }
  const shown = shownValues(draft);
  errors.push(...checkField("summary", value.summary, LIMITS.summary, WORDING_SUMMARY_TOKENS, {
      shown,
      record: true,
      summaryShown: summaryValues(draft),
    }));
  errors.push(...checkMoves("summary", value.summary, null));
  value.focus.forEach((f, i) => {
    const at = `focus[${i}] (${f.patternId})`;
    const item = draft.focus.find((c) => c.patternId === f.patternId);
    const allowed = exampleMoves(item?.examples ?? []);
    const withSpots = shownForItem(draft, item);
    const examples = item?.examples ?? [];
    for (const [field, text] of [["title", f.title], ["why", f.why], ["drill", f.drill]] as const) {
      const ctx = { shown: field === "why" ? withSpots : shown, record: field !== "drill" };
      const opts =
        field === "why"
          ? { markers: true, length: filledWhy(text, examples).length }
          : {};
      errors.push(...checkField(`${at}.${field}`, text, LIMITS[field], WORDING_FOCUS_TOKENS, ctx, opts));
    }
    // A kept item that stayed away this period: "in 0 of your games" is no way to say it.
    const affected = draft.current.stats.find((st) => st.patternId === f.patternId)?.gamesAffected ?? 0;
    if (affected === 0) {
      for (const [field, text] of [["title", f.title], ["why", f.why], ["drill", f.drill]] as const) {
        if (!text.includes("{gamesAffected}")) continue;
        errors.push(
          `${at}.${field} uses {gamesAffected}, which is 0: this pattern did not come up this period. Say that it stayed away, with no count.`,
        );
      }
    }
    errors.push(...itemMoveErrors(at, f, allowed, examples, true));
    errors.push(...whyRules(`${at}.why`, f.why, examples));
    if (item) errors.push(...checkSteps(at, f.steps, item.blindSpots ?? [], withSpots));
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}

/**
 * Move-rule errors for an item's title, drill and steps against its examples' moves and squares,
 * and for its why segment by segment (`whyMoveErrors`).
 */
function itemMoveErrors(
  at: string,
  f: WordingText["focus"][number],
  allowed: ExampleMoves,
  examples: readonly FocusExample[],
  strict: boolean,
): string[] {
  const errors: string[] = [];
  for (const [field, text] of [["title", f.title], ["drill", f.drill]] as const) {
    errors.push(...checkMoves(`${at}.${field}`, text, allowed));
  }
  errors.push(...whyMoveErrors(`${at}.why`, f.why, examples, strict));
  f.steps.forEach((s, j) => errors.push(...checkMoves(`${at}.steps[${j}] (${s.blindSpot})`, s.text, allowed)));
  return errors;
}

/**
 * Whether kept text still names only moves and squares of the item's current examples, each
 * of its why's example markers for an example the item still has and each segment only its own
 * example's moves. A later revision refreshes a kept example's story (a deeper check can change
 * its lines), so text written for the old story may name a move the page no longer shows.
 */
export function namesOnlyShown(f: WordingText["focus"][number], examples: readonly FocusExample[]): boolean {
  return itemMoveErrors("", f, exampleMoves(examples), examples, false).length === 0;
}

/**
 * Errors for an item's steps: exactly one per blind spot, in the item's blind-spot order; each
 * within the step limit, with step tokens only and the drill's number rules (the move rule is checked with the item's other fields).
 */
function checkSteps(
  at: string,
  steps: readonly StepText[],
  blindSpots: readonly { id: string }[],
  shown: ReadonlySet<number>,
): string[] {
  const errors: string[] = [];
  const expected = blindSpots.map((b) => b.id);
  const got = steps.map((s) => s.blindSpot);
  if (got.length !== expected.length || got.some((id, i) => id !== expected[i])) {
    errors.push(
      expected.length === 0
        ? `${at}.steps must be empty: this item has no blind spots; got [${got.join(", ")}]`
        : `${at}.steps must hold exactly one step per blind spot, in this order: [${expected.join(", ")}]; got [${got.join(", ")}]. Write one step for each, in that order.`,
    );
  }
  steps.forEach((s, j) => {
    const where = `${at}.steps[${j}] (${s.blindSpot})`;
    errors.push(...checkField(where, s.text, LIMITS.step, STEP_TOKENS, { shown, record: false }));
  });
  return errors;
}
