/**
 * Which model does which coaching job. This is the single place model ids live.
 *
 * Cost rule: Stockfish and plain code find and count the mistakes; a model only ever sees a
 * few kilobytes of aggregated numbers and a handful of example positions, once per player
 * per week. Nothing here may be called per move or per game.
 *
 * Changing a route changes cost and output quality for every self-hoster and for the hosted
 * service. Update models.test.ts in the same change.
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
  "weekly-plan": { tier: "smart", effort: "medium", maxOutputTokens: 2000 },
  "position-explainer": { tier: "fast", effort: "low", maxOutputTokens: 400 },
  "progress-note": { tier: "fast", effort: "low", maxOutputTokens: 500 },
};

const ANTHROPIC: Record<Tier, string> = {
  smart: "claude-sonnet-5-5",
  fast: "claude-haiku-5-5",
};

const ENV_KEY = (task: CoachTask) => `BLUNDERSTRUCK_MODEL_${task.toUpperCase().replace(/-/g, "_")}`;

/**
 * Resolve the model for a task. Precedence: per-task env override, then the provider's tier.
 * Gemini ids are read from the environment rather than hard-coded, because self-hosters pin
 * whatever their key has access to.
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
      model = env[key];
      if (!model) throw new Error(`${key} is not set (needed for "${task}" with provider gemini)`);
    }
  }
  return { model, effort: t.effort, maxOutputTokens: t.maxOutputTokens, batchable: true };
}

/** The default table, for docs and for `blunderstruck models`. */
export const COACH_ROUTES = Object.fromEntries(
  (Object.keys(TASKS) as CoachTask[]).map((task) => [task, { ...TASKS[task], anthropic: ANTHROPIC[TASKS[task].tier] }]),
) as Record<CoachTask, (typeof TASKS)[CoachTask] & { anthropic: string }>;
