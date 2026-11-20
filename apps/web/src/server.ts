import { existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { type Track, type WeeklyReport, settingsKey, trackKey } from "@blunderstruck/contracts";
import { SchemaVersionError, type Store, openSqliteStore } from "@blunderstruck/store";
import { STYLE_HASH, renderMessage, renderPage } from "./render";

export interface HandlerOptions {
  /** Whether the time class was given on the command line, so commands shown repeat it. Default true. */
  timeClassGiven?: boolean;
  /** The `--db` value given on the command line, repeated in the commands shown. */
  dbArg?: string;
  /** The port the server listens on; the `Host` header must name it. Any port when unset. */
  port?: number;
}

const LOCAL_HOSTS = ["127.0.0.1", "localhost", "[::1]"];

/** DNS-rebinding guard: only a loopback name with our own port may address this server. */
export function hostAllowed(host: string | undefined, port: number | undefined): boolean {
  if (!host) return false;
  const m = /^(127\.0\.0\.1|localhost|\[::1\]):(\d{1,5})$/i.exec(host);
  if (!m || !LOCAL_HOSTS.includes(m[1]!.toLowerCase())) return false;
  return port === undefined || Number(m[2]) === port;
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": `default-src 'none'; style-src ${STYLE_HASH}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
} as const;

function send(req: IncomingMessage, res: ServerResponse, status: number, type: string, body: string, extra: Record<string, string> = {}): void {
  const buf = Buffer.from(body, "utf8");
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "Content-Type": `${type}; charset=utf-8`,
    "Content-Length": String(buf.length),
    ...extra,
  });
  res.end(req.method === "HEAD" ? undefined : buf);
}

const quote = (s: string): string => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

/** The command line for `pnpm cli report` or `pnpm web`, repeating the flags that matter. */
export function command(app: "cli report" | "web", t: Track, opts: HandlerOptions, withTimeClass: boolean): string {
  const parts = [`pnpm ${app}`, t.platform, quote(t.username)];
  if (withTimeClass) parts.push("--time-class", t.timeClass);
  if (opts.dbArg !== undefined) parts.push("--db", quote(opts.dbArg));
  return parts.join(" ");
}

/** The report named by the path segment: its `periodEnd` as an instant, or the newest one on a `YYYY-MM-DD` day. */
function findReport(reports: readonly WeeklyReport[], segment: string): WeeklyReport | undefined {
  if (/^\d{4}-\d{2}-\d{2}$/.test(segment)) return [...reports].reverse().find((r) => r.periodEnd.slice(0, 10) === segment);
  const t = Date.parse(segment);
  return Number.isNaN(t) ? undefined : reports.find((r) => Date.parse(r.periodEnd) === t);
}

/** Games of the report still waiting for analysis at the report's own settings. */
async function pendingGames(store: Store, r: WeeklyReport): Promise<number> {
  if (r.coverage.complete) return 0;
  const done = await store.analysedIds(r.gameIds, {
    analysisVersion: r.settings.analysisVersion,
    depth: r.settings.engine.depth,
    engineName: r.settings.engine.name,
  });
  return r.gameIds.filter((id) => !done.has(id)).length;
}

