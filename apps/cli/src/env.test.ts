import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EnvFileError, loadEnv } from "./env";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bs-env-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadEnv", () => {
  it("keeps a value already set in the environment over the file", () => {
    writeFileSync(join(dir, ".env"), "BLUNDERSTRUCK_PROVIDER=gemini\nBLUNDERSTRUCK_DB=/x.db\n");
    const env: Record<string, string | undefined> = { BLUNDERSTRUCK_PROVIDER: "none" };
    const r = loadEnv({ cwd: dir, env });
    expect(env.BLUNDERSTRUCK_PROVIDER).toBe("none");
    expect(env.BLUNDERSTRUCK_DB).toBe("/x.db");
    expect(r.set).toEqual(["BLUNDERSTRUCK_DB"]);
  });

  it("keeps a value set to an empty string", () => {
    writeFileSync(join(dir, ".env"), "LICHESS_TOKEN=abc\n");
    const env: Record<string, string | undefined> = { LICHESS_TOKEN: "" };
    loadEnv({ cwd: dir, env });
    expect(env.LICHESS_TOKEN).toBe("");
  });

  it("treats a missing --env as an error", () => {
    expect(() => loadEnv({ cwd: dir, file: "nope.env", env: {} })).toThrow(EnvFileError);
  });

  it("is fine without a default .env", () => {
    const env: Record<string, string | undefined> = {};
    expect(loadEnv({ cwd: dir, env })).toEqual({ set: [] });
    expect(env).toEqual({});
  });

  it("reads --env instead of ./.env", () => {
    writeFileSync(join(dir, ".env"), "BLUNDERSTRUCK_DB=/default.db\n");
    writeFileSync(join(dir, "other.env"), "BLUNDERSTRUCK_DB=/other.db\n");
    const env: Record<string, string | undefined> = {};
    loadEnv({ cwd: dir, file: "other.env", env });
    expect(env.BLUNDERSTRUCK_DB).toBe("/other.db");
  });

  it("parses quoted values and comments", () => {
    writeFileSync(
      join(dir, ".env"),
      [
        "# a comment line",
        'A="double quoted # not a comment"',
        "B='single quoted'",
        "C=plain # trailing comment",
        "",
        "D=",
      ].join("\n"),
    );
    const env: Record<string, string | undefined> = {};
    loadEnv({ cwd: dir, env });
    // An empty value sets nothing, so a copied .env.example keeps every default.
    expect(env).toEqual({ A: "double quoted # not a comment", B: "single quoted", C: "plain" });
  });
});
