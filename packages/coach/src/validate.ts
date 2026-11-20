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
 * record. They are removed in order, then any digit left (in any script) fails the check.
 * Counts spelled out in words are caught by the record-noun rules further down.
 */

/** Nouns that tally the player's record. Plural forms; "hundred moves" makes "two per hundred moves" a rate. */
const RECORD_PLURAL =
  "(?:games|times|weeks|mistakes|blunders|errors|outings|occasions|matches|pieces|positions|losses|percent|hundred[\\s-]+moves)";
/** Singular forms, caught only right after a number word ("one game"). */
const RECORD_SINGULAR = "(?:game|week|mistake|blunder|error|outing|occasion|match|piece|position|loss)";
/** "within N words": words joined by spaces or hyphens, never across punctuation. */
const words = (max: number) => `(?:[\\s-]+[\\w']+){0,${max}}?[\\s-]+`;

/** A ratio written as numbers ("9/31"). Checked before anything is removed. */
const BARE_RATIO = /\b\d+\s*\/\s*\d+/;

/**
 * A move in SAN, with an optional move number: "Nf3", "Qxh7+", "exd5", "e8=Q#", "O-O-O",
 * "0-0", "1.e4", "1. e4", "20...Qxh2". A bare square ("e4", "f7") matches as a pawn move, and
 * may be followed by a hyphen ("a1-h8 diagonal", "f7-square", "e4-e5"). Safe: the digits are
 * ranks and move numbers of a position, not counts.
 */
