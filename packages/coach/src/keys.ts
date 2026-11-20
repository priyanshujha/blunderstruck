import { type ModelChoice, pickModel } from "./models";
import { ConfigError } from "./provider";

export type ResolvedProvider =
  | { kind: "anthropic" | "gemini"; apiKey: string; choice: ModelChoice }
  | { kind: "none"; message: string };

/** Printed when no provider can be used and none was turned off on purpose. */
export const NO_KEY_MESSAGE =
  "No model key found: set ANTHROPIC_API_KEY or GEMINI_API_KEY (see .env.example). Showing numbers only.";

/** Printed when the provider is turned off with `none`. */
export const PROVIDER_OFF_MESSAGE = "Model wording is turned off (provider none). Showing numbers only.";

const PROVIDERS = ["anthropic", "gemini", "none"] as const;

function value(env: Record<string, string | undefined>, name: string): string | undefined {
  const v = env[name]?.trim();
  return v ? v : undefined;
}

function keyFor(kind: "anthropic" | "gemini", env: Record<string, string | undefined>): string | undefined {
  return kind === "anthropic"
    ? value(env, "ANTHROPIC_API_KEY")
    : (value(env, "GEMINI_API_KEY") ?? value(env, "GOOGLE_API_KEY"));
}

const KEY_NAMES = { anthropic: "ANTHROPIC_API_KEY", gemini: "GEMINI_API_KEY (or GOOGLE_API_KEY)" };

function resolved(
  kind: "anthropic" | "gemini",
  apiKey: string,
  env: Record<string, string | undefined>,
): ResolvedProvider {
  let choice: ModelChoice;
  try {
    choice = pickModel("weekly-plan", kind, env);
  } catch {
    // pickModel only throws for a Gemini tier id missing from the environment.
    throw new ConfigError(
      "BLUNDERSTRUCK_GEMINI_SMART_MODEL is not set: name the Gemini model to use for the weekly plan",
    );
  }
  return { kind, apiKey, choice };
}

/**
 * Choose the provider: the flag, then `BLUNDERSTRUCK_PROVIDER`, then Anthropic if its key is
 * set, then Gemini if its key is set, else none. Throws `ConfigError` when a provider named
 * explicitly has no key, or Gemini has no model variable.
 */
export function resolveProvider(input: {
  env: Record<string, string | undefined>;
  flag?: "anthropic" | "gemini" | "none";
}): ResolvedProvider {
  const { env, flag } = input;
  let named: (typeof PROVIDERS)[number] | undefined = flag;
  let source = "--provider";
  if (!named) {
    const fromEnv = value(env, "BLUNDERSTRUCK_PROVIDER")?.toLowerCase();
    if (fromEnv !== undefined) {
      if (!(PROVIDERS as readonly string[]).includes(fromEnv)) {
        // Never echo the value: a key pasted into the wrong variable would be printed.
        throw new ConfigError(`BLUNDERSTRUCK_PROVIDER must be one of ${PROVIDERS.join(", ")}`);
      }
      named = fromEnv as (typeof PROVIDERS)[number];
      source = "BLUNDERSTRUCK_PROVIDER";
    }
  }

  if (named === "none") return { kind: "none", message: PROVIDER_OFF_MESSAGE };
  if (named) {
    const key = keyFor(named, env);
    if (!key) throw new ConfigError(`${source} is ${named} but ${KEY_NAMES[named]} is not set`);
    return resolved(named, key, env);
  }

  const anthropicKey = keyFor("anthropic", env);
  if (anthropicKey) return resolved("anthropic", anthropicKey, env);
  const geminiKey = keyFor("gemini", env);
  if (geminiKey) return resolved("gemini", geminiKey, env);
  return { kind: "none", message: NO_KEY_MESSAGE };
}
