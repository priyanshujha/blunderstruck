import { parseArgs } from "node:util";
import { ConfigError } from "@blunderstruck/coach";
import { Platform, RatingBand, ReportTimeClass } from "@blunderstruck/contracts";
import { DEFAULT_DEPTH } from "@blunderstruck/progress";
import type { ReportOptions } from "@blunderstruck/report";

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
