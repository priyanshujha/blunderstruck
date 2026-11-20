import { FOCUS_TOKENS, type ReportDraft, SUMMARY_TOKENS } from "@blunderstruck/contracts";

/** The words of a report: a summary and, for each focus item, a title, why and drill (token templates). */
export interface WordingText {
  summary: string;
  focus: { patternId: string; title: string; why: string; drill: string }[];
}

export type WordingResult = { ok: true; value: WordingText } | { ok: false; errors: string[] };

const LIMITS = { title: 60, why: 400, drill: 400, summary: 600 } as const;

/** A count written as a number ("9 games", "3 times", "40%", "2 of"): the player's numbers come from tokens. */
const BARE_COUNT = /\b\d+(\.\d+)?\s*(%|percent|out of|of\b|games?\b|times\b|weeks?\b|moves?\b|per\b)/i;
/** A ratio written as numbers ("9/31"). */
const BARE_RATIO = /\b\d+\s*\/\s*\d+/;

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
  const count = BARE_COUNT.exec(text) ?? BARE_RATIO.exec(text);
  if (count) {
    errors.push(`${where} writes a number ("${count[0]}"); use a token such as {gamesAffected} instead of any count`);
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
