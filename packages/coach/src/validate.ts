import { FOCUS_TOKENS, type ReportDraft, SUMMARY_TOKENS } from "@blunderstruck/contracts";

/** The words of a report: a summary and, for each focus item, a title, why and drill (token templates). */
export interface WordingText {
  summary: string;
  focus: { patternId: string; title: string; why: string; drill: string }[];
}

export type WordingResult = { ok: true; value: WordingText } | { ok: false; errors: string[] };

const LIMITS = { title: 60, why: 400, drill: 400, summary: 600 } as const;

/*
 * Numbers. The player's numbers reach the text only through tokens, which code fills in. So
 * any digit is rejected unless it sits inside one of the chess notations below, each of
 * which names a move, a square or a study quantity rather than a fact about the player's
 * record. They are removed in order, then any digit left fails the check.
 */

/** A ratio written as numbers ("9/31"). Checked before anything is removed. */
const BARE_RATIO = /\b\d+\s*\/\s*\d+/;

/**
 * A move in SAN, with an optional move number: "Nf3", "Qxh7+", "exd5", "e8=Q#", "O-O-O",
 * "1.e4", "1. e4", "20...Qxh2". A bare square ("e4", "f7") matches as a pawn move. Safe: the
 * digits are ranks and move numbers of a position, not counts.
 */
const SAN_MOVE =
  /(?:\b\d{1,3}\.(?:\.\.)?\s*)?(?:\bO-O(?:-O)?|\b[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?|\b[a-h](?:x[a-h])?[1-8](?:=[QRBN])?)[+#]?(?![\w-])/g;

/** "the 7th rank", "2nd rank". Safe: a line of the board. */
const RANK_ORDINAL = /\b[1-8](?:st|nd|rd|th)[\s-]+ranks?\b/gi;

/** "move 12", "moves 10 to 15", "move 8-12". Safe: a point in a game, not how often something happened. */
const MOVE_REFERENCE = /\bmoves?\s+\d{1,3}(?:\s*(?:to|-|–|and)\s*\d{1,3})?\b/gi;

/** "mate in 2", "mate-in-3". Safe: the length of a forced line. */
const MATE_IN = /\bmate[\s-]+in[\s-]+\d\b/gi;

/**
 * A small whole number (up to 20) right before a study or look-ahead unit: "2 moves deep",
 * "the first 12 moves", "5 puzzles", "3 candidate moves". Safe: it sizes a drill. Larger
 * numbers, and "times", "games" or "weeks", are never allowed here.
 */
const STUDY_QUANTITY = /\b(?:[1-9]|1\d|20)\s+(?:moves?|puzzles?|candidates?|candidate\s+moves?|plies|ply)\b/gi;

/** Up to sixty minutes or seconds: "10 minutes a day", "keep 30 seconds". Safe: a drill's time or a clock rule. */
const CLOCK_QUANTITY = /\b(?:[1-9]|[1-5]\d|60)\s+(?:minutes?|seconds?|mins?|secs?)\b/gi;

/** "2 rooks", "3 pawns". Safe: material on the board. Up to eight; "pieces" is left out, since "9 pieces" reads as a tally. */
const PIECE_COUNT = /\b[1-8]\s+(?:pawns?|knights?|bishops?|rooks?|queens?)\b/gi;

/** A time control: "3+2", "15+10". Safe: the kind of game, not a result. */
const TIME_CONTROL = /\b\d{1,3}\+\d{1,2}\b/g;

const PERMITTED = [SAN_MOVE, RANK_ORDINAL, MOVE_REFERENCE, MATE_IN, STUDY_QUANTITY, CLOCK_QUANTITY, PIECE_COUNT, TIME_CONTROL];

/** Numbers spelled out, which would slip past the digit check. */
const NUMBER_WORD =
  "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|twice|thrice|dozen|half|hundred)";
/** Nouns that count the player's record rather than a position or a drill. */
const RECORD_NOUN = "(?:games?|times|weeks?|mistakes?|blunders?|outings?|occasions?|match(?:es)?)";
/** A number word followed, within two words, by a record noun: "nine of thirty-one games", "twelve times". */
const WORDED_COUNT = new RegExp(`\\b${NUMBER_WORD}\\b(?:[\\s-]+[\\w']+){0,2}?[\\s-]+${RECORD_NOUN}\\b`, "i");

/** The first count found in `text`, or undefined. Tokens must already be removed. */
function findCount(text: string): { kind: "digits" | "words"; match: string } | undefined {
  const ratio = BARE_RATIO.exec(text);
  if (ratio) return { kind: "digits", match: ratio[0] };
  let rest = text;
  for (const re of PERMITTED) rest = rest.replace(re, " ");
  const digit = /[^\s]*\d[^\s]*(?:\s+\S+)?/.exec(rest);
  if (digit) return { kind: "digits", match: digit[0] };
  const worded = WORDED_COUNT.exec(text);
  if (worded) return { kind: "words", match: worded[0] };
  return undefined;
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
  const m = /^\s*```(?:json)?\s*\n?([\s\S]*?)\n?\s*```\s*$/i.exec(text);
  return m ? m[1]! : text;
}

/** Errors for one field's text: length, tokens and bare counts. */
function checkField(where: string, text: string, max: number, allowed: readonly string[]): string[] {
  const errors: string[] = [];
  if (text.length > max) errors.push(`${where} is ${text.length} characters; the limit is ${max}`);
  for (const m of text.matchAll(/\{([^{}]*)\}/g)) {
    if (!allowed.includes(m[1]!)) {
      errors.push(`${where} uses {${m[1]}}, which is not an allowed token (allowed: ${allowed.map((t) => `{${t}}`).join(", ")})`);
    }
  }
  const rest = text.replace(/\{[^{}]*\}/g, "");
  if (/[{}]/.test(rest)) errors.push(`${where} has an unmatched brace; braces are only for tokens`);
  const count = findCount(rest);
  if (count) {
    const how = count.kind === "digits" ? "writes a number" : "writes a count in words";
    errors.push(`${where} ${how} ("${count.match}"); use a token such as {gamesAffected} instead of any count`);
  }
  return errors;
}

/**
 * Parse and check the model's text against the schema and the draft: pattern ids, lengths,
 * allowed tokens and no bare counts. `only` limits the expected ids.
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
  errors.push(...checkField("summary", value.summary, LIMITS.summary, SUMMARY_TOKENS));
  value.focus.forEach((f, i) => {
    const at = `focus[${i}] (${f.patternId})`;
    errors.push(...checkField(`${at}.title`, f.title, LIMITS.title, FOCUS_TOKENS));
    errors.push(...checkField(`${at}.why`, f.why, LIMITS.why, FOCUS_TOKENS));
    errors.push(...checkField(`${at}.drill`, f.drill, LIMITS.drill, FOCUS_TOKENS));
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}
