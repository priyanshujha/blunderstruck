import type { IncomingMessage, ServerResponse } from "node:http";
import {
  type AnalyzedGame,
  type GameRecord,
  PATTERN_IDS,
  type PatternStat,
  type PeriodStats,
  type Track,
  WeeklyReport,
  settingsKey,
  trackKey,
} from "@blunderstruck/contracts";
import { type Store, memoryStore } from "@blunderstruck/store";
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll } from "vitest";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { templateWording } from "@blunderstruck/coach";
import { dayMonth, reportView } from "@blunderstruck/view";
import { esc } from "./html";
import { pendingGames } from "./pending";
import { pageSecurity } from "./render";
import { createHandler, handler, hostAllowed, openForWeb, problemHandler, startServer } from "./server";

// Invented players and games only. No socket: the handler is called with fake objects.
const XSS = `<script>alert(1)</script>`;
const SETTINGS = { analysisVersion: 2, patternsVersion: 1, engine: { name: "Stub 1", depth: 12 } };
const TRACK: Track = { platform: "lichess", username: "quiet_rook_test", timeClass: "rapid" };
const END = "2026-11-19T00:00:00.000Z";
const FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

interface Reply {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function call(
  h: (req: IncomingMessage, res: ServerResponse) => void,
  method: string,
  url: string,
  host: string | null = "127.0.0.1:4321",
): Promise<Reply> {
  return new Promise((resolve) => {
    const reply: Reply = { status: 0, headers: {}, body: "" };
    const res = {
      headersSent: false,
      writeHead(status: number, headers: Record<string, string>) {
        reply.status = status;
        for (const [k, v] of Object.entries(headers)) reply.headers[k.toLowerCase()] = v;
        this.headersSent = true;
        return this;
      },
      end(chunk?: Buffer | string) {
        if (chunk !== undefined) reply.body = chunk.toString();
        resolve(reply);
        return this;
      },
    };
    h({ method, url, headers: host === null ? {} : { host } } as unknown as IncomingMessage, res as unknown as ServerResponse);
  });
}

const stat = (patternId: string, games: number, moves: number, per100: number): PatternStat => {
  const occurrences = Math.round((per100 * moves) / 100);
  return { patternId, games, moves, gamesAffected: Math.min(games, occurrences), occurrences, per100Moves: per100, avgWinPctLoss: 30 };
};

function period(end: string, games: number): PeriodStats {
  const moves = games * 35;
  return {
    start: new Date(Date.parse(end) - 7 * 86_400_000).toISOString(),
    end,
    games,
    moves,
    mistakesPer100Moves: 6.5,
    settings: SETTINGS,
    stats: PATTERN_IDS.map((id) => stat(id, games, moves, id === "hung-piece" ? 2.1 : 0.2)),
  };
}
const weekEnd = (base: string, i: number): string => new Date(Date.parse(base) - i * 7 * 86_400_000).toISOString();

function report(track: Track, over: Record<string, unknown> = {}): WeeklyReport {
  const periodEnd = (over.periodEnd as string | undefined) ?? END;
  return WeeklyReport.parse({
    player: track.username,
    track,
    kind: "weekly",
    revision: 1,
    periodStart: weekEnd(periodEnd, 1),
    periodEnd,
    rating: 1420,
    band: "club",
    bandSource: "ratings",
    settings: SETTINGS,
    gamesFound: 4,
    gamesAnalyzed: 4,
    gameIds: ["lichess:g1", "lichess:g2", "lichess:g3", "lichess:g4"],
    coverage: { sampled: 4, analysed: 4, total: 4, complete: true, sampleOnly: false },
    current: period(periodEnd, 4),
    comparison: null,
    weeks: [0, 1, 2, 3, 4, 5].map((i) => period(weekEnd(periodEnd, i), 2)),
    trends: [],
    priorities: [],
    focus: [
      {
        patternId: "hung-piece",
        title: `Model says ${XSS}`,
        why: "In {gamesAffected} of {games} games.",
        drill: "Check every piece.",
        exampleGameIds: ["lichess:g1"],
        baseline: stat("hung-piece", 30, 1050, 3.0),
        target: 2.25,
        since: periodEnd,
        reason: {
          kind: "new",
          previousRank: null,
          score: 1,
          recentCost: 1,
          naiveCostThisPeriod: 1,
          rate: 2.1,
          severity: 30,
          chronicity: 0.5,
          weeksRecurred: 2,
          weeksCounted: 2,
          weeks: [true, true, null, null, null, null],
        },
        examples: [{ patternId: "hung-piece", gameId: "lichess:g1", ply: 5, winPctLoss: 30, fen: FEN, played: "Qh5" }],
      },
    ],
    progress: [],
    retired: [],
    summary: "{games} games.",
    wording: { source: "model", provider: "anthropic", model: "stub-model", wordedFor: ["hung-piece"], calls: 1 },
    notes: [],
    ...over,
  });
}

function game(n: number, over: Partial<GameRecord> = {}): GameRecord {
  return {
    id: `lichess:g${n}`,
    platform: "lichess",
    url: `https://lichess.org/g${n}`,
    playedAt: new Date(Date.parse(END) - n * 3_600_000).toISOString(),
    rated: true,
    timeClass: "rapid",
    timeControl: "600+5",
    white: { name: TRACK.username, rating: 1420 },
    black: { name: `opponent_${n}`, rating: 1410 },
    result: "white",
    opening: { eco: "C20", name: "King's Pawn Game" },
    pgn: "1. e4 e5 *",
    ...over,
  };
}

function analysis(gameId: string): AnalyzedGame {
  return {
    gameId,
    analysisVersion: SETTINGS.analysisVersion,
    engine: SETTINGS.engine,
    moves: [],
  } as unknown as AnalyzedGame;
}

async function seeded(over: Record<string, unknown> = {}): Promise<Store> {
  const store = memoryStore();
  await store.putTrack(TRACK, END);
  await store.putGames([1, 2, 3, 4].map((n) => game(n)));
  await store.putReport(report(TRACK, over));
  return store;
}

describe("handler", () => {
  it("serves the latest report with safe headers", async () => {
    const r = await call(handler(await seeded(), TRACK), "GET", "/");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["content-security-policy"]).toBe(pageSecurity().csp);
    expect(r.headers["content-security-policy"]).toMatch(/^default-src 'none'; style-src 'sha256-[A-Za-z0-9+/=]+'; script-src 'sha256-[A-Za-z0-9+/=]+';/);
    expect(r.body).toContain("Weekly report for quiet_rook_test (lichess, rapid)");
    expect(r.body).toContain("Model says &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(r.body.match(/<script/gi)).toHaveLength(1);
    expect(r.body).not.toContain("<script>alert");
  });

  it("escapes a username and an opening name from the store", async () => {
    const track: Track = { platform: "lichess", username: XSS, timeClass: "rapid" };
    const store = memoryStore();
    await store.putTrack(track, END);
    await store.putGames([game(1, { white: { name: XSS }, opening: { eco: "C20", name: `"><script>x()</script>` } })]);
    await store.putReport(report(track));
    const r = await call(handler(store, track), "GET", "/");
    expect(r.status).toBe(200);
    expect(r.body.match(/<script/gi)).toHaveLength(1);
    expect(r.body).toContain("<title>Weekly report for &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(r.body).toContain("<span>&quot;&gt;&lt;script&gt;x()&lt;/script&gt;</span>");
  });

  it("says to run the report command first when nothing is stored", async () => {
    const store = memoryStore();
    const h = createHandler(store, { ...TRACK, username: "new_pawn_test" }, { timeClassGiven: false });
    const r = await call(h, "GET", "/");
    expect(r.status).toBe(200);
    expect(r.body).toContain("No report yet");
    expect(r.body).toContain('<code class="cmd">pnpm cli report lichess new_pawn_test</code>');
    const withFlags = createHandler(store, TRACK, { dbArg: "/tmp/my games.db" });
    expect((await call(withFlags, "GET", "/")).body).toContain(
      "pnpm cli report lichess quiet_rook_test --time-class rapid --db &#39;/tmp/my games.db&#39;",
    );
    expect((await call(h, "GET", "/report.json")).status).toBe(404);
  });

  it("counts the games still being analysed in the provisional banner", async () => {
    const store = await seeded({ coverage: { sampled: 1, analysed: 1, total: 4, complete: false, sampleOnly: false } });
    await store.putAnalysis(analysis("lichess:g1"));
    await store.putAnalysis(analysis("lichess:g2"));
    const r = await call(handler(store, TRACK), "GET", "/");
    const view = reportView((await store.latestReport(TRACK))!, { pending: 2 });
    expect(r.body).toContain(view.coverage!);
    expect(r.body).toContain('<meta http-equiv="refresh" content="30">');
  });

  it("counts only the games a capped report kept as pending, not the ones it cut", async () => {
    const provisional = { sampled: 1, analysed: 1, total: 2, complete: false, sampleOnly: false };
    const store = await seeded({ coverage: provisional, cappedGameIds: ["lichess:g1", "lichess:g3"] });
    await store.putAnalysis(analysis("lichess:g1"));
    const r = (await store.latestReport(TRACK))!;
    expect(await pendingGames(store, r)).toBe(1);
    // A capped report stored before the field counts the whole period.
    const { cappedGameIds: _drop, ...old } = r;
    expect(await pendingGames(store, old)).toBe(3);
  });

  it("with a deeper check counts a game as pending until it is checked for the player's colour", async () => {
    const settings = { ...SETTINGS, checkDepth: 18 };
    const store = await seeded({ settings, coverage: { sampled: 4, analysed: 4, total: 4, complete: false, sampleOnly: false } });
    const checked = (id: string, colors: string[]) =>
      ({ ...analysis(id), check: { depth: 18, colors } }) as unknown as AnalyzedGame;
    for (const n of [1, 2, 3, 4]) await store.putAnalysis(analysis(`lichess:g${n}`)); // first looks only
    await store.putAnalysis(checked("lichess:g1", ["white"]));
    await store.putAnalysis(checked("lichess:g2", ["black"]));
    expect(await pendingGames(store, (await store.latestReport(TRACK))!)).toBe(3);
  });

  it("shows the full stored week history", async () => {
    const store = await seeded();
    for (let i = 0; i < 9; i++) await store.putPeriodStats(trackKey(TRACK), settingsKey(SETTINGS), period(weekEnd(END, i), 3));
    const r = await call(handler(store, TRACK), "GET", "/");
    expect(r.body).toContain(`<td>${dayMonth(weekEnd(END, 8), 2026)}</td>`);
  });

  it("serves an earlier report and links between them", async () => {
    const store = await seeded();
    const older = "2026-11-12T00:00:00.000Z";
    await store.putReport(report(TRACK, { periodEnd: older, kind: "first" }));
    const latest = await call(handler(store, TRACK), "GET", "/");
    expect(latest.body).toContain(`href="/report/${encodeURIComponent(older)}"`);
    const r = await call(handler(store, TRACK), "GET", `/report/${encodeURIComponent(older)}`);
    expect(r.status).toBe(200);
    expect(r.body).toContain("First report for quiet_rook_test");
    expect(r.body).toContain('<a href="/">');
    expect((await call(handler(store, TRACK), "GET", "/report/2026-11-12")).status).toBe(200);
    expect((await call(handler(store, TRACK), "GET", "/report/2020-01-01")).status).toBe(404);
  });

  it("names the player's other tracks", async () => {
    const store = await seeded();
    await store.putTrack({ ...TRACK, timeClass: "blitz" }, END);
    const r = await call(handler(store, TRACK), "GET", "/");
    expect(r.body).toContain("pnpm web lichess quiet_rook_test --time-class blitz");
  });

  it("serves the latest report as JSON that parses with the schema", async () => {
    const r = await call(handler(await seeded(), TRACK), "GET", "/report.json");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toBe("application/json; charset=utf-8");
    const parsed = WeeklyReport.parse(JSON.parse(r.body));
    expect(parsed.periodEnd).toBe(END);
  });

  it("answers HEAD without a body", async () => {
    const r = await call(handler(await seeded(), TRACK), "HEAD", "/");
    expect(r.status).toBe(200);
    expect(r.body).toBe("");
    expect(Number(r.headers["content-length"])).toBeGreaterThan(0);
  });

  it("returns 404 for an unknown path", async () => {
    const h = handler(await seeded(), TRACK);
    for (const path of ["/nope", "/report", "/report/x/y", "/report/%E0%A4%A"]) {
      expect((await call(h, "GET", path)).status).toBe(404);
    }
  });

  it("returns 405 for POST", async () => {
    const r = await call(handler(await seeded(), TRACK), "POST", "/");
    expect(r.status).toBe(405);
    expect(r.headers.allow).toBe("GET, HEAD");
  });

  it("answers only to a loopback Host on its own port", async () => {
    const h = createHandler(await seeded(), TRACK, { port: 4321 });
    for (const host of ["127.0.0.1:4321", "localhost:4321", "[::1]:4321", "LOCALHOST:4321"]) {
      expect((await call(h, "GET", "/", host)).status).toBe(200);
    }
    for (const host of [null, "evil.test:4321", "127.0.0.1:9999", "127.0.0.1", "localhost.evil.test:4321", "127.0.0.1:4321@evil"]) {
      expect((await call(h, "GET", "/", host)).status).toBe(421);
    }
  });

  it("returns 404, not an error, for a malformed percent-escape", async () => {
    const r = await call(handler(await seeded(), TRACK), "GET", "/report/%E0%A4%A");
    expect(r.status).toBe(404);
  });

  it("lists only weeks up to an earlier report's end", async () => {
    const store = await seeded();
    const older = "2026-11-12T00:00:00.000Z";
    await store.putReport(report(TRACK, { periodEnd: older, kind: "weekly" }));
    for (let i = 0; i < 3; i++) await store.putPeriodStats(trackKey(TRACK), settingsKey(SETTINGS), period(weekEnd(END, i), 3));
    const r = await call(handler(store, TRACK), "GET", `/report/${encodeURIComponent(older)}`);
    expect(r.body).toContain("<td>12 Nov</td>");
    expect(r.body).toContain("<td>5 Nov</td>");
    expect(r.body).not.toContain("<td>19 Nov</td>");
  });

  it("shows a neutral sentence and a note when stored wording no longer renders", async () => {
    const store = await seeded();
    const base = report(TRACK);
    await store.putReport({ ...base, revision: 2, summary: "{oldToken} games", focus: [{ ...base.focus[0]!, why: "In {renamed} games." }] });
    const r = await call(handler(store, TRACK), "GET", "/");
    expect(r.status).toBe(200);
    // The built-in wording stands in, as in the terminal; the note says so.
    const stored = (await store.latestReport(TRACK))!;
    const view = reportView(stored, { pending: 0, fallback: templateWording(stored) });
    if (view.body.kind !== "focus") throw new Error("expected focus");
    expect(r.body).toContain(esc(view.body.items[0]!.why));
    expect(r.body).toContain(esc(view.summary!));
    expect(r.body).toContain("Some stored wording could not be shown");
    expect(r.body.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<script>[\s\S]*?<\/script>/, "").replace(/data-b="[^"]*"/g, "")).not.toMatch(/[{}]/);
  });

  it("shows focus items on a report with no earlier focus to compare", async () => {
    const r = await call(handler(await seeded(), TRACK), "GET", "/");
    expect(r.body).toContain('<section class="focus" id="focus-1">');
    expect(r.body).not.toContain("Last report&#39;s focus");
  });
});

describe("opening the database for the page", () => {
  const dir = mkdtempSync(join(tmpdir(), "bs-web-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const CMD = "pnpm cli report lichess quiet_rook_test";

  const show = async (path: string): Promise<Reply> => {
    const opened = await openForWeb(path, CMD);
    if (!("problem" in opened)) throw new Error("expected a problem");
    return call(problemHandler(opened.problem), "GET", "/anything");
  };

  it("says to run the report command when the file is missing, and does not create it", async () => {
    const path = join(dir, "missing.db");
    const r = await show(path);
    expect(r.status).toBe(200);
    expect(r.body).toContain("Run the report command first");
    expect(r.body).toContain(`<code class="cmd">${CMD}</code>`);
    expect(r.headers["content-security-policy"]).toMatch(/^default-src 'none'/);
    await expect(openForWeb(path, CMD)).resolves.toHaveProperty("problem");
  });

  it("asks for one report run on an older database", async () => {
    const path = join(dir, "old.db");
    const db = new DatabaseSync(path);
    db.exec("CREATE TABLE unrelated (x INTEGER)");
    db.close();
    const r = await show(path);
    expect(r.body).toContain("run the report command once");
    expect(r.body).toContain(`<code class="cmd">${CMD}</code>`);
  });

  it("names a newer database plainly", async () => {
    const path = join(dir, "newer.db");
    const db = new DatabaseSync(path);
    db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)");
    db.exec("INSERT INTO meta (key, value) VALUES ('schema_version', '99')");
    db.close();
    const r = await show(path);
    expect(r.body).toContain("this database was written by a newer version of blunderstruck");
    expect(r.body).not.toContain('<code class="cmd">');
  });

  it("rejects startup on a corrupt file and leaves no server listening", async () => {
    const path = join(dir, "garbage.db");
    writeFileSync(path, "this is not a database, just some text that is long enough to have a header".repeat(20));
    await expect(openForWeb(path, CMD)).rejects.toThrow(/cannot read the database at/);

    const probe = createServer();
    const port = await new Promise<number>((resolve) => probe.listen(0, "127.0.0.1", () => resolve((probe.address() as { port: number }).port)));
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    await expect(
      startServer({ platform: "lichess", user: "quiet_rook_test", port, host: "127.0.0.1", dbPath: path }),
    ).rejects.toThrow(/cannot read the database at/);
    // The port is still free: nothing was bound.
    const again = createServer();
    await new Promise<void>((resolve, reject) => {
      again.once("error", reject);
      again.listen(port, "127.0.0.1", () => resolve());
    });
    await new Promise<void>((resolve) => again.close(() => resolve()));
  });

  it("serves the message page once started on a missing file, then stops", async () => {
    const started = await startServer({ platform: "lichess", user: "quiet_rook_test", port: 0, host: "127.0.0.1", dbPath: join(dir, "none.db") });
    expect(started.server.listening).toBe(true);
    expect(started.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    await started.stop();
    expect(started.server.listening).toBe(false);
  });
});

describe("hostAllowed", () => {
  it("accepts a Host without a port only when the port is 80", () => {
    expect(hostAllowed("localhost", 80)).toBe(true);
    expect(hostAllowed("127.0.0.1", 80)).toBe(true);
    expect(hostAllowed("[::1]", 80)).toBe(true);
    expect(hostAllowed("localhost:80", 80)).toBe(true);
    expect(hostAllowed("localhost", 4321)).toBe(false);
    expect(hostAllowed("localhost:81", 80)).toBe(false);
    expect(hostAllowed("evil.test", 80)).toBe(false);
  });
});
