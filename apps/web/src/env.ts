// Same rules as the CLI's env loader (apps do not import from each other), with Node's own parser.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

export interface LoadEnvOptions {
  /** `--env`: must exist. Without it, `./.env` is read when present. */
  file?: string;
  /** Where `./.env` is looked for; defaults to the working directory. */
  cwd?: string;
  /** The environment to fill; defaults to `process.env`. */
  env?: Record<string, string | undefined>;
}

/** A named env file that does not exist. */
export class EnvFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvFileError";
  }
}

/**
 * Load settings from `--env <path>` (an error if it is missing), else from `./.env` if it
 * exists. A variable already set in the environment always wins over the file, so the file only
 * fills in what is absent. An empty value in the file (as in a copied `.env.example`) sets
 * nothing, so it never replaces a built-in default with "". Returns the file read, if any, and
 * the names it set (never values).
 */
export function loadEnv(opts: LoadEnvOptions = {}): { file?: string; set: string[] } {
  const env = opts.env ?? process.env;
  let path: string;
  if (opts.file !== undefined) {
    path = resolve(opts.cwd ?? process.cwd(), opts.file);
    if (!existsSync(path)) throw new EnvFileError(`--env: no file at ${opts.file}`);
  } else {
    path = resolve(opts.cwd ?? process.cwd(), ".env");
    if (!existsSync(path)) return { set: [] };
  }
  const parsed = parseEnv(readFileSync(path, "utf8"));
  const set: string[] = [];
  for (const [name, value] of Object.entries(parsed)) {
    if (env[name] !== undefined || value === undefined || value === "") continue;
    env[name] = value;
    set.push(name);
  }
  return { file: path, set };
}
