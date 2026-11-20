import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { storeConformance, fixtureGame, fixtureReport } from "./conformance";
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
    expect(schemaVersion(db)).toBe(1);
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
