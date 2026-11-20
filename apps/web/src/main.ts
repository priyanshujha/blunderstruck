import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Platform, ReportTimeClass, type Track, trackKey } from "@blunderstruck/contracts";
import { type Store, memoryStore, openSqliteStore } from "@blunderstruck/store";
import { createHandler } from "./server";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 4321;
const USAGE = "usage: pnpm web <lichess|chesscom> <user> [--port 4321] [--db <path>] [--time-class <class>]";

/** `--db`, else `BLUNDERSTRUCK_DB`, else `~/.blunderstruck/blunderstruck.db`. */
function dbPath(flag: string | undefined, env: NodeJS.ProcessEnv = process.env): string {
  return flag || env.BLUNDERSTRUCK_DB || join(homedir(), ".blunderstruck", "blunderstruck.db");
}

/** The track asked for, else the player's only one, else the one with the newest report. */
async function pickTrack(
  store: Store,
  platform: Platform,
  user: string,
  timeClass: ReportTimeClass | undefined,
): Promise<{ track: Track; others: Track[] }> {
  const prefix = `${platform}:${user.toLowerCase()}:`;
  const mine = (await store.tracks()).filter((t) => trackKey(t).startsWith(prefix));
  if (timeClass) {
    const found = mine.find((t) => t.timeClass === timeClass);
    return { track: found ?? { platform, username: user, timeClass }, others: mine.filter((t) => t !== found) };
  }
  if (mine.length === 0) return { track: { platform, username: user, timeClass: "rapid" }, others: [] };
  let best = mine[0]!;
  let bestEnd = -Infinity;
  for (const t of mine) {
    const r = await store.latestReport(t);
    const end = r ? Date.parse(r.periodEnd) : -Infinity;
    if (end > bestEnd) {
      best = t;
      bestEnd = end;
    }
  }
  return { track: best, others: mine.filter((t) => t !== best) };
}

/** `pnpm web <platform> <user>`: serve the latest report on this machine only. */
async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      port: { type: "string" },
      db: { type: "string" },
      "time-class": { type: "string" },
    },
  });
  const [platformArg, user, ...rest] = positionals;
  const platform = Platform.safeParse(platformArg);
  if (!platform.success || !user || rest.length > 0) throw new Error(USAGE);
  let timeClass: ReportTimeClass | undefined;
  if (values["time-class"] !== undefined) {
    const tc = ReportTimeClass.safeParse(values["time-class"]);
    if (!tc.success) throw new Error(`--time-class must be one of ${ReportTimeClass.options.join(", ")}`);
    timeClass = tc.data;
  }
  const port = values.port === undefined ? DEFAULT_PORT : Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("--port must be a whole number from 0 to 65535");

  // A missing database is not created: the page then says to run the report command first.
  const path = dbPath(values.db);
  const store = existsSync(path) ? await openSqliteStore(path) : memoryStore();

  const { track, others } = await pickTrack(store, platform.data, user, timeClass);
  if (!timeClass && others.length > 0) {
    console.error(
      `Showing ${track.timeClass}. Also stored: ${others.map((t) => t.timeClass).join(", ")} (use --time-class to pick one).`,
    );
  }

  const server = createServer(
    createHandler(store, track, { timeClassGiven: timeClass !== undefined, dbArg: values.db }),
  );
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, HOST, () => resolve());
  });
  const addr = server.address();
  const actual = typeof addr === "object" && addr ? addr.port : port;
  const what = (await store.latestReport(track))
    ? `${track.username} (${track.platform}, ${track.timeClass})`
    : `${track.username} (${track.platform}, no report stored yet)`;
  console.error(`Serving ${what} at http://${HOST}:${actual}/  (Ctrl-C to stop)`);

  const stop = (): void => {
    server.close();
    server.closeAllConnections();
    void store.close();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
