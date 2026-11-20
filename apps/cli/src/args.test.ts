import { ConfigError } from "@blunderstruck/coach";
import { describe, expect, it } from "vitest";
import { MAX_DEPTH, intOption, parseDbArgs, parseReportArgs } from "./args";

const configError = (fn: () => unknown, message?: RegExp) => {
  expect(fn).toThrow(ConfigError);
  if (message) expect(fn).toThrow(message);
};

describe("intOption", () => {
  it("accepts decimal digits within the range", () => {
    expect(intOption("depth", "12", 0, 1, 30)).toBe(12);
    expect(intOption("depth", undefined, 7, 1, 30)).toBe(7);
    expect(intOption("examples", "0", 2, 0, 2)).toBe(0);
  });

  it.each(["1e3", "0x10", "-1", "+3", "1.5", " 3", "3 ", "", "abc", "99999999999999999999"])("refuses %j", (v) => {
    configError(() => intOption("n", v, 0, 0));
  });

  it("refuses values outside the range and names it", () => {
    configError(() => intOption("depth", "0", 12, 1, 30), /--depth must be a whole number from 1 to 30/);
    configError(() => intOption("depth", "31", 12, 1, 30));
    configError(() => intOption("max-games", "0", 0, 1), /--max-games must be a whole number of at least 1/);
  });
});

describe("parseReportArgs", () => {
  it("applies defaults", () => {
    expect(parseReportArgs(["lichess", "someone"])).toEqual({
      opts: { platform: "lichess", username: "someone", depth: 12, force: false, sampleOnly: false },
      json: false,
      all: false,
    });
  });

  it("reads every flag", () => {
    const a = parseReportArgs([
      "chesscom",
      "someone",
      "--time-class",
      "blitz",
      "--depth",
      "14",
      "--db",
      "/tmp/x.db",
      "--provider",
      "gemini",
      "--env",
      "my.env",
      "--band",
      "club",
      "--as-of",
      "2026-11-01T00:00:00Z",
      "--now",
      "--sample-only",
      "--max-games",
      "40",
      "--json",
      "--all",
    ]);
    expect(a).toEqual({
      opts: {
        platform: "chesscom",
        username: "someone",
        timeClass: "blitz",
        depth: 14,
        band: "club",
        asOf: "2026-11-01T00:00:00Z",
        force: true,
        sampleOnly: true,
        maxGames: 40,
      },
      db: "/tmp/x.db",
      provider: "gemini",
      envFile: "my.env",
      json: true,
      all: true,
    });
  });

  it("accepts flags before, between and after the positionals, and --flag=value", () => {
    const a = parseReportArgs(["--json", "lichess", "--depth=8", "someone", "--max-games", "5"]);
    expect(a.opts).toMatchObject({ platform: "lichess", username: "someone", depth: 8, maxGames: 5 });
    expect(a.json).toBe(true);
  });

  it("refuses unknown flags", () => {
    configError(() => parseReportArgs(["lichess", "someone", "--bogus"]), /bogus/);
  });

  it("refuses a missing value", () => {
    configError(() => parseReportArgs(["lichess", "someone", "--db"]));
  });

  it("refuses a value that looks like a flag", () => {
    configError(() => parseReportArgs(["lichess", "someone", "--db", "--json"]));
  });

  it("refuses a value given to a boolean flag", () => {
    configError(() => parseReportArgs(["lichess", "someone", "--now=yes"]));
  });

  it("refuses bad numbers", () => {
    configError(() => parseReportArgs(["lichess", "someone", "--depth", "1e3"]));
    configError(() => parseReportArgs(["lichess", "someone", "--depth", String(MAX_DEPTH + 1)]));
    configError(() => parseReportArgs(["lichess", "someone", "--depth", "0"]));
    configError(() => parseReportArgs(["lichess", "someone", "--max-games", "0"]));
    configError(() => parseReportArgs(["lichess", "someone", "--max-games", "0x10"]));
  });

  it("refuses values outside their lists", () => {
    configError(() => parseReportArgs(["lichess", "someone", "--time-class", "daily"]), /--time-class must be one of/);
    configError(() => parseReportArgs(["lichess", "someone", "--band", "master"]), /--band must be one of/);
    configError(() => parseReportArgs(["lichess", "someone", "--provider", "openai"]), /--provider must be one of/);
  });

  it("refuses a bad platform, a missing user and extra positionals", () => {
    configError(() => parseReportArgs(["chess24", "someone"]), /usage: report/);
    configError(() => parseReportArgs(["lichess"]), /usage: report/);
    configError(() => parseReportArgs(["lichess", "someone", "extra"]), /usage: report/);
  });
});

describe("parseDbArgs", () => {
  it("reads export and import with their flags in any order", () => {
    expect(parseDbArgs(["export", "out.ndjson", "--db", "a.db", "--force", "--env", "e.env"])).toEqual({
      action: "export",
      file: "out.ndjson",
      db: "a.db",
      envFile: "e.env",
      force: true,
    });
    expect(parseDbArgs(["--db", "a.db", "import", "in.ndjson"])).toEqual({
      action: "import",
      file: "in.ndjson",
      db: "a.db",
      force: false,
    });
  });

  it("refuses unknown flags, missing values and flag-like values", () => {
    configError(() => parseDbArgs(["export", "--bogus", "f"]), /bogus/);
    configError(() => parseDbArgs(["export", "f", "--db"]));
    configError(() => parseDbArgs(["export", "f", "--db", "--force"]));
  });

  it("refuses a bad action, a missing file, extra positionals and --force on import", () => {
    configError(() => parseDbArgs(["dump", "f"]), /usage: db/);
    configError(() => parseDbArgs(["export"]), /usage: db/);
    configError(() => parseDbArgs(["export", "f", "g"]), /usage: db/);
    configError(() => parseDbArgs(["import", "f", "--force"]), /--force/);
  });
});
