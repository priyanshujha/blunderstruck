import { postWithRetry } from "./http";
import {
  type CoachProvider,
  type CompleteRequest,
  type CompleteResult,
  type ProviderOptions,
  ProviderResponseError,
  tokenCount,
} from "./provider";

export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** The `generateContent` URL for a model id, with or without a leading `models/`. */
export function geminiUrl(model: string): string {
  const id = model.replace(/^models\//, "");
  return `${GEMINI_API_BASE}/models/${encodeURIComponent(id)}:generateContent`;
}

/** The request body for one structured-output call; exported for tests and inspection. */
export function geminiRequestBody(req: CompleteRequest): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = {
    responseMimeType: "application/json",
    responseJsonSchema: req.schema,
    maxOutputTokens: req.choice.maxOutputTokens,
  };
  if (req.choice.effort) generationConfig.thinkingConfig = { thinkingLevel: req.choice.effort.toUpperCase() };
  return {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: "user", parts: [{ text: req.user }] }],
    generationConfig,
  };
}

interface GenerateResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: unknown; thought?: unknown }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: Record<string, unknown>;
}

/** Read text and usage from a `generateContent` response, or throw `ProviderResponseError`. */
export function readGeminiResponse(raw: unknown): CompleteResult {
  if (typeof raw !== "object" || raw === null) {
    throw new ProviderResponseError("malformed", "gemini: response was not an object");
  }
  const res = raw as GenerateResponse;
  const blocked = res.promptFeedback?.blockReason;
  if (blocked) throw new ProviderResponseError("refused", `gemini: prompt was blocked (${blocked})`);

  const candidate = Array.isArray(res.candidates) ? res.candidates[0] : undefined;
  if (!candidate) throw new ProviderResponseError("empty", "gemini: response had no candidates");
  const finish = candidate.finishReason;
  if (finish === "MAX_TOKENS") {
    throw new ProviderResponseError("truncated", "gemini: response was cut off (finishReason MAX_TOKENS)");
  }
  if (finish && finish !== "STOP") {
    throw new ProviderResponseError("refused", `gemini: generation stopped early (finishReason ${finish})`);
  }

  const text = (candidate.content?.parts ?? [])
    .filter((p) => p?.thought !== true && typeof p?.text === "string")
    .map((p) => p.text as string)
    .join("");
  if (!text.trim()) throw new ProviderResponseError("empty", "gemini: response had no text");

  const u = res.usageMetadata ?? {};
  return {
    text,
    usage: {
      // promptTokenCount already includes the cached part.
      inputTokens: tokenCount(u.promptTokenCount),
      outputTokens: tokenCount(u.candidatesTokenCount) + tokenCount(u.thoughtsTokenCount),
      cachedInputTokens: tokenCount(u.cachedContentTokenCount),
    },
  };
}

/** `generateContent` over plain `fetch`, with JSON-schema output. */
export function geminiProvider(opts: ProviderOptions): CoachProvider {
  const { apiKey, fetchImpl, sleep } = opts;
  return {
    name: "gemini",
    model: opts.choice.model,
    async complete(req) {
      const raw = await postWithRetry({
        url: geminiUrl(req.choice.model),
        headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
        body: geminiRequestBody(req),
        fetchImpl,
        sleep,
      });
      return readGeminiResponse(raw);
    },
  };
}
