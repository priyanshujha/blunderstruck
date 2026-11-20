import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { EnvFileError, loadEnv } from "./env";

describe("loadEnv", () => {
  const dir = mkdtempSync(join(tmpdir(), "bs-web-env-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, ".env"), "BLUNDERSTRUCK_DB=/from/file.db\nOTHER=x\nEMPTY=\n");

  it("fills BLUNDERSTRUCK_DB from ./.env without overriding the shell", () => {
    const env: Record<string, string | undefined> = { OTHER: "shell" };
    expect(loadEnv({ cwd: dir, env }).set).toEqual(["BLUNDERSTRUCK_DB"]);
    expect(env).toEqual({ OTHER: "shell", BLUNDERSTRUCK_DB: "/from/file.db" });
  });

  it("reads nothing when there is no ./.env", () => {
    expect(loadEnv({ cwd: join(dir, "nowhere"), env: {} })).toEqual({ set: [] });
  });

  it("refuses a named file that is missing", () => {
    expect(() => loadEnv({ cwd: dir, file: "missing.env", env: {} })).toThrow(EnvFileError);
  });
});
