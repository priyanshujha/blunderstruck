import type { ModelChoice } from "./models";

/** A bad or missing setting, such as a named provider without its key. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * The provider answered, but the answer cannot be used: cut off at the token limit, refused,
 * blocked, or missing its text. Callers fall back to template wording. Its `message` is fixed
 * text plus a provider status word, never response content or a key, so it is safe to show.
 */
export class ProviderResponseError extends Error {
  constructor(
    readonly reason: "truncated" | "refused" | "empty" | "malformed",
    message: string,
  ) {
    super(message);
    this.name = "ProviderResponseError";
  }
}

export interface CompleteRequest {
  system: string;
  user: string;
  /** JSON schema the answer must follow. */
  schema: object;
  choice: ModelChoice;
}

export interface CompleteResult {
  text: string;
  /**
   * `inputTokens` is every prompt token, cached or not; `cachedInputTokens` is the part of it
   * read from the provider's cache. `outputTokens` includes any reasoning tokens.
   */
  usage: { inputTokens: number; outputTokens: number; cachedInputTokens: number };
}

export interface CoachProvider {
  name: "anthropic" | "gemini";
  model: string;
  complete(req: CompleteRequest): Promise<CompleteResult>;
}

export interface ProviderOptions {
  apiKey: string;
  choice: ModelChoice;
  fetchImpl?: typeof fetch;
  /** Waits this many milliseconds; replaced in tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Per-attempt request timeout in milliseconds; defaults to `REQUEST_TIMEOUT_MS`. */
  timeoutMs?: number;
}

/** A non-negative integer from an untyped JSON value, else 0. */
export function tokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
