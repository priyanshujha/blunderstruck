import { appendFileSync } from "node:fs";
import type { ModelCall } from "@blunderstruck/coach";

/**
 * A `onModelCall` handler that appends one JSON line per model reply (call number, token usage,
 * reply text) to `file`, or undefined when no file is named. The line holds the reply only,
 * never the prompt or a key.
 */
export function coachLogger(file: string | undefined): ((c: ModelCall) => void) | undefined {
  if (!file) return undefined;
  return (c) => {
    const line = { at: new Date().toISOString(), attempt: c.attempt, usage: c.usage, text: c.text };
    appendFileSync(file, `${JSON.stringify(line)}\n`);
  };
}
