import { FOCUS_TOKENS, type ReportDraft, SUMMARY_TOKENS } from "@blunderstruck/contracts";

/** The words of a report: a summary and, for each focus item, a title, why and drill (token templates). */
export interface WordingText {
  summary: string;
  focus: { patternId: string; title: string; why: string; drill: string }[];
}

export type WordingResult = { ok: true; value: WordingText } | { ok: false; errors: string[] };

const LIMITS = { title: 60, why: 400, drill: 400, summary: 600 } as const;

/**
 * Persistence ("{weeksRecurred} of your last {weeksCounted} weeks") means something only
 * over this many counted weeks; below it the weeks tokens are rejected for that item.
 */
const MIN_WEEKS_FOR_PERSISTENCE = 3;
const FOCUS_TOKENS_WITHOUT_WEEKS: readonly string[] = FOCUS_TOKENS.filter(
  (t) => t !== "weeksRecurred" && t !== "weeksCounted",
);

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

/*
 * Extra rules for the record fields (summary, title, why), which describe what the player did.
 */

/** Number words other than "one". */
const NUMBER_WORD_NOT_ONE =
  "(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|twice|thrice|dozen|half|hundred)";
/** Nouns a number word may size in a record field: material, moves and squares are chess, not statistics. */
const BOARD_NOUN = "(?:pawns?|knights?|bishops?|rooks?|queens?|kings?|minor\\s+pieces|moves?|squares?|ranks?|files?|plies)";
/**
 * Any number word but "one", unless right before a board noun: "went from three to two",
 * "below two", "nine such moments" are rates or tallies; "two rooks", "three moves deep" are chess.
 * "hundred moves" is the unit of a rate and passes as a board noun.
 */
const RECORD_NUMBER_WORD = new RegExp(`\\b${NUMBER_WORD_NOT_ONE}\\b(?![\\s-]+${BOARD_NOUN}\\b)`, "i");
/** A fraction of the record: "a third of your games", "a quarter of your games", "half the games". */
const FRACTION_OF_RECORD = new RegExp(
  `\\b(?:half|thirds?|quarters?|fifths?)\\b${words(3)}(?:${RECORD_PLURAL}|${RECORD_SINGULAR})\\b`,
  "i",
);

/** Counts in a record field, after the shared checks. Tokens must already be removed. */
function findRecordCount(text: string): { kind: "digits" | "words"; match: string } | undefined {
  const shared = findCount(text);
  if (shared) return shared;
  const m = FRACTION_OF_RECORD.exec(text) ?? RECORD_NUMBER_WORD.exec(text);
  return m ? { kind: "words", match: m[0] } : undefined;
}

/*
 * The drill is advice about what to do next, so numbers there are study quantities ("three
 * times a week", "one game a day", "5 puzzles") and pass freely. Only the forms that state a
 * statistic about the player are rejected.
 */

/** Any number, in digits or words ("one" included). */
const ANY_NUMBER = `(?:\\d+|one|${NUMBER_WORD_NOT_ONE})`;
const DRILL_STATISTICS: readonly RegExp[] = [
  /** A percentage. */
  /%|\bper\s*cent\b|\bpercent\b/i,
  /** A ratio ("9/31"). */
  BARE_RATIO,
  /** A rate: "per hundred", "per 100", "in every hundred moves". */
  /\b(?:per|every|each)\s+(?:hundred|100)\b/i,
  /** A decimal: "4.25", "1,5". Move numbers ("1.e4") have no digit after the dot. */
  /\b\d+[.,]\d+\b/,
  /** A decimal in words. */
  WORDED_DECIMAL,
  /** "N of M games", "N out of M games", "N in M games", "twice in a dozen outings". */
  new RegExp(`\\b${ANY_NUMBER}\\s+(?:out\\s+of|of|in)\\s+(?:(?:your|the|my|last|recent|a)\\s+)*${ANY_NUMBER}\\b${words(2)}${RECORD_PLURAL}\\b`, "i"),
  /** "nine of your recent rated games": a count above one taken from the player's own games. */
  new RegExp(`\\b(?:\\d+|${NUMBER_WORD_NOT_ONE})\\s+of\\s+your\\b${words(3)}${RECORD_PLURAL}\\b`, "i"),
  /** A count tied to what the player did: "you hung 3 queens", "made 4 mistakes", "lost two rooks". */
  new RegExp(`\\b(?:hung|lost|blundered|missed|dropped|made|gave\\s+away|threw\\s+away)\\s+(?:[\\w']+\\s+)?${ANY_NUMBER}\\b`, "i"),
  /** A digit outside ASCII, which would not read as notation. */
  /[^\P{Nd}0-9]/u,
];

/** The first statistic found in a drill, or undefined. Tokens must already be removed. */
function findDrillStatistic(text: string): string | undefined {
  for (const re of DRILL_STATISTICS) {
    const m = re.exec(text);
    if (m) return m[0];
  }
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

type FieldKind = "record" | "drill";

/**
 * Errors for one field's text: length, tokens and counts. A record field (summary, title, why)
 * may hold no counts at all; a drill may size practice but not state a statistic.
 */
function checkField(where: string, text: string, max: number, allowed: readonly string[], kind: FieldKind): string[] {
  const errors: string[] = [];
  const tooLong = text.length > max;
  if (tooLong) errors.push(`${where} is ${text.length} characters; the limit is ${max}`);
  for (const m of text.matchAll(/\{([^{}]*)\}/g)) {
    if (!allowed.includes(m[1]!)) {
      errors.push(`${where} uses {${m[1]}}, which is not an allowed token (allowed: ${allowed.map((t) => `{${t}}`).join(", ")})`);
    }
  }
  const rest = text.replace(/\{[^{}]*\}/g, "");
  if (/[{}]/.test(rest)) errors.push(`${where} has an unmatched brace; braces are only for tokens`);
  // An over-long field is already rejected; scanning it for counts would only cost time.
  if (tooLong) return errors;
  if (kind === "drill") {
    const stat = findDrillStatistic(rest);
    if (stat) {
      errors.push(
        `${where} states a statistic ("${stat}"); a drill may size practice ("three times a week", "5 puzzles") but must not report results, so drop it`,
      );
    }
    return errors;
  }
  const count = findRecordCount(rest);
  if (count) {
    const how = count.kind === "digits" ? "writes a number" : "writes a count in words";
    errors.push(
      `${where} ${how} ("${count.match}"); this field describes the player's record, which the report prints itself, so drop the count, or move it into the drill as a study quantity`,
    );
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
  errors.push(...checkField("summary", value.summary, LIMITS.summary, SUMMARY_TOKENS, "record"));
  value.focus.forEach((f, i) => {
    const at = `focus[${i}] (${f.patternId})`;
    const weeksCounted = draft.focus.find((c) => c.patternId === f.patternId)?.reason.weeksCounted ?? 0;
    const allowed = weeksCounted >= MIN_WEEKS_FOR_PERSISTENCE ? FOCUS_TOKENS : FOCUS_TOKENS_WITHOUT_WEEKS;
    for (const [field, text] of [["title", f.title], ["why", f.why], ["drill", f.drill]] as const) {
      errors.push(...checkField(`${at}.${field}`, text, LIMITS[field], allowed, field === "drill" ? "drill" : "record"));
      if (allowed !== FOCUS_TOKENS && /\{weeks(?:Recurred|Counted)\}/.test(text)) {
        errors.push(`${at}.${field} cites weeks, but too few weeks were counted for this item; leave persistence out`);
      }
    }
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}
