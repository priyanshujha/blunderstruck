import type { PeriodStats, WeeklyReport } from "@blunderstruck/contracts";

/**
 * The report as one HTML page: no scripts, inline styles, every value escaped. `pending` is
 * the number of games still waiting for analysis; `history` is the weekly stats of the track.
 */
export function renderPage(
  report: WeeklyReport | undefined,
  ctx: { pending: number; history: PeriodStats[] },
): string {
  throw new Error("not implemented");
}
