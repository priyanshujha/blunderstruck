import type { DatabaseSync } from "node:sqlite";

/** The schema version this code writes. */
export const SCHEMA_VERSION = 2;

/** How long a connection waits for another writer, in milliseconds. */
export const BUSY_TIMEOUT_MS = 5000;

/**
 * Numbered migrations, append-only: entry `i` takes the schema from version `i` to `i + 1`.
 * Never edit one that has shipped; add a new one instead.
 */
const MIGRATIONS: readonly ((db: DatabaseSync) => void)[] = [
  // 0 -> 1
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE tracks (
        track_key TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        username_lc TEXT NOT NULL,
        time_class TEXT NOT NULL,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE games (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        white_lc TEXT NOT NULL,
        black_lc TEXT NOT NULL,
        played_at TEXT NOT NULL,
        time_class TEXT NOT NULL,
        rated INTEGER NOT NULL,
        json TEXT NOT NULL
      );
      CREATE INDEX games_white_lc ON games (white_lc);
      CREATE INDEX games_black_lc ON games (black_lc);
      CREATE INDEX games_played_at ON games (played_at);
      CREATE TABLE analyses (
        game_id TEXT NOT NULL REFERENCES games (id),
        analysis_version INTEGER NOT NULL,
        depth INTEGER NOT NULL,
        engine TEXT NOT NULL,
        json TEXT NOT NULL,
        PRIMARY KEY (game_id, analysis_version, depth, engine)
      );
      CREATE TABLE period_stats (
        track_key TEXT NOT NULL,
        period_end TEXT NOT NULL,
        settings_key TEXT NOT NULL,
        json TEXT NOT NULL,
        PRIMARY KEY (track_key, period_end, settings_key)
      );
      CREATE TABLE reports (
        track_key TEXT NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        revision INTEGER NOT NULL,
        json TEXT NOT NULL,
        PRIMARY KEY (track_key, period_end)
      );
    `);
  },
  // 1 -> 2: analyses are also keyed by the depth of the deeper check (0 when none). Every
  // existing row keeps its data; its check depth is read from its JSON, which before this
  // version never held a check, so in practice every row becomes check depth 0.
  (db) => {
    db.exec(`
      CREATE TABLE analyses_v2 (
        game_id TEXT NOT NULL REFERENCES games (id),
        analysis_version INTEGER NOT NULL,
        depth INTEGER NOT NULL,
        check_depth INTEGER NOT NULL DEFAULT 0,
        engine TEXT NOT NULL,
        json TEXT NOT NULL,
        PRIMARY KEY (game_id, analysis_version, depth, check_depth, engine)
      );
      INSERT INTO analyses_v2 (game_id, analysis_version, depth, check_depth, engine, json)
        SELECT game_id, analysis_version, depth,
          COALESCE(CAST(json_extract(json, '$.check.depth') AS INTEGER), 0), engine, json
        FROM analyses;
      DROP TABLE analyses;
      ALTER TABLE analyses_v2 RENAME TO analyses;
    `);
  },
];

/** The database's schema version; 0 for a file that has never been migrated. */
export function schemaVersion(db: DatabaseSync): number {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'")
    .get();
  if (!table) return 0;
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
    | { value: unknown }
    | undefined;
  if (!row) return 0;
  const v = Number(row.value);
  if (!Number.isInteger(v) || v < 0) throw new Error(`unreadable schema_version: ${String(row.value)}`);
  return v;
}

/**
 * Bring `db` to `SCHEMA_VERSION`, one numbered migration per transaction. Refuses a database
 * written by a newer version.
 */
export function migrate(db: DatabaseSync): void {
  if (MIGRATIONS.length !== SCHEMA_VERSION) {
    throw new Error(`expected ${SCHEMA_VERSION} migrations, found ${MIGRATIONS.length}`);
  }
  checkNotNewer(schemaVersion(db));
  for (;;) {
    db.exec("BEGIN IMMEDIATE");
    try {
      // Read again under the write lock: another connection may have migrated meanwhile.
      const version = schemaVersion(db);
      checkNotNewer(version);
      if (version === SCHEMA_VERSION) {
        db.exec("COMMIT");
        return;
      }
      const step = MIGRATIONS[version];
      if (!step) throw new Error(`missing migration ${version + 1}`);
      step(db);
      db.prepare(
        "INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      ).run(String(version + 1));
      db.exec("COMMIT");
    } catch (err) {
      rollbackQuietly(db);
      throw err;
    }
  }
}

/** The database's schema is not the one this code reads, and it may not be changed here. */
export class SchemaVersionError extends Error {
  constructor(
    readonly kind: "older" | "newer",
    readonly found: number,
  ) {
    super(
      kind === "newer"
        ? `this database was written by a newer version of blunderstruck (schema ${found}; this version reads up to ${SCHEMA_VERSION})`
        : `this database uses an older schema (${found}; this version reads ${SCHEMA_VERSION}): run the report command once to update this database`,
    );
    this.name = "SchemaVersionError";
  }
}

function checkNotNewer(version: number): void {
  if (version > SCHEMA_VERSION) throw new SchemaVersionError("newer", version);
}

/** For a connection that must not write: throw unless `db` is exactly at `SCHEMA_VERSION`. */
export function requireCurrentSchema(db: DatabaseSync): void {
  const version = schemaVersion(db);
  checkNotNewer(version);
  if (version < SCHEMA_VERSION) throw new SchemaVersionError("older", version);
}

/**
 * Roll back after a failed statement. SQLite may already have rolled back on its own (a full
 * disk, an I/O error), in which case `ROLLBACK` fails; the caller rethrows the original error.
 */
export function rollbackQuietly(db: DatabaseSync): void {
  try {
    db.exec("ROLLBACK");
  } catch {
    // No transaction was active any more.
  }
}
