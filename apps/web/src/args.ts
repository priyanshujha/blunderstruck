import { parseArgs } from "node:util";
import { Platform, ReportTimeClass } from "@blunderstruck/contracts";

/** A bad command-line argument: the process prints one line and exits 2. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

/** `--port`: decimal digits only, 0 to 65535. */
export function parsePort(value: string): number {
  const port = /^\d{1,5}$/.test(value) ? Number(value) : NaN;
  if (!(port >= 0 && port <= 65535)) throw new UsageError(`--port must be a whole number from 0 to 65535, not ${JSON.stringify(value)}`);
  return port;
}

export const DEFAULT_PORT = 4321;

export const USAGE =
  "usage: pnpm web <lichess|chesscom> <user> [--port 4321] [--db <path>] [--time-class <class>] [--env <path>]\n" +
  "       pnpm web --demo [--port 4321]\n" +
  "  --env   read settings such as BLUNDERSTRUCK_DB from this file (default: ./.env when present);\n" +
  "          variables already set in the environment win\n" +
  "  --demo  show a made-up example report, from memory: no database, engine, model key or games needed";

export type WebArgs =
  | { demo: true; port: number }
  | { demo: false; platform: Platform; user: string; port: number; db?: string; timeClass?: ReportTimeClass; env?: string };

/** `pnpm web`'s arguments. `--demo` takes only `--port`. */
export function parseWebArgs(argv: readonly string[]): WebArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        port: { type: "string" },
        db: { type: "string" },
        "time-class": { type: "string" },
        env: { type: "string" },
        demo: { type: "boolean" },
      },
    });
  } catch (err) {
    throw new UsageError(`${err instanceof Error ? err.message : String(err)}\n${USAGE}`);
  }
  const { values, positionals } = parsed;
  const port = values.port === undefined ? DEFAULT_PORT : parsePort(values.port);
  if (values.demo) {
    const extra = [values.db !== undefined && "--db", values["time-class"] !== undefined && "--time-class", values.env !== undefined && "--env", positionals.length > 0 && "player"].filter(Boolean);
    if (extra.length > 0) throw new UsageError(`--demo shows a made-up report and takes no ${extra.join(", ")}\n${USAGE}`);
    return { demo: true, port };
  }
  const [platformArg, user, ...rest] = positionals;
  const platform = Platform.safeParse(platformArg);
  if (!platform.success || !user || rest.length > 0) throw new UsageError(USAGE);
  let timeClass: ReportTimeClass | undefined;
  if (values["time-class"] !== undefined) {
    const tc = ReportTimeClass.safeParse(values["time-class"]);
    if (!tc.success) throw new UsageError(`--time-class must be one of ${ReportTimeClass.options.join(", ")}`);
    timeClass = tc.data;
  }
  return {
    demo: false,
    platform: platform.data,
    user,
    port,
    ...(values.db !== undefined ? { db: values.db } : {}),
    ...(timeClass ? { timeClass } : {}),
    ...(values.env !== undefined ? { env: values.env } : {}),
  };
}
