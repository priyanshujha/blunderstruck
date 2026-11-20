/**
 * Which model does which coaching job. This is the single place model ids live.
 *
 * Cost rule: Stockfish and plain code find and count the mistakes; a model only ever sees a
 * few kilobytes of aggregated numbers and a handful of example positions, once per player
 * per week. Nothing here may be called per move or per game.
 *
 * Changing a route changes cost and output quality for everyone who runs this. Update
 * models.test.ts in the same change.
 */

export type Provider = "anthropic" | "gemini";

export type CoachTask =
  /** Pick at most two focus patterns for the week and write why + one drill each. Needs judgment. */
  | "weekly-plan"
  /** One or two sentences on what went wrong in a single example position. Mechanical. */
  | "position-explainer"
  /** One short paragraph comparing last week's numbers with this week's. Mechanical. */
  | "progress-note";

export interface ModelChoice {
  model: string;
  /** Reasoning effort, where the provider has the setting. */
  effort?: "low" | "medium" | "high";
  maxOutputTokens: number;
  /** Safe to send through a batch endpoint (weekly runs are never urgent; batch is half price). */
  batchable: boolean;
}

type Tier = "smart" | "fast";

const TASKS: Record<CoachTask, { tier: Tier; effort: ModelChoice["effort"]; maxOutputTokens: number }> = {
  // Thinking counts toward the output limit; a measured plan used about 1,000 tokens in all.
  "weekly-plan": { tier: "smart", effort: "medium", maxOutputTokens: 4000 },
  "position-explainer": { tier: "fast", effort: "low", maxOutputTokens: 400 },
  "progress-note": { tier: "fast", effort: "low", maxOutputTokens: 500 },
};

const ANTHROPIC: Record<Tier, string> = {
  smart: "claude-opus-5-5",
  fast: "claude-haiku-5-5",
};

/**
 * Gemini defaults. A tier without one must be named in `BLUNDERSTRUCK_GEMINI_<TIER>_MODEL`;
 * that variable also overrides a default, for keys pinned to another model.
 */
const GEMINI: Partial<Record<Tier, string>> = {
  smart: "gemini-3.8-flash",
};

const ENV_KEY = (task: CoachTask) => `BLUNDERSTRUCK_MODEL_${task.toUpperCase().replace(/-/g, "_")}`;

/**
 * Resolve the model for a task. Precedence: per-task env override, then for Gemini the
 * `BLUNDERSTRUCK_GEMINI_<TIER>_MODEL` variable, then the provider's default for the tier.
 * Gemini tiers without a default throw until the variable is set.
 */
export function pickModel(
  task: CoachTask,
  provider: Provider,
  env: Record<string, string | undefined> = process.env,
): ModelChoice {
  const t = TASKS[task];
  const override = env[ENV_KEY(task)];
  let model = override;
  if (!model) {
    if (provider === "anthropic") {
      model = ANTHROPIC[t.tier];
    } else {
      const key = `BLUNDERSTRUCK_GEMINI_${t.tier.toUpperCase()}_MODEL`;
      model = env[key] || GEMINI[t.tier];
      if (!model) throw new Error(`${key} is not set (needed for "${task}" with provider gemini)`);
    }
  }
  return { model, effort: t.effort, maxOutputTokens: t.maxOutputTokens, batchable: true };
}

/** The default table, for docs and for `blunderstruck models`. */
export const COACH_ROUTES = Object.fromEntries(
  (Object.keys(TASKS) as CoachTask[]).map((task) => [
    task,
    {
      ...TASKS[task],
      anthropic: ANTHROPIC[TASKS[task].tier],
      gemini: GEMINI[TASKS[task].tier] ?? `BLUNDERSTRUCK_GEMINI_${TASKS[task].tier.toUpperCase()}_MODEL`,
    },
  ]),
) as Record<CoachTask, (typeof TASKS)[CoachTask] & { anthropic: string; gemini: string }>;