const SAN_MOVE =
  /(?:\b\d{1,3}\.(?:\.\.)?\s*)?(?:\bO-O(?:-O)?|\b0-0(?:-0)?|\b[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?|\b[a-h](?:x[a-h])?[1-8](?:=[QRBN])?)[+#]?(?!\w)/g;

/** "the 7th rank", "2nd rank". Safe: a line of the board. */
const RANK_ORDINAL = /\b[1-8](?:st|nd|rd|th)[\s-]+ranks?\b/gi;

/** "the 10th move". Safe: a point in a game. */
const MOVE_ORDINAL = /\b\d{1,2}(?:st|nd|rd|th)[\s-]+moves?\b/gi;

/** "move 12", "moves 10 to 15", "move 8-12". Safe: a point in a game, not how often something happened. */
const MOVE_REFERENCE = /\bmoves?\s+\d{1,3}(?:\s*(?:to|-|–|and)\s*\d{1,3})?\b/gi;

/** "the first 25 moves". Safe: the stretch of a game a drill looks at (up to 40). */
const FIRST_MOVES = /\bfirst\s+(?:[1-9]|[1-3]\d|40)\s+moves\b/gi;

/** "mate in 2", "mate-in-3". Safe: the length of a forced line. */
const MATE_IN = /\bmate[\s-]+in[\s-]+\d\b/gi;

/**
 * A small whole number (up to 20, ordinal allowed) right before a study or look-ahead unit:
 * "2 moves deep", "2-move combination", "5 puzzles", "3 candidate moves", "the 3rd check".
 * Safe: it sizes a drill. Not after "every", "per" or "each", where it becomes a rate.
 */
const STUDY_QUANTITY =
  /(?<!\b(?:every|per|each)\s+)\b(?:[1-9]|1\d|20)(?:st|nd|rd|th)?[\s-]+(?:moves?|puzzles?|candidates?|candidate\s+moves?|plies|ply|combinations?|checks?|lines?|sets?)\b/gi;

/** "all 3 before every move": the checks of a routine. Safe unless a record noun follows. */
const ALL_N = new RegExp(`\\ball\\s+[1-9]\\b(?!${words(2)}${RECORD_PLURAL}\\b)`, "gi");

/** "10-minute games", "5-second rule": a compound adjective for a time control or clock rule. Safe. */
const CLOCK_ADJECTIVE = /\b(?:[1-9]|[1-5]\d|60)-(?:minute|second|min|sec)\b/gi;

/**
 * Up to sixty minutes or seconds: "10 minutes a day", "keep 30 seconds". Safe: a drill's time
 * or a clock rule. Not as a rate ("every 30 seconds") and not tied to a record noun within
 * three words ("under 10 seconds in most games").
 */
const CLOCK_QUANTITY = new RegExp(
  `(?<!\\b(?:every|per|each)\\s+)\\b(?:[1-9]|[1-5]\\d|60)\\s+(?:minutes?|seconds?|mins?|secs?)\\b(?!${words(3)}${RECORD_PLURAL}\\b)`,
  "gi",
);

/**
 * "2 rooks", "3 pawns". Safe: material on the board, up to eight. "pieces" is left out ("9
 * pieces" reads as a tally), and a sentence about the player's losses is rejected separately.
 */
const PIECE_COUNT = /\b[1-8]\s+(?:pawns?|knights?|bishops?|rooks?|queens?)\b/gi;

/** A time control: "3+2", "15+10". Safe: the kind of game, not a result. */
const TIME_CONTROL = /\b\d{1,3}\+\d{1,2}\b/g;

const PERMITTED = [
  SAN_MOVE,
  RANK_ORDINAL,
  MOVE_ORDINAL,
  MOVE_REFERENCE,
  FIRST_MOVES,
  MATE_IN,
  STUDY_QUANTITY,
  ALL_N,
  CLOCK_ADJECTIVE,
  CLOCK_QUANTITY,
  PIECE_COUNT,
  TIME_CONTROL,
];

/** Numbers spelled out, which would slip past the digit check. "hundred" before "moves" is the unit of a rate. */
const NUMBER_WORD =
  "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|twice|thrice|dozen|half|hundred(?![\\s-]+moves))";

/** A number word within two words of a record noun: "twelve times", "one game", "nine of thirty-one games". */
const WORDED_NEAR = new RegExp(`\\b${NUMBER_WORD}\\b${words(2)}(?:${RECORD_PLURAL}|${RECORD_SINGULAR})\\b`, "i");
/** A number word within five words of a plural record noun: "nine of your recent rated games". */
const WORDED_FAR = new RegExp(`\\b${NUMBER_WORD}\\b${words(5)}${RECORD_PLURAL}\\b`, "i");
/** A decimal in words: "two point one", "two-point-one". */
const WORDED_DECIMAL = new RegExp(`\\b${NUMBER_WORD}[\\s-]+point[\\s-]+${NUMBER_WORD}\\b`, "i");

/** Verbs that make a piece count a tally of what the player gave away. */
const LOSS_VERB = /\b(?:hung|hang|hangs|hanging|lost|lose|loses|losing|blundered|dropped|drop|drops|gave\s+away|give\s+away|threw\s+away)\b/i;
/** A number, in digits or words, before a piece noun: "3 queens", "two minor pieces". */
const PIECE_TALLY = new RegExp(
  `\\b(?:\\d+|${NUMBER_WORD})${words(1)}(?:pawns?|knights?|bishops?|rooks?|queens?|pieces?)\\b`,
  "i",
);

/** The first count found in `text`, or undefined. Tokens must already be removed. */
function findCount(text: string): { kind: "digits" | "words"; match: string } | undefined {
  const ratio = BARE_RATIO.exec(text);
  if (ratio) return { kind: "digits", match: ratio[0] };
  for (const sentence of text.split(/[.!?;:]+(?:\s+|$)/)) {
    const tally = LOSS_VERB.test(sentence) ? PIECE_TALLY.exec(sentence) : null;
    if (tally) return { kind: /\d/.test(tally[0]) ? "digits" : "words", match: tally[0] };
  }
  let rest = text;
  for (const re of PERMITTED) rest = rest.replace(re, " ");
  const digit = /\S*\p{Nd}\S*(?:\s+\S+)?/u.exec(rest);
  if (digit) return { kind: "digits", match: digit[0] };
  const worded = WORDED_DECIMAL.exec(text) ?? WORDED_NEAR.exec(text) ?? WORDED_FAR.exec(text);
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
