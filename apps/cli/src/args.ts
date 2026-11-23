import { parseArgs } from "node:util";
import { ConfigError } from "@blunderstruck/coach";
import { Platform, RatingBand, ReportTimeClass } from "@blunderstruck/contracts";
import { MAX_PER_RUN, PUZZLE_DEPTH } from "@blunderstruck/puzzles";
import { DEFAULT_DEPTH } from "@blunderstruck/progress";
import { DEFAULT_CHECK_DEPTH, type ReportOptions } from "@blunderstruck/report";

/** The deepest search any command accepts. */
export const MAX_DEPTH = 30;

/**
 * An integer flag: decimal digits only (no sign, exponent, hex or spaces), from `min` to `max`.
 * Missing gives `fallback`. A bad value is a `ConfigError`.
 */
export function intOption(
  name: string,
  value: string | undefined,
  fallback: number,
  min: number,
  max: number = Number.MAX_SAFE_INTEGER,
): number {
  if (value === undefined) return fallback;
  const n = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    const range = max === Number.MAX_SAFE_INTEGER ? `of at least ${min}` : `from ${min} to ${max}`;
    throw new ConfigError(`--${name} must be a whole number ${range}`);
  }
  return n;
}

/** Run `parse`, turning any error (including `parseArgs`'s own) into a `ConfigError`. */
function asConfigError<T>(parse: () => T): T {
  try {
    return parse();
  } catch (err) {
    throw err instanceof ConfigError ? err : new ConfigError(err instanceof Error ? err.message : String(err));
  }
}

export interface ReportArgs {
  opts: ReportOptions;
  db?: string;
  provider?: "anthropic" | "gemini" | "none";
  envFile?: string;
  json: boolean;
  all: boolean;
}

const PROVIDERS = ["anthropic", "gemini", "none"] as const;

function pick<T extends string>(name: string, value: string | undefined, allowed: readonly T[]): T | undefined {
  if (value === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(value)) throw new ConfigError(`--${name} must be one of ${allowed.join(", ")}`);
  return value as T;
}

/** Parse `report` arguments. Every problem is a `ConfigError` (exit 2). */
export function parseReportArgs(args: string[]): ReportArgs {
  return asConfigError(() => {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        "time-class": { type: "string" },
        depth: { type: "string" },
        "check-depth": { type: "string" },
        db: { type: "string" },
        provider: { type: "string" },
        env: { type: "string" },
        band: { type: "string" },
        "as-of": { type: "string" },
        now: { type: "boolean" },
        "sample-only": { type: "boolean" },
        "max-games": { type: "string" },
        json: { type: "boolean" },
        all: { type: "boolean" },
      },
    });
    const [platformArg, username, ...extra] = positionals;
    const platform = Platform.safeParse(platformArg);
    if (!platform.success || !username || extra.length > 0) {
      throw new ConfigError("usage: report <lichess|chesscom> <username> [options] (see blunderstruck --help)");
    }
    const timeClass = pick("time-class", values["time-class"], ReportTimeClass.options);
    const band = pick("band", values.band, RatingBand.options);
    const provider = pick("provider", values.provider, PROVIDERS);
    const maxGames = values["max-games"] === undefined ? undefined : intOption("max-games", values["max-games"], 0, 1);
    const opts: ReportOptions = {
      platform: platform.data,
      username,
      depth: intOption("depth", values.depth, DEFAULT_DEPTH, 1, MAX_DEPTH),
      // 0 turns the deeper check off.
      checkDepth: intOption("check-depth", values["check-depth"], DEFAULT_CHECK_DEPTH, 0, MAX_DEPTH),
      force: values.now === true,
      sampleOnly: values["sample-only"] === true,
      ...(timeClass ? { timeClass } : {}),
      ...(band ? { band } : {}),
      ...(values["as-of"] !== undefined ? { asOf: values["as-of"] } : {}),
      ...(maxGames !== undefined ? { maxGames } : {}),
    };
    return {
      opts,
      json: values.json === true,
      all: values.all === true,
      ...(values.db !== undefined ? { db: values.db } : {}),
      ...(provider ? { provider } : {}),
      ...(values.env !== undefined ? { envFile: values.env } : {}),
    };
  });
}

export const DB_USAGE = "usage: db export <file> [--db <path>] [--force] [--env <path>] | db import <file> [--db <path>] [--env <path>]";

export interface DbArgs {
  action: "export" | "import";
  file: string;
  db?: string;
  envFile?: string;
  force: boolean;
}

/** Parse `db export|import` arguments. Every problem is a `ConfigError` (exit 2). */
export function parseDbArgs(args: string[]): DbArgs {
  return asConfigError(() => {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: { db: { type: "string" }, force: { type: "boolean" }, env: { type: "string" } },
    });
    const [action, file, ...extra] = positionals;
    if ((action !== "export" && action !== "import") || !file || extra.length > 0) throw new ConfigError(DB_USAGE);
    if (action === "import" && values.force) throw new ConfigError("--force applies to db export only");
    return {
      action,
      file,
      force: values.force === true,
      ...(values.db !== undefined ? { db: values.db } : {}),
      ...(values.env !== undefined ? { envFile: values.env } : {}),
    };
  });
}

export interface EvalArgs {
  fen: string;
  depth: number;
  /** How many of the best moves to show; 1 keeps the single-line JSON output. */
  lines: number;
}

