import { homedir } from "node:os";
import { join } from "node:path";
import { UsageError, parseWebArgs } from "./args";
import { EnvFileError, loadEnv } from "./env";
import { startServer } from "./server";

const HOST = "127.0.0.1";

/** `--db`, else `BLUNDERSTRUCK_DB`, else `~/.blunderstruck/blunderstruck.db`. */
function dbPath(flag: string | undefined, env: NodeJS.ProcessEnv = process.env): string {
  return flag || env.BLUNDERSTRUCK_DB || join(homedir(), ".blunderstruck", "blunderstruck.db");
}

/** `pnpm web <platform> <user>`: serve the latest report on this machine only. `pnpm web --demo`: a made-up one. */
async function main(): Promise<void> {
  const args = parseWebArgs(process.argv.slice(2));
  if (!args.demo) {
    // Before the database path is resolved, so BLUNDERSTRUCK_DB in the file counts.
    try {
      loadEnv(args.env === undefined ? {} : { file: args.env });
    } catch (err) {
      if (err instanceof EnvFileError) {
        console.error(err.message);
        process.exit(2);
      }
      throw err;
    }
  }
  const started = args.demo
    ? await startServer({ demo: true, platform: "lichess", user: "", port: args.port, host: HOST, dbPath: "" })
    : await startServer({
        platform: args.platform,
        user: args.user,
        port: args.port,
        host: HOST,
        dbPath: dbPath(args.db),
        ...(args.timeClass ? { timeClass: args.timeClass } : {}),
        ...(args.db === undefined ? {} : { dbArg: args.db }),
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