/** Same as `handler`, with the command-line details the pages repeat back. */
export function createHandler(
  store: Store,
  track: Track,
  opts: HandlerOptions = {},
): (req: IncomingMessage, res: ServerResponse) => void {
  const timeClassGiven = opts.timeClassGiven ?? true;

  async function otherTracks(current: Track): Promise<{ track: Track; command: string }[]> {
    const key = trackKey(current);
    const prefix = `${current.platform}:${current.username.toLowerCase()}:`;
    return (await store.tracks())
      .filter((t) => trackKey(t).startsWith(prefix) && trackKey(t) !== key)
      .sort((a, b) => a.timeClass.localeCompare(b.timeClass))
      .map((t) => ({ track: t, command: command("web", t, opts, true) }));
  }

  async function htmlFor(req: IncomingMessage, res: ServerResponse, segment: string | undefined): Promise<void> {
    const reports = await store.reports(track);
    const latest = reports.at(-1);
    const others = await otherTracks(track);
    if (!latest) {
      const body = renderPage(undefined, { pending: 0, history: [] }, {
        track,
        reportCommand: command("cli report", track, opts, timeClassGiven || others.length > 0),
        otherTracks: others,
      });
      send(req, res, 200, "text/html", body);
      return;
    }
    const report = segment === undefined ? latest : findReport(reports, segment);
    if (!report) {
      send(req, res, 404, "text/plain", "No report for that week.\n");
      return;
    }
    const [pending, history, games] = await Promise.all([
      pendingGames(store, report),
      store
        .listPeriodStats(trackKey(track), settingsKey(report.settings))
        .then((weeks) => weeks.filter((w) => Date.parse(w.end) <= Date.parse(report.periodEnd))),
      store.gamesById([...new Set(report.focus.flatMap((f) => f.examples.map((e) => e.gameId)))]),
    ]);
    const body = renderPage(report, { pending, history }, {
      track,
      reports,
      latest: report === latest,
      otherTracks: others,
      games,
    });
    send(req, res, 200, "text/html", body);
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = (req.url ?? "/").split(/[?#]/, 1)[0]!;
    if (path === "/") return htmlFor(req, res, undefined);
    if (path === "/report.json") {
      const latest = await store.latestReport(track);
      if (!latest) send(req, res, 404, "application/json", `${JSON.stringify({ error: "no report yet" })}\n`);
      else send(req, res, 200, "application/json", `${JSON.stringify(latest, null, 2)}\n`);
      return;
    }
    const m = /^\/report\/([^/]+)$/.exec(path);
    if (m) {
      let segment: string;
      try {
        segment = decodeURIComponent(m[1]!);
      } catch {
        send(req, res, 404, "text/plain", "Not found.\n");
        return;
      }
      return htmlFor(req, res, segment);
    }
    send(req, res, 404, "text/plain", "Not found.\n");
  }

  return guarded(opts, route);
}

/** Method and Host checks, then `route`; errors become a 500 without details. */
function guarded(
  opts: HandlerOptions,
  route: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    if (!hostAllowed(req.headers.host, opts.port)) {
      send(req, res, 421, "text/plain", "This server only answers to 127.0.0.1, localhost or [::1] on its own port.\n");
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      send(req, res, 405, "text/plain", "Only GET and HEAD are allowed.\n", { Allow: "GET, HEAD" });
      return;
    }
    route(req, res).catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      if (!res.headersSent) send(req, res, 500, "text/plain", "Something went wrong reading the database.\n");
      else res.end();
    });
  };
}

/** Why the database cannot be shown, as a page. */
export interface DbProblem {
  title: string;
  message: string;
  command?: string;
}

/**
 * Opens the database read-only. A missing file, or one whose schema this version does not
 * read, becomes a problem to show instead of an error.
 */
export async function openForWeb(path: string, reportCommand: string): Promise<{ store: Store } | { problem: DbProblem }> {
  if (!existsSync(path)) {
    return {
      problem: {
        title: "No database yet",
        message: `There is no database at ${path}. Run the report command first; it creates one.`,
        command: reportCommand,
      },
    };
  }
  try {
    return { store: await openSqliteStore(path, { readOnly: true }) };
  } catch (err) {
    if (!(err instanceof SchemaVersionError)) throw err;
    return err.kind === "older"
      ? { problem: { title: "Database needs an update", message: `${err.message}.`, command: reportCommand } }
      : { problem: { title: "Database from a newer version", message: `${err.message}. Update blunderstruck to read it.` } };
  }
}

/** Serves one plain page for every path, for when there is no database to read. */
export function problemHandler(problem: DbProblem, opts: HandlerOptions = {}): (req: IncomingMessage, res: ServerResponse) => void {
  const body = renderMessage(problem.title, problem.message, problem.command);
  return guarded(opts, async (req, res) => send(req, res, 200, "text/html", body));
}

/** The request handler for one track: the latest report, an earlier one, or its JSON. */
export function handler(store: Store, track: Track): (req: IncomingMessage, res: ServerResponse) => void {
  return createHandler(store, track);
}
