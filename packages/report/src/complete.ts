import type { Track, WeeklyReport } from "@blunderstruck/contracts";
import type { ReportDeps } from "./run";

/**
 * Finish a provisional report: analyse the games still pending, then store the next revision.
 * Returns undefined when the track has nothing to complete.
 */
export async function completeReport(deps: ReportDeps, track: Track): Promise<WeeklyReport | undefined> {
  throw new Error("not implemented");
}
