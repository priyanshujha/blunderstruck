import type { ReportDraft, WeeklyReport } from "@blunderstruck/contracts";
import type { CoachProvider } from "./provider";

/**
 * Turn a draft into a report: one model call, one repair call, then template wording. With
 * `previous`, wording for unchanged patterns is kept and only new ones are worded.
 */
export function writeReport(
  draft: ReportDraft,
  provider?: CoachProvider,
  previous?: WeeklyReport,
): Promise<WeeklyReport> {
  throw new Error("not implemented");
}
