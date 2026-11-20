import type { ModelChoice } from "./models";

/** A bad or missing setting, such as a named provider without its key. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
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
}
