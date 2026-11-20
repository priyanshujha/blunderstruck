import { postWithRetry } from "./http";
import {
  type CoachProvider,
  type CompleteRequest,
  type CompleteResult,
  type ProviderOptions,
  ProviderResponseError,
  tokenCount,
} from "./provider";

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2026-10-21";

/** The request body for one structured-output call; exported for tests and inspection. */
export function anthropicRequestBody(req: CompleteRequest): Record<string, unknown> {
  const outputConfig: Record<string, unknown> = {
    format: { type: "json_schema", schema: req.schema },
  };
  if (req.choice.effort) outputConfig.effort = req.choice.effort;
  return {
    model: req.choice.model,
    max_tokens: req.choice.maxOutputTokens,
    // The stable prefix goes first and is cached across players.
    system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: req.user }],
    output_config: outputConfig,
  };
}

interface MessageResponse {
  content?: Array<{ type?: string; text?: unknown }>;
  stop_reason?: string | null;
  usage?: Record<string, unknown>;
}

/** Read text and usage from a Messages API response, or throw `ProviderResponseError`. */
export function readAnthropicResponse(raw: unknown): CompleteResult {
  if (typeof raw !== "object" || raw === null) {
    throw new ProviderResponseError("malformed", "anthropic: response was not an object");
  }
  const res = raw as MessageResponse;
  const stop = res.stop_reason;
  if (stop === "max_tokens" || stop === "model_context_window_exceeded") {
    throw new ProviderResponseError("truncated", `anthropic: response was cut off (stop_reason ${stop})`);
  }
  if (stop === "refusal") {
    throw new ProviderResponseError("refused", "anthropic: the model declined the request");
  }
  const text = (Array.isArray(res.content) ? res.content : [])
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
  if (!text.trim()) throw new ProviderResponseError("empty", "anthropic: response had no text");

  const u = res.usage ?? {};
  const cached = tokenCount(u.cache_read_input_tokens);
  return {
    text,
    usage: {
      inputTokens: tokenCount(u.input_tokens) + tokenCount(u.cache_creation_input_tokens) + cached,
      outputTokens: tokenCount(u.output_tokens),
      cachedInputTokens: cached,
    },
  };
}

/** Messages API over plain `fetch`, with a cached system prefix and JSON-schema output. */
export function anthropicProvider(opts: ProviderOptions): CoachProvider {
  const { apiKey, fetchImpl, sleep } = opts;
  return {
    name: "anthropic",
    model: opts.choice.model,
    async complete(req) {
      const raw = await postWithRetry({
        url: ANTHROPIC_MESSAGES_URL,
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: anthropicRequestBody(req),
        fetchImpl,
        sleep,
      });
      return readAnthropicResponse(raw);
    },
  };
}
