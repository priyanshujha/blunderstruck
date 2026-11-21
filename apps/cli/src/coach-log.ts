import { appendFileSync } from "node:fs";
import type { ModelCall } from "@blunderstruck/coach";

/**
 * A `onModelCall` handler that appends one JSON line per model reply (call number, token usage,
 * the wording check's errors, reply text) to `file`, or undefined when no file is named. The line holds the reply only,
 * never the prompt or a key. A file that cannot be written is reported once through `warn`
 * (stderr by default) and never stops the report.
 */
export function coachLogger(
  file: string | undefined,
  warn: (message: string) => void = (m) => process.stderr.write(`${m}\n`),
): ((c: ModelCall) => void) | undefined {
  if (!file) return undefined;
  let warned = false;
  return (c) => {
    const line = { at: new Date().toISOString(), attempt: c.attempt, usage: c.usage, errors: c.errors, text: c.text };
    try {
      appendFileSync(file, `${JSON.stringify(line)}\n`);
    } catch (e) {
      if (warned) return;
      warned = true;
      const why = e instanceof Error && "code" in e ? ` (${String((e as NodeJS.ErrnoException).code)})` : "";
      warn(`BLUNDERSTRUCK_COACH_LOG: could not write to ${file}${why}; the report goes on without the log.`);
    }
  };
}
