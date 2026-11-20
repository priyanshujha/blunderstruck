import { describe, expect, it } from "vitest";
import { geminiProvider, geminiUrl } from "./gemini";
import { HttpError } from "./http";
import { pickModel } from "./models";
import { type CompleteRequest, ProviderResponseError } from "./provider";

const KEY = "gm-test-secret-key-0123456789";
const choice = pickModel("weekly-plan", "gemini", { BLUNDERSTRUCK_GEMINI_SMART_MODEL: "gemini-test-smart" });
const schema = { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] };
const req: CompleteRequest = { system: "STABLE PREFIX", user: "player numbers", schema, choice };

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function okBody(overrides: Record<string, unknown> = {}) {
  return {
    candidates: [
      {
        content: {
          role: "model",
          parts: [{ text: "thinking aloud", thought: true }, { text: '{"summary":' }, { text: '"ok"}' }],
        },
        finishReason: "STOP",
      },
    ],
    usageMetadata: {
      promptTokenCount: 1000,
      cachedContentTokenCount: 800,
      candidatesTokenCount: 40,
      thoughtsTokenCount: 10,
      totalTokenCount: 1050,
    },
    ...overrides,
  };
}

function stubFetch(responses: Array<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("no more stub responses");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

async function rejection(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (err) {
    return err as Error;
  }
  throw new Error("expected a rejection");
}

describe("geminiProvider", () => {
  it("sends the documented headers and body and reads text without thought parts", async () => {
    const { fetchImpl, calls } = stubFetch([json(200, okBody())]);
    const provider = geminiProvider({ apiKey: KEY, choice, fetchImpl });
    expect(provider).toMatchObject({ name: "gemini", model: "gemini-test-smart" });

    const result = await provider.complete(req);

    expect(calls[0]!.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-test-smart:generateContent",
    );
    expect(calls[0]!.url).not.toContain(KEY);
    expect(calls[0]!.init.headers).toEqual({ "x-goog-api-key": KEY, "content-type": "application/json" });
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      systemInstruction: { parts: [{ text: "STABLE PREFIX" }] },
      contents: [{ role: "user", parts: [{ text: "player numbers" }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: schema,
        maxOutputTokens: 2000,
        thinkingConfig: { thinkingLevel: "LOW" },
      },
    });
    expect(result).toEqual({
      text: '{"summary":"ok"}',
      usage: { inputTokens: 1000, outputTokens: 50, cachedInputTokens: 800 },
    });
  });

  it("accepts a model id with a models/ prefix", () => {
    expect(geminiUrl("models/gemini-x")).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent",
    );
  });

  it("retries a 429 with retry-after, and does not retry a 400", async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => void waits.push(ms);
    const ok = stubFetch([json(429, { error: { status: "RESOURCE_EXHAUSTED" } }, { "retry-after": "3" }), json(200, okBody())]);
    await geminiProvider({ apiKey: KEY, choice, fetchImpl: ok.fetchImpl, sleep }).complete(req);
    expect(ok.calls).toHaveLength(2);
    expect(waits).toEqual([3000]);

    const bad = stubFetch([json(400, { error: { status: "INVALID_ARGUMENT", message: "bad" } })]);
    const err = await rejection(geminiProvider({ apiKey: KEY, choice, fetchImpl: bad.fetchImpl, sleep }).complete(req));
    expect(err).toBeInstanceOf(HttpError);
    expect(bad.calls).toHaveLength(1);
  });

  it("treats MAX_TOKENS as truncated, and blocks and other stops as refused", async () => {
    const { fetchImpl } = stubFetch([
      json(200, okBody({ candidates: [{ content: { parts: [{ text: '{"su' }] }, finishReason: "MAX_TOKENS" }] })),
      json(200, { promptFeedback: { blockReason: "SAFETY" } }),
      json(200, okBody({ candidates: [{ content: { parts: [{ text: "{}" }] }, finishReason: "SAFETY" }] })),
      json(200, okBody({ candidates: [] })),
    ]);
    const provider = geminiProvider({ apiKey: KEY, choice, fetchImpl });
    const reasons: string[] = [];
    for (let i = 0; i < 4; i++) reasons.push(((await rejection(provider.complete(req))) as ProviderResponseError).reason);
    expect(reasons).toEqual(["truncated", "refused", "refused", "empty"]);
  });

  it("never puts the key in a thrown message", async () => {
    const cases: Array<Response | Error> = [
      json(403, { error: { status: "PERMISSION_DENIED", message: `API key ${KEY} not valid` } }),
      new Error(`socket closed, x-goog-api-key=${KEY}`),
      json(200, okBody({ candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] })),
    ];
    for (const response of cases) {
      const { fetchImpl } = stubFetch([response]);
      const err = await rejection(geminiProvider({ apiKey: KEY, choice, fetchImpl }).complete(req));
      expect(err.message).not.toContain(KEY);
      expect(JSON.stringify(err)).not.toContain(KEY);
    }
  });
});
