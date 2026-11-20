import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  AnalyzedGame,
  GameRecord,
  PeriodStats,
  Track,
  WeeklyReport,
  trackKey,
} from "@blunderstruck/contracts";
import { BUSY_TIMEOUT_MS, migrate, rollbackQuietly } from "./migrations";
import type { AnalysisKey, Store } from "./store";

/** Placeholders per `IN (...)` list, well under SQLite's variable limit. */
const CHUNK = 500;
/** Rows per page when streaming a whole table. */
const PAGE = 500;

const instant = (s: string): string => new Date(s).toISOString();

function chunks<T>(xs: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK));
  return out;
}

const marks = (n: number): string => Array.from({ length: n }, () => "?").join(", ");

/** Parse a stored JSON column with its contract schema, naming the row when it does not fit. */
function read<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: unknown } }, json: unknown, where: string): T {
  let value: unknown;
  try {
    value = JSON.parse(String(json));
  } catch {
    throw new Error(`${where}: stored JSON is unreadable`);
  }
  const r = schema.safeParse(value);
  if (!r.success) throw new Error(`${where}: stored row does not match its schema: ${String(r.error)}`);
  return r.data;
}

/**
 * Open (creating if needed) the SQLite file at `path`, or `:memory:`, and migrate it to the
 * latest schema. Uses the built-in `node:sqlite`.
 */
