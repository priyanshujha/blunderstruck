import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { coachLogger } from "./coach-log";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bs-coach-log-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("coachLogger", () => {
  it("is off without a file", () => {
    expect(coachLogger(undefined)).toBeUndefined();
    expect(coachLogger("")).toBeUndefined();
  });

  it("appends one JSON line per reply", () => {
    const file = join(dir, "calls.ndjson");
    const log = coachLogger(file)!;
    const usage = { inputTokens: 1200, outputTokens: 300, cachedInputTokens: 900 };
    log({ attempt: 1, text: '{"summary":"a"}', usage });
    log({ attempt: 2, text: '{"summary":"b"}', usage });
    const lines = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ attempt: 1, usage, text: '{"summary":"a"}' });
    expect(lines[1].attempt).toBe(2);
    expect(typeof lines[0].at).toBe("string");
  });
});
