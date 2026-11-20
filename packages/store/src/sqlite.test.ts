import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AnalyzedGame } from "@blunderstruck/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  TRACK,
  fixtureAnalysis,
  fixtureCheckedAnalysis,
  fixtureGame,
  fixturePeriodStats,
  fixtureReport,
  storeConformance,
} from "./conformance";
import { SCHEMA_VERSION, SchemaVersionError, schemaVersion } from "./migrations";
import { openSqliteStore } from "./sqlite";

describe("sqlite store on :memory:", () => {
  storeConformance(() => openSqliteStore(":memory:"));
});

describe("sqlite store on disk", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "blunderstruck-store-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates the file in a missing directory with journal_mode delete", async () => {
    const path = join(dir, "a", "b", "test.db");
    const store = await openSqliteStore(path);
    await store.putGames([fixtureGame(1)]);
    await store.close();

    const db = new DatabaseSync(path);
    expect(db.prepare("PRAGMA journal_mode").get()).toEqual({ journal_mode: "delete" });
    expect(schemaVersion(db)).toBe(SCHEMA_VERSION);
    db.close();

    const again = await openSqliteStore(path);
    expect((await again.gamesById(["lichess:g0001"])).size).toBe(1);
    await again.close();
  });

  it("brings an empty file to the latest schema", async () => {
    const path = join(dir, "empty.db");
    writeFileSync(path, "");
    const store = await openSqliteStore(path);
    await store.close();

    const db = new DatabaseSync(path);
    expect(schemaVersion(db)).toBe(2);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r) => r.name);
    expect(tables).toEqual(["analyses", "games", "meta", "period_stats", "reports", "tracks"]);
    db.close();
  });

  it("refuses a database written by a newer version", async () => {
    const path = join(dir, "newer.db");
    const db = new DatabaseSync(path);
    db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)");
    db.exec("INSERT INTO meta (key, value) VALUES ('schema_version', '99')");
    db.close();
    await expect(openSqliteStore(path)).rejects.toThrow(
      "this database was written by a newer version of blunderstruck",
    );
  });

  it("refuses a database at schema 3", async () => {
    const path = join(dir, "three.db");
    const db = new DatabaseSync(path);
    db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)");
    db.exec("INSERT INTO meta (key, value) VALUES ('schema_version', '3')");
    db.close();
    const before = readFileSync(path);
    const err = await openSqliteStore(path).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SchemaVersionError);
    expect((err as SchemaVersionError).kind).toBe("newer");
    expect(String(err)).toContain("schema 3; this version reads up to 2");
    await expect(openSqliteStore(path, { readOnly: true })).rejects.toThrow(/newer version/);
    expect(readFileSync(path).equals(before)).toBe(true);
  });

  describe("from schema 1", () => {
    const TK = "lichess:testplayer:blitz";
    const SK = "a2.p1.d12.stockfish";
    const weekA = fixturePeriodStats("2026-11-05T00:00:00.000Z", "2026-11-12T00:00:00.000Z");
    const weekB = fixturePeriodStats("2026-11-12T00:00:00.000Z", "2026-11-19T00:00:00.000Z");
    const reportA = fixtureReport("2026-11-12T00:00:00.000Z");
    const reportB = fixtureReport("2026-11-19T00:00:00.000Z", 2);
    const games = [fixtureGame(1), fixtureGame(2), fixtureGame(3)];
    const analyses = [
      fixtureAnalysis("lichess:g0001"),
      fixtureAnalysis("lichess:g0001", { engine: { name: "stockfish", depth: 16 } }),
      fixtureAnalysis("lichess:g0002", { analysisVersion: 1 }),
    ];

    /** A file exactly as schema 1 wrote it, filled through raw SQL. */
    function writeV1(path: string, extra?: (db: DatabaseSync) => void): void {
      const db = new DatabaseSync(path, { enableForeignKeyConstraints: false });
      db.exec(`
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE tracks (track_key TEXT PRIMARY KEY, platform TEXT NOT NULL, username_lc TEXT NOT NULL,
          time_class TEXT NOT NULL, json TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE games (id TEXT PRIMARY KEY, platform TEXT NOT NULL, white_lc TEXT NOT NULL,
          black_lc TEXT NOT NULL, played_at TEXT NOT NULL, time_class TEXT NOT NULL, rated INTEGER NOT NULL,
          json TEXT NOT NULL);
        CREATE INDEX games_white_lc ON games (white_lc);
        CREATE INDEX games_black_lc ON games (black_lc);
        CREATE INDEX games_played_at ON games (played_at);
        CREATE TABLE analyses (game_id TEXT NOT NULL REFERENCES games (id), analysis_version INTEGER NOT NULL,
          depth INTEGER NOT NULL, engine TEXT NOT NULL, json TEXT NOT NULL,
          PRIMARY KEY (game_id, analysis_version, depth, engine));
        CREATE TABLE period_stats (track_key TEXT NOT NULL, period_end TEXT NOT NULL, settings_key TEXT NOT NULL,
          json TEXT NOT NULL, PRIMARY KEY (track_key, period_end, settings_key));
        CREATE TABLE reports (track_key TEXT NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL,
          revision INTEGER NOT NULL, json TEXT NOT NULL, PRIMARY KEY (track_key, period_end));
        INSERT INTO meta (key, value) VALUES ('schema_version', '1');
      `);
      db.prepare("INSERT INTO tracks VALUES (?, ?, ?, ?, ?, ?)").run(
        TK,
        "lichess",
        "testplayer",
        "blitz",
        JSON.stringify(TRACK),
        "2026-11-01T00:00:00.000Z",
      );
      for (const g of games) {
        db.prepare("INSERT INTO games VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
          g.id,
          g.platform,
          g.white.name.toLowerCase(),
          g.black.name.toLowerCase(),
          g.playedAt,
          g.timeClass,
          1,
          JSON.stringify(g),
        );
      }
      for (const a of analyses) {
        db.prepare("INSERT INTO analyses VALUES (?, ?, ?, ?, ?)").run(
          a.gameId,
          a.analysisVersion,
          a.engine.depth,
          a.engine.name,
          JSON.stringify(a),
        );
      }
      for (const w of [weekA, weekB]) {
        db.prepare("INSERT INTO period_stats VALUES (?, ?, ?, ?)").run(TK, w.end, SK, JSON.stringify(w));
      }
      for (const r of [reportA, reportB]) {
        db.prepare("INSERT INTO reports VALUES (?, ?, ?, ?, ?)").run(
          TK,
          r.periodStart,
          r.periodEnd,
          r.revision,
          JSON.stringify(r),
        );
      }
      extra?.(db);
      db.close();
    }

    it("migrates on a normal open and keeps games, analyses, period stats and reports", async () => {
      const path = join(dir, "v1.db");
      writeV1(path);
      const store = await openSqliteStore(path);

      expect(await store.tracks()).toEqual([{ ...TRACK, createdAt: "2026-11-01T00:00:00.000Z" }]);
      expect([...(await store.gamesById(games.map((g) => g.id))).values()]).toEqual(games);
      const streamed: AnalyzedGame[] = [];
      for await (const a of store.allAnalyses()) streamed.push(a);
      expect(streamed).toEqual([analyses[0], analyses[1], analyses[2]]);
      const at0 = await store.getAnalyses(["lichess:g0001", "lichess:g0002"], {
        analysisVersion: 2,
        depth: 12,
        checkDepth: 0,
      });
      expect([...at0.values()]).toEqual([analyses[0]]);
      expect(await store.listPeriodStats(TK, SK)).toEqual([weekA, weekB]);
      expect(await store.reports(TRACK)).toEqual([reportA, reportB]);

      // The new key holds a checked analysis beside the migrated unchecked one.
      await store.putAnalysis(fixtureCheckedAnalysis("lichess:g0001", 18));
      const key = { analysisVersion: 2, depth: 12 };
      expect((await store.getAnalyses(["lichess:g0001"], { ...key, checkDepth: 0 })).get("lichess:g0001")).toEqual(
        analyses[0],
      );
      expect(
        (await store.getAnalyses(["lichess:g0001"], { ...key, checkDepth: 18 })).get("lichess:g0001")?.check?.depth,
      ).toBe(18);
      await store.close();

      const db = new DatabaseSync(path);
      expect(schemaVersion(db)).toBe(2);
      const cols = db.prepare("PRAGMA table_info(analyses)").all() as { name: string; pk: number; dflt_value: unknown }[];
      expect(cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name)).toEqual([
        "game_id",
        "analysis_version",
        "depth",
        "check_depth",
        "engine",
      ]);
      expect(cols.find((c) => c.name === "check_depth")?.dflt_value).toBe("0");
      expect(db.prepare("SELECT check_depth, COUNT(*) AS n FROM analyses GROUP BY check_depth").all()).toEqual([
        { check_depth: 0, n: 3 },
        { check_depth: 18, n: 1 },
      ]);
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((r) => r.name);
      expect(tables).toEqual(["analyses", "games", "meta", "period_stats", "reports", "tracks"]);
      db.close();
    });

    it("leaves the file at schema 1 when the rebuild fails part way", async () => {
      const path = join(dir, "orphan.db");
      // A row that the rebuilt table's foreign key refuses: the migration must undo all of it.
      writeV1(path, (db) => {
        db.prepare("INSERT INTO analyses VALUES (?, ?, ?, ?, ?)").run(
          "lichess:missing",
          2,
          12,
          "stockfish",
          JSON.stringify(fixtureAnalysis("lichess:missing")),
        );
      });
      await expect(openSqliteStore(path)).rejects.toThrow(/FOREIGN KEY/i);
      const db = new DatabaseSync(path);
      expect(schemaVersion(db)).toBe(1);
      const cols = (db.prepare("PRAGMA table_info(analyses)").all() as { name: string }[]).map((c) => c.name);
      expect(cols).toEqual(["game_id", "analysis_version", "depth", "engine", "json"]);
      expect(db.prepare("SELECT COUNT(*) AS n FROM analyses").get()).toEqual({ n: 4 });
      db.close();
    });

    it("is refused by a read-only open, which leaves the file byte-identical", async () => {
      const path = join(dir, "v1-ro.db");
      writeV1(path);
      const before = readFileSync(path);
      const err = await openSqliteStore(path, { readOnly: true }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SchemaVersionError);
      expect((err as SchemaVersionError).kind).toBe("older");
      expect((err as SchemaVersionError).found).toBe(1);
      expect(String(err)).toContain("run the report command once to update this database");
      expect(readFileSync(path).equals(before)).toBe(true);
    });
  });

  it("refuses a stored row that no longer matches its contract", async () => {
    const path = join(dir, "bad.db");
    const store = await openSqliteStore(path);
    await store.putGames([fixtureGame(1)]);
    await store.close();
    const db = new DatabaseSync(path);
    db.exec(`UPDATE games SET json = '{"id":"lichess:g0001"}'`);
    db.close();
    const reopened = await openSqliteStore(path);
    await expect(reopened.gamesById(["lichess:g0001"])).rejects.toThrow("game lichess:g0001");
    await reopened.close();
  });

  it("pages through more games than one page holds", async () => {
    const store = await openSqliteStore(":memory:");
    const games = Array.from({ length: 1203 }, (_, i) => fixtureGame(i));
    await store.putGames(games);
    let n = 0;
    for await (const _ of store.allGames()) n += 1;
    expect(n).toBe(1203);
    expect((await store.gamesById(games.map((g) => g.id))).size).toBe(1203);
    await store.close();
  });

  describe("read-only", () => {
    it("reads an up-to-date file", async () => {
      const path = join(dir, "current.db");
      const rw = await openSqliteStore(path);
      await rw.putGames([fixtureGame(1)]);
      await rw.close();
      const before = readFileSync(path);

      const ro = await openSqliteStore(path, { readOnly: true });
      expect((await ro.gamesById(["lichess:g0001"])).get("lichess:g0001")).toEqual(fixtureGame(1));
      await ro.close();
      expect(readFileSync(path).equals(before)).toBe(true);
    });

    it("refuses an older schema and leaves the file byte-identical", async () => {
      const path = join(dir, "old.db");
      const db = new DatabaseSync(path);
      db.exec("CREATE TABLE unrelated (x INTEGER)");
      db.close();
      const before = readFileSync(path);

      const err = await openSqliteStore(path, { readOnly: true }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SchemaVersionError);
      expect((err as SchemaVersionError).kind).toBe("older");
      expect(String(err)).toContain("run the report command once to update this database");
      expect(readFileSync(path).equals(before)).toBe(true);
    });

    it("refuses a newer schema with the usual message", async () => {
      const path = join(dir, "newer.db");
      const db = new DatabaseSync(path);
      db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)");
      db.exec("INSERT INTO meta (key, value) VALUES ('schema_version', '99')");
      db.close();
      await expect(openSqliteStore(path, { readOnly: true })).rejects.toThrow(
        "this database was written by a newer version of blunderstruck",
      );
    });

    it("refuses a missing path and creates nothing", async () => {
      const path = join(dir, "missing", "none.db");
      await expect(openSqliteStore(path, { readOnly: true })).rejects.toThrow(/no database file/);
      expect(existsSync(join(dir, "missing"))).toBe(false);
    });

    it("rejects every write", async () => {
      const path = join(dir, "ro.db");
      await (await openSqliteStore(path)).close();
      const before = readFileSync(path);
      const ro = await openSqliteStore(path, { readOnly: true });
      await expect(ro.putGames([fixtureGame(1)])).rejects.toThrow(/read-only/);
      await expect(ro.putReport(fixtureReport("2026-11-19T00:00:00.000Z"))).rejects.toThrow(/read-only/);
      await expect(ro.putTrack({ platform: "lichess", username: "TestPlayer", timeClass: "blitz" }, "2026-11-19T00:00:00.000Z")).rejects.toThrow(/read-only/);
      await ro.close();
      expect(readFileSync(path).equals(before)).toBe(true);
    });
  });
});
