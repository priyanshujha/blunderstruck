import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Platform, ReportTimeClass } from "@blunderstruck/contracts";
import { UsageError, parsePort } from "./args";
import { EnvFileError, loadEnv } from "./env";
import { startServer } from "./server";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 4321;
const USAGE =
  "usage: pnpm web <lichess|chesscom> <user> [--port 4321] [--db <path>] [--time-class <class>] [--env <path>]\n" +
  "  --env  read settings such as BLUNDERSTRUCK_DB from this file (default: ./.env when present);\n" +
  "         variables already set in the environment win";

/** `--db`, else `BLUNDERSTRUCK_DB`, else `~/.blunderstruck/blunderstruck.db`. */
function dbPath(flag: string | undefined, env: NodeJS.ProcessEnv = process.env): string {
  return flag || env.BLUNDERSTRUCK_DB || join(homedir(), ".blunderstruck", "blunderstruck.db");
}

/** `pnpm web <platform> <user>`: serve the latest report on this machine only. */
async function main(): Promise<void> {
  const { values, positionals } = (() => {
    try {
      return parseArgs({
        allowPositionals: true,
        options: {
          port: { type: "string" },
          db: { type: "string" },
          "time-class": { type: "string" },
          env: { type: "string" },
        },
      });
    } catch (err) {
      throw new UsageError(`${err instanceof Error ? err.message : String(err)}\n${USAGE}`);
    }
  })();
  // Before the database path is resolved, so BLUNDERSTRUCK_DB in the file counts.
  try {
    loadEnv(values.env === undefined ? {} : { file: values.env });
  } catch (err) {
    if (err instanceof EnvFileError) {
      console.error(err.message);
      process.exit(2);
    }
    throw err;
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
  const port = values.port === undefined ? DEFAULT_PORT : parsePort(values.port);

  const started = await startServer({
    platform: platform.data,
    user,
    port,
    host: HOST,
    dbPath: dbPath(values.db),
    ...(timeClass ? { timeClass } : {}),
    ...(values.db === undefined ? {} : { dbArg: values.db }),
  });
  for (const line of started.messages) console.error(line);
  const stop = (): void => void started.stop();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = err instanceof UsageError ? 2 : 1;
});
