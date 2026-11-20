import {
  AnalyzedGame,
  GameRecord,
  PeriodStats,
  Track,
  WeeklyReport,
  trackKey,
} from "@blunderstruck/contracts";
import type { AnalysisKey, GameQuery, Store } from "./store";

type StoredTrack = Track & { createdAt: string };

const instant = (s: string): string => new Date(s).toISOString();
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const analysisKey = (a: AnalyzedGame): string =>
  JSON.stringify([a.gameId, a.analysisVersion, a.engine.depth, a.engine.name]);

function compareAnalyses(a: AnalyzedGame, b: AnalyzedGame): number {
  return (
    cmp(a.gameId, b.gameId) ||
    a.analysisVersion - b.analysisVersion ||
    a.engine.depth - b.engine.depth ||
    cmp(a.engine.name, b.engine.name)
  );
}

/** A store that lives in memory, for tests and short runs. */
export function memoryStore(): Store {
  const tracks = new Map<string, StoredTrack>();
  const games = new Map<string, GameRecord>();
  const analyses = new Map<string, AnalyzedGame>();
  const periodStats = new Map<string, PeriodStats>();
  const reports = new Map<string, WeeklyReport>();
  let closed = false;

  const open = (): void => {
    if (closed) throw new Error("store is closed");
  };
  const statsKey = (tk: string, sk: string, end: string): string => JSON.stringify([tk, sk, instant(end)]);
  const reportKey = (r: WeeklyReport): string => JSON.stringify([trackKey(r.track), instant(r.periodEnd)]);

  function matching(ids: readonly string[], key: AnalysisKey): Map<string, AnalyzedGame> {
    const wanted = new Set(ids);
    const found = [...analyses.values()]
      .filter(
        (a) =>
          wanted.has(a.gameId) &&
          a.analysisVersion === key.analysisVersion &&
          a.engine.depth === key.depth &&
          (key.engineName === undefined || a.engine.name === key.engineName),
      )
      .sort(compareAnalyses);
    const out = new Map<string, AnalyzedGame>();
    for (const a of found) if (!out.has(a.gameId)) out.set(a.gameId, structuredClone(a));
    return out;
  }

  function trackReports(t: Track): WeeklyReport[] {
    const tk = trackKey(t);
    return [...reports.values()]
      .filter((r) => trackKey(r.track) === tk)
      .sort((a, b) => cmp(instant(a.periodEnd), instant(b.periodEnd)))
      .map((r) => structuredClone(r));
  }

  return {
    async putTrack(t, createdAt) {
      open();
      const track = Track.parse(t);
      const at = instant(createdAt);
      const key = trackKey(track);
      const existing = tracks.get(key);
      if (!existing || at < existing.createdAt) tracks.set(key, { ...track, createdAt: at });
    },

    async tracks() {
      open();
      return [...tracks.entries()].sort(([a], [b]) => cmp(a, b)).map(([, t]) => structuredClone(t));
    },

    async putGames(gs) {
      open();
      const parsed = gs.map((g) => GameRecord.parse(g));
      for (const g of parsed) games.set(g.id, g);
    },

    async games(q: GameQuery) {
      open();
      const u = q.username.toLowerCase();
      const from = q.from === undefined ? undefined : instant(q.from);
      const to = q.to === undefined ? undefined : instant(q.to);
      return [...games.values()]
        .filter((g) => {
          if (g.platform !== q.platform) return false;
          if (g.white.name.toLowerCase() !== u && g.black.name.toLowerCase() !== u) return false;
          if (q.timeClass !== undefined && g.timeClass !== q.timeClass) return false;
          const at = instant(g.playedAt);
          if (from !== undefined && at < from) return false;
          if (to !== undefined && at >= to) return false;
          return true;
        })
        .sort((a, b) => cmp(instant(a.playedAt), instant(b.playedAt)) || cmp(a.id, b.id))
        .map((g) => structuredClone(g));
    },

    async gamesById(ids) {
      open();
      const out = new Map<string, GameRecord>();
      for (const id of ids) {
        const g = games.get(id);
        if (g) out.set(id, structuredClone(g));
      }
      return out;
    },

    async getAnalyses(ids, key) {
      open();
      return matching(ids, key);
    },

    async analysedIds(ids, key) {
      open();
      return new Set(matching(ids, key).keys());
    },

    async putAnalysis(a) {
      open();
      const parsed = AnalyzedGame.parse(a);
      if (!games.has(parsed.gameId)) throw new Error(`no stored game ${parsed.gameId} for this analysis`);
      analyses.set(analysisKey(parsed), parsed);
    },

    async getPeriodStats(tk, sk, ends) {
      open();
      const out = new Map<string, PeriodStats>();
      for (const end of ends) {
        const s = periodStats.get(statsKey(tk, sk, end));
        if (s) out.set(end, structuredClone(s));
      }
      return out;
    },

    async listPeriodStats(tk, sk) {
      open();
      const prefix = JSON.stringify([tk, sk]).slice(0, -1) + ",";
      return [...periodStats.entries()]
        .filter(([k]) => k.startsWith(prefix))
        .map(([, s]) => s)
        .sort((a, b) => cmp(instant(a.end), instant(b.end)))
        .map((s) => structuredClone(s));
    },

    async putPeriodStats(tk, sk, s) {
      open();
      const parsed = PeriodStats.parse(s);
      periodStats.set(statsKey(tk, sk, parsed.end), parsed);
    },

    async putReport(r) {
      open();
      const parsed = WeeklyReport.parse(r);
      const key = reportKey(parsed);
      const existing = reports.get(key);
      if (existing && existing.revision >= parsed.revision) return "stale";
      reports.set(key, parsed);
      return "stored";
    },

    async reports(t) {
      open();
      return trackReports(t);
    },

    async latestReport(t) {
      open();
      return trackReports(t).at(-1);
    },

    async *allGames() {
      open();
      const ids = [...games.keys()].sort(cmp);
      for (const id of ids) {
        const g = games.get(id);
        if (g) yield structuredClone(g);
      }
    },

    async *allAnalyses() {
      open();
      const sorted = [...analyses.values()].sort(compareAnalyses);
      for (const a of sorted) yield structuredClone(a);
    },

    async close() {
      closed = true;
    },
  };
}
