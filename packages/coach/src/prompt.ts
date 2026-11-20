import type { ReportDraft } from "@blunderstruck/contracts";

/** The shape of the model's answer. No `maxItems`, `minimum`, `maxLength` or `oneOf`: limits are checked after parsing. */
export const WORDING_SCHEMA: object = {
  type: "object",
  properties: {
    summary: { type: "string" },
    focus: {
      type: "array",
      items: {
        type: "object",
        properties: {
          patternId: { type: "string" },
          title: { type: "string" },
          why: { type: "string" },
          drill: { type: "string" },
        },
        required: ["patternId", "title", "why", "drill"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "focus"],
  additionalProperties: false,
};

/**
 * The system prefix (the same for every player) and the user part (this player's numbers).
 * `only` limits the request to those pattern ids.
 */
export function buildPrompt(draft: ReportDraft, only?: string[]): { system: string; user: string } {
  throw new Error("not implemented");
}
