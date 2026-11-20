import { type WeeklyReport, perspective } from "@blunderstruck/contracts";
import type { Store } from "@blunderstruck/store";

/**
 * Games of the report's period still waiting at the report's own settings: not analysed, or,
 * when the settings ask for a deeper check, not checked for the player's colour.
 *
 * This mirrors `pendingFor` in the report package for the period's games only. That function
 * cannot be used here: the report package depends on the engine, which this app does not. So
 * games of the comparison window and the other weeks, which the report also waits on, are not
 * counted. A capped report counts the games it kept (`cappedGameIds`); one stored before that
 * field counts every game of the period, as the cut cannot be recomputed here.
 */
export async function pendingGames(store: Store, r: WeeklyReport): Promise<number> {
  if (r.coverage.complete) return 0;
  const ids = r.cappedGameIds ?? r.gameIds;
  const checkDepth = r.settings.checkDepth ?? 0;
  const key = {
    analysisVersion: r.settings.analysisVersion,
    depth: r.settings.engine.depth,
    checkDepth,
    engineName: r.settings.engine.name,
  };
  if (checkDepth === 0) {
    const done = await store.analysedIds(ids, key);
    return ids.filter((id) => !done.has(id)).length;
  }
  const [analyses, games] = await Promise.all([store.getAnalyses(ids, key), store.gamesById(ids)]);
  return ids.filter((id) => {
    const a = analyses.get(id);
    const g = games.get(id);
    const color = g ? perspective(g, r.player)?.color : undefined;
    return !(a?.check && color && a.check.colors.includes(color));
  }).length;
}
