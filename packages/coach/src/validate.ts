import { type ReportDraft, SUMMARY_TOKENS } from "@blunderstruck/contracts";

/** The words of a report: a summary and, for each focus item, a title, why and drill (token templates). */
export interface WordingText {
  summary: string;
  focus: { patternId: string; title: string; why: string; drill: string }[];
}

export type WordingResult = { ok: true; value: WordingText } | { ok: false; errors: string[] };

const LIMITS = { title: 60, why: 400, drill: 400, summary: 600 } as const;

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

/** Rule C, record fields only: a count in words before a record noun in a sentence about the player ("you hung a piece in nine games"). */
export function countsInWords(ws: readonly string[]): boolean {
  if (!ws.some((w) => SECOND_PERSON.has(w))) return false;
  return ws.some((w, i) => {
    // "at once" means at the same time, not one time.
    const repeat = (w === "once" && ws[i - 1] !== "at") || w === "twice";
    const counts = COUNT_WORDS.has(w) || (repeat && REPEAT_BEFORE.has(ws[i + 1] ?? ""));
    return counts && !isMateIn(ws, i) && nounAfterFillers(ws, i, 2);
  });
}

/** What a field is checked against: the values the model was shown, and whether it describes the record (summary, title, why). */
export interface CountContext {
  shown: ReadonlySet<number>;
  record: boolean;
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
  const focus = json.focus.map((f: unknown, i) => {
    const at = `focus[${i}]`;
    if (!isObject(f)) {
      errors.push(`${at} must be an object`);
      return { patternId: "", title: "", why: "", drill: "" };
    }
    for (const key of Object.keys(f)) {
      if (!["patternId", "title", "why", "drill"].includes(key)) errors.push(`${at} has unexpected field ${key}`);
    }
    return {
      patternId: str(f.patternId, `${at}.patternId`),
      title: str(f.title, `${at}.title`),
      why: str(f.why, `${at}.why`),
      drill: str(f.drill, `${at}.drill`),
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
function checkField(where: string, text: string, max: number, allowed: readonly string[], ctx: CountContext): string[] {
  const errors: string[] = [];
  const tooLong = text.length > max;
  if (tooLong) errors.push(`${where} is ${text.length} characters; the limit is ${max}`);
  const list = allowed.map((t) => `{${t}}`).join(", ");
  for (const m of text.matchAll(/\{([^{}]*)\}/g)) {
    const name = m[1]!;
    if (allowed.includes(name)) continue;
    if ((PRINTED_TOKENS as readonly string[]).includes(name) && where !== "summary") {
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
  return errors;
}

/**
 * Parse and check the model's text against the schema and the draft: pattern ids, lengths,
 * allowed tokens and no counts written by the model. `only` limits the expected ids.
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
  errors.push(...checkField("summary", value.summary, LIMITS.summary, SUMMARY_TOKENS, { shown, record: true }));
  value.focus.forEach((f, i) => {
    const at = `focus[${i}] (${f.patternId})`;
    for (const [field, text] of [["title", f.title], ["why", f.why], ["drill", f.drill]] as const) {
      errors.push(...checkField(`${at}.${field}`, text, LIMITS[field], WORDING_FOCUS_TOKENS, { shown, record: field !== "drill" }));
    }
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}