/** The most lines `eval --lines` asks for. */
export const MAX_EVAL_LINES = 20;

/** Parse `eval "<fen>" [--depth 16] [--lines 1]`. */
export function parseEvalArgs(args: string[]): EvalArgs {
  return asConfigError(() => {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: { depth: { type: "string" }, lines: { type: "string" } },
    });
    const [fen, ...extra] = positionals;
    if (!fen || extra.length > 0) throw new ConfigError('usage: eval "<fen>" [--depth 16] [--lines 1]');
    return {
      fen,
      depth: intOption("depth", values.depth, 16, 1, MAX_DEPTH),
      lines: intOption("lines", values.lines, 1, 1, MAX_EVAL_LINES),
    };
  });
}

export interface FetchArgs {
  platform: Platform;
  username: string;
  max: number;
  since?: Date;
  out?: string;
}

/** Parse `fetch <platform> <username> [--max 20] [--since <date>] [--out <file>]`. */
export function parseFetchArgs(args: string[]): FetchArgs {
  return asConfigError(() => {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: { max: { type: "string" }, since: { type: "string" }, out: { type: "string" } },
    });
    const [platformArg, username, ...extra] = positionals;
    const platform = Platform.safeParse(platformArg);
    if (!platform.success || !username || extra.length > 0) {
      throw new ConfigError("usage: fetch <lichess|chesscom> <username> [--max 20] [--since 2026-11-01] [--out file]");
    }
    let since: Date | undefined;
    if (values.since !== undefined) {
      since = new Date(values.since);
      if (Number.isNaN(since.getTime())) throw new ConfigError(`--since is not a date: ${values.since}`);
    }
    return {
      platform: platform.data,
      username,
      max: intOption("max", values.max, 20, 1),
      ...(since ? { since } : {}),
      ...(values.out !== undefined ? { out: values.out } : {}),
    };
  });
}

export interface AnalyzeArgs {
  file: string;
  player: string;
  index: number;
  depth: number;
  out?: string;
}

/** Parse `analyze <games.json> --player <username> [--index 0] [--depth 12] [--out file]`. */
export function parseAnalyzeArgs(args: string[]): AnalyzeArgs {
  return asConfigError(() => {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        player: { type: "string" },
        index: { type: "string" },
        depth: { type: "string" },
        out: { type: "string" },
      },
    });
    const [file, ...extra] = positionals;
    if (!file || !values.player || extra.length > 0) {
      throw new ConfigError("usage: analyze <games.json> --player <username>");
    }
    return {
      file,
      player: values.player,
      index: intOption("index", values.index, 0, 0),
      depth: intOption("depth", values.depth, 12, 1, MAX_DEPTH),
      ...(values.out !== undefined ? { out: values.out } : {}),
    };
  });
}

export interface PatternsArgs {
  file: string;
  player: string;
  max?: number;
  depth: number;
  analyses?: string;
  examples: number;
  all: boolean;
  json: boolean;
}

/** Parse `patterns <games.json> --player <username> [...]`. */
export function parsePatternsArgs(args: string[]): PatternsArgs {
  return asConfigError(() => {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        player: { type: "string" },
        max: { type: "string" },
        depth: { type: "string" },
        analyses: { type: "string" },
        examples: { type: "string" },
        all: { type: "boolean" },
        json: { type: "boolean" },
      },
    });
    const [file, ...extra] = positionals;
    if (!file || !values.player || extra.length > 0) {
      throw new ConfigError("usage: patterns <games.json> --player <username>");
    }
    return {
      file,
      player: values.player,
      depth: intOption("depth", values.depth, 12, 1, MAX_DEPTH),
      examples: intOption("examples", values.examples, 2, 0, 2),
      all: values.all === true,
      json: values.json === true,
      ...(values.max !== undefined ? { max: intOption("max", values.max, 0, 1) } : {}),
      ...(values.analyses !== undefined ? { analyses: values.analyses } : {}),
    };
  });
}

export interface PuzzlesArgs {
  platform: Platform;
  username: string;
  /** Most puzzles to print. */
  max: number;
  /** Search depth for the accepted moves. */
  depth: number;
  db?: string;
  timeClass?: ReportTimeClass;
}

/** Parse `puzzles <platform> <username> [--max N] [--depth D] [--db <path>] [--time-class <class>]`. */
export function parsePuzzlesArgs(args: string[]): PuzzlesArgs {
  return asConfigError(() => {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: { max: { type: "string" }, depth: { type: "string" }, db: { type: "string" }, "time-class": { type: "string" } },
    });
    const [platformArg, username, ...extra] = positionals;
    const platform = Platform.safeParse(platformArg);
    if (!platform.success || !username || extra.length > 0) {
      throw new ConfigError("usage: puzzles <lichess|chesscom> <username> [--max N] [--depth D] [--db <path>] [--time-class <class>]");
    }
    const timeClass = pick("time-class", values["time-class"], ReportTimeClass.options);
    return {
      platform: platform.data,
      username,
      max: intOption("max", values.max, MAX_PER_RUN, 1),
      depth: intOption("depth", values.depth, PUZZLE_DEPTH, 1, MAX_DEPTH),
      ...(values.db !== undefined ? { db: values.db } : {}),
      ...(timeClass ? { timeClass } : {}),
    };
  });
}
