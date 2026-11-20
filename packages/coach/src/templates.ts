import type { ReportDraft } from "@blunderstruck/contracts";
import type { WordingText } from "./validate";

/** Plain wording for a report, with no model: one title, why and drill per pattern, sized by band. */
export function templateWording(draft: ReportDraft): WordingText {
  throw new Error("not implemented");
}
