import type { ModelChoice } from "./models";

export type ResolvedProvider =
  | { kind: "anthropic" | "gemini"; apiKey: string; choice: ModelChoice }
  | { kind: "none"; message: string };

/**
 * Choose the provider: the flag, then `BLUNDERSTRUCK_PROVIDER`, then Anthropic if its key is
 * set, then Gemini if its key is set, else none. Throws `ConfigError` when a provider named
 * explicitly has no key, or Gemini has no model variable.
 */
export function resolveProvider(input: {
  env: Record<string, string | undefined>;
  flag?: "anthropic" | "gemini" | "none";
}): ResolvedProvider {
  throw new Error("not implemented");
}