export async function openSqliteStore(path: string): Promise<Store> {
  if (path !== ":memory:" && !path.startsWith("file:")) mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
    db.exec("PRAGMA journal_mode = DELETE");
    db.exec("PRAGMA foreign_keys = ON");
    migrate(db);
  } catch (err) {
    db.close();
    throw err;
  }

  let closed = false;

  function tx<T>(fn: () => T): T {
    db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      db.exec("COMMIT");
      return out;
    } catch (err) {
      rollbackQuietly(db);
      throw err;
    }
  }

  const all = (sql: string, ...params: SQLInputValue[]) =>
    db.prepare(sql).all(...params) as Record<string, SQLInputValue>[];

  const putGame = db.prepare(`
    INSERT INTO games (id, platform, white_lc, black_lc, played_at, time_class, rated, json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      platform = excluded.platform, white_lc = excluded.white_lc, black_lc = excluded.black_lc,
      played_at = excluded.played_at, time_class = excluded.time_class, rated = excluded.rated,
      json = excluded.json`);
  const putAnalysisStmt = db.prepare(`
    INSERT INTO analyses (game_id, analysis_version, depth, engine, json) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (game_id, analysis_version, depth, engine) DO UPDATE SET json = excluded.json`);
  const putStats = db.prepare(`
    INSERT INTO period_stats (track_key, period_end, settings_key, json) VALUES (?, ?, ?, ?)
    ON CONFLICT (track_key, period_end, settings_key) DO UPDATE SET json = excluded.json`);

  function matching(ids: readonly string[], key: AnalysisKey): Map<string, AnalyzedGame> {
    const out = new Map<string, AnalyzedGame>();
    for (const part of chunks([...new Set(ids)])) {
      const params: SQLInputValue[] = [key.analysisVersion, key.depth, ...part];
      let sql = `SELECT game_id, engine, json FROM analyses
        WHERE analysis_version = ? AND depth = ? AND game_id IN (${marks(part.length)})`;
      if (key.engineName !== undefined) {
        sql += " AND engine = ?";
        params.push(key.engineName);
      }
      sql += " ORDER BY game_id, engine";
      for (const row of all(sql, ...params)) {
        const id = String(row.game_id);
        if (!out.has(id)) out.set(id, read(AnalyzedGame, row.json, `analysis ${id} (${String(row.engine)})`));
      }
    }
    return out;
  }

  function trackReports(t: Track): WeeklyReport[] {
    const tk = trackKey(t);
    return all("SELECT period_end, json FROM reports WHERE track_key = ? ORDER BY period_end", tk).map((row) =>
      read(WeeklyReport, row.json, `report ${tk} ${String(row.period_end)}`),
    );
  }

  return {
    async putTrack(t, createdAt) {
      const track = Track.parse(t);
      const at = instant(createdAt);
      const key = trackKey(track);
      tx(() => {
        const existing = db.prepare("SELECT created_at FROM tracks WHERE track_key = ?").get(key) as
          | { created_at: string }
          | undefined;
        if (existing && existing.created_at <= at) return;
        db.prepare(
          `INSERT INTO tracks (track_key, platform, username_lc, time_class, json, created_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (track_key) DO UPDATE SET json = excluded.json, created_at = excluded.created_at`,
        ).run(key, track.platform, track.username.toLowerCase(), track.timeClass, JSON.stringify(track), at);
      });
    },

    async tracks() {
      return all("SELECT track_key, json, created_at FROM tracks ORDER BY track_key").map((row) => ({
        ...read(Track, row.json, `track ${String(row.track_key)}`),
        createdAt: String(row.created_at),
      }));
    },

    async putGames(gs) {
      const parsed = gs.map((g) => GameRecord.parse(g));
      tx(() => {
        for (const g of parsed) {
          putGame.run(
            g.id,
            g.platform,
            g.white.name.toLowerCase(),
            g.black.name.toLowerCase(),
            instant(g.playedAt),
            g.timeClass,
            g.rated ? 1 : 0,
            JSON.stringify(g),
          );
        }
      });
    },

    async games(q) {
      const u = q.username.toLowerCase();
      const params: SQLInputValue[] = [q.platform, u, u];
      let sql = "SELECT id, json FROM games WHERE platform = ? AND (white_lc = ? OR black_lc = ?)";
      if (q.timeClass !== undefined) {
        sql += " AND time_class = ?";
        params.push(q.timeClass);
      }
      if (q.from !== undefined) {
        sql += " AND played_at >= ?";
        params.push(instant(q.from));
      }
      if (q.to !== undefined) {
        sql += " AND played_at < ?";
        params.push(instant(q.to));
      }
      sql += " ORDER BY played_at, id";
      return all(sql, ...params).map((row) => read(GameRecord, row.json, `game ${String(row.id)}`));
    },

    async gamesById(ids) {
      const out = new Map<string, GameRecord>();
      for (const part of chunks([...new Set(ids)])) {
        for (const row of all(`SELECT id, json FROM games WHERE id IN (${marks(part.length)})`, ...part)) {
          out.set(String(row.id), read(GameRecord, row.json, `game ${String(row.id)}`));
        }
      }
      return out;
    },

    async getAnalyses(ids, key) {
      return matching(ids, key);
    },

    async analysedIds(ids, key) {
      const out = new Set<string>();
      for (const part of chunks([...new Set(ids)])) {
        const params: SQLInputValue[] = [key.analysisVersion, key.depth, ...part];
        let sql = `SELECT DISTINCT game_id FROM analyses
          WHERE analysis_version = ? AND depth = ? AND game_id IN (${marks(part.length)})`;
        if (key.engineName !== undefined) {
          sql += " AND engine = ?";
          params.push(key.engineName);
        }
        for (const row of all(sql, ...params)) out.add(String(row.game_id));
      }
      return out;
    },

    async putAnalysis(a) {
      const parsed = AnalyzedGame.parse(a);
      try {
        tx(() =>
          putAnalysisStmt.run(
            parsed.gameId,
            parsed.analysisVersion,
            parsed.engine.depth,
            parsed.engine.name,
            JSON.stringify(parsed),
          ),
        );
      } catch (err) {
        if (/FOREIGN KEY/i.test(String(err))) throw new Error(`no stored game ${parsed.gameId} for this analysis`);
        throw err;
      }
    },

    async getPeriodStats(tk, sk, ends) {
      const out = new Map<string, PeriodStats>();
      const byInstant = new Map<string, string[]>();
      for (const end of ends) {
        const at = instant(end);
        byInstant.set(at, [...(byInstant.get(at) ?? []), end]);
      }
      for (const part of chunks([...byInstant.keys()])) {
        const rows = all(
          `SELECT period_end, json FROM period_stats
           WHERE track_key = ? AND settings_key = ? AND period_end IN (${marks(part.length)})`,
          tk,
          sk,
          ...part,
        );
        for (const row of rows) {
          const at = String(row.period_end);
          const s = read(PeriodStats, row.json, `period stats ${tk} ${sk} ${at}`);
          for (const end of byInstant.get(at) ?? []) out.set(end, s);
        }
      }
      return out;
    },

    async listPeriodStats(tk, sk) {
      return all(
        "SELECT period_end, json FROM period_stats WHERE track_key = ? AND settings_key = ? ORDER BY period_end",
        tk,
        sk,
      ).map((row) => read(PeriodStats, row.json, `period stats ${tk} ${sk} ${String(row.period_end)}`));
    },

    async putPeriodStats(tk, sk, s) {
      const parsed = PeriodStats.parse(s);
      tx(() => putStats.run(tk, instant(parsed.end), sk, JSON.stringify(parsed)));
    },

    async putReport(r) {
      const parsed = WeeklyReport.parse(r);
      const tk = trackKey(parsed.track);
      const end = instant(parsed.periodEnd);
      return tx(() => {
        const existing = db
          .prepare("SELECT revision FROM reports WHERE track_key = ? AND period_end = ?")
          .get(tk, end) as { revision: number } | undefined;
        if (existing && Number(existing.revision) >= parsed.revision) return "stale" as const;
        db.prepare(
          `INSERT INTO reports (track_key, period_end, revision, json) VALUES (?, ?, ?, ?)
           ON CONFLICT (track_key, period_end) DO UPDATE SET revision = excluded.revision, json = excluded.json`,
        ).run(tk, end, parsed.revision, JSON.stringify(parsed));
        return "stored" as const;
      });
    },

    async reports(t) {
      return trackReports(t);
    },

    async latestReport(t) {
      const tk = trackKey(t);
      const row = db
        .prepare("SELECT period_end, json FROM reports WHERE track_key = ? ORDER BY period_end DESC LIMIT 1")
        .get(tk) as { period_end: string; json: string } | undefined;
      return row ? read(WeeklyReport, row.json, `report ${tk} ${row.period_end}`) : undefined;
    },

    async *allGames() {
      let after: string | null = null;
      for (;;) {
        const rows: Record<string, SQLInputValue>[] =
          after === null
            ? all("SELECT id, json FROM games ORDER BY id LIMIT ?", PAGE)
            : all("SELECT id, json FROM games WHERE id > ? ORDER BY id LIMIT ?", after, PAGE);
        for (const row of rows) yield read(GameRecord, row.json, `game ${String(row.id)}`);
        if (rows.length < PAGE) return;
        after = String(rows[rows.length - 1]?.id);
      }
    },

    async *allReports() {
      let after: SQLInputValue[] | null = null;
      for (;;) {
        const rows: Record<string, SQLInputValue>[] =
          after === null
            ? all("SELECT track_key, period_end, json FROM reports ORDER BY track_key, period_end LIMIT ?", PAGE)
            : all(
                "SELECT track_key, period_end, json FROM reports WHERE (track_key, period_end) > (?, ?) ORDER BY track_key, period_end LIMIT ?",
                ...after,
                PAGE,
              );
        for (const row of rows) {
          yield read(WeeklyReport, row.json, `report ${String(row.track_key)} ${String(row.period_end)}`);
        }
        if (rows.length < PAGE) return;
        const last = rows[rows.length - 1];
        if (!last) return;
        after = [last.track_key ?? null, last.period_end ?? null];
      }
    },

    async *allAnalyses() {
      let after: SQLInputValue[] | null = null;
      const cols = "game_id, analysis_version, depth, engine";
      for (;;) {
        const rows: Record<string, SQLInputValue>[] =
          after === null
            ? all(`SELECT ${cols}, json FROM analyses ORDER BY ${cols} LIMIT ?`, PAGE)
            : all(`SELECT ${cols}, json FROM analyses WHERE (${cols}) > (?, ?, ?, ?) ORDER BY ${cols} LIMIT ?`, ...after, PAGE);
        for (const row of rows) yield read(AnalyzedGame, row.json, `analysis ${String(row.game_id)}`);
        if (rows.length < PAGE) return;
        const last = rows[rows.length - 1];
        if (!last) return;
        after = [last.game_id ?? null, last.analysis_version ?? null, last.depth ?? null, last.engine ?? null];
      }
    },

    async close() {
      if (closed) return;
      closed = true;
      db.close();
    },
  };
}
