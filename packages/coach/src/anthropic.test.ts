import { describe, expect, it } from "vitest";
import { ANTHROPIC_MESSAGES_URL, anthropicProvider } from "./anthropic";
import { HttpError, postWithRetry } from "./http";
import { pickModel } from "./models";
import { type CompleteRequest, ProviderResponseError } from "./provider";

const KEY = "sk-test-secret-key-0123456789";
const choice = pickModel("weekly-plan", "anthropic", {});
const schema = {
  type: "object",
  properties: { summary: { type: "string" } },
  required: ["summary"],
  additionalProperties: false,
};
const req: CompleteRequest = { system: "STABLE PREFIX", user: "player numbers", schema, choice };

interface Call {
  url: string;
  init: RequestInit;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function okMessage(overrides: Record<string, unknown> = {}) {
  return {
    type: "message",
    role: "assistant",
    content: [
      { type: "thinking", thinking: "", signature: "x" },
      { type: "text", text: '{"summary":"ok"}' },
    ],
    stop_reason: "end_turn",
    usage: { input_tokens: 100, cache_creation_input_tokens: 20, cache_read_input_tokens: 900, output_tokens: 50 },
    ...overrides,
  };
}

/** A fetch that answers from a queue and records every call. */
function stubFetch(responses: Array<Response | Error>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("no more stub responses");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function stubSleep() {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => void waits.push(ms) };
}

async function rejection(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (err) {
    return err as Error;
  }
  throw new Error("expected a rejection");
}

describe("anthropicProvider request", () => {
  it("sends the documented headers and body", async () => {
    const { fetchImpl, calls } = stubFetch([json(200, okMessage())]);
    const provider = anthropicProvider({ apiKey: KEY, choice, fetchImpl, sleep: stubSleep().sleep });
    expect(provider).toMatchObject({ name: "anthropic", model: "claude-opus-5-5" });

    const result = await provider.complete(req);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(ANTHROPIC_MESSAGES_URL);
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.init.headers).toEqual({
      "x-api-key": KEY,
      "anthropic-version": "2026-10-21",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      system: [{ type: "text", text: "STABLE PREFIX", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "player numbers" }],
      output_config: { effort: "medium", format: { type: "json_schema", schema } },
    });
    expect(result).toEqual({
      text: '{"summary":"ok"}',
      usage: { inputTokens: 1020, outputTokens: 50, cachedInputTokens: 900 },
    });
  });

  it("leaves effort out when the route has none", async () => {
    const { fetchImpl, calls } = stubFetch([json(200, okMessage())]);
    const noEffort = { ...choice, effort: undefined };
    await anthropicProvider({ apiKey: KEY, choice: noEffort, fetchImpl }).complete({ ...req, choice: noEffort });
    expect(JSON.parse(String(calls[0]!.init.body)).output_config).toEqual({ format: { type: "json_schema", schema } });
  });
});

describe("retries", () => {
  it("retries a 529 once, then succeeds", async () => {
    const { fetchImpl, calls } = stubFetch([json(529, { type: "error", error: { type: "overloaded_error" } }), json(200, okMessage())]);
    const { waits, sleep } = stubSleep();
    const result = await anthropicProvider({ apiKey: KEY, choice, fetchImpl, sleep }).complete(req);
    expect(result.text).toBe('{"summary":"ok"}');
    expect(calls).toHaveLength(2);
    expect(waits).toEqual([2000]);
  });

  it("waits retry-after seconds through the stub sleep", async () => {
    const { fetchImpl } = stubFetch([json(429, {}, { "retry-after": "3" }), json(200, okMessage())]);
    const { waits, sleep } = stubSleep();
    await anthropicProvider({ apiKey: KEY, choice, fetchImpl, sleep }).complete(req);
    expect(waits).toEqual([3000]);
  });

  it("caps retry-after at 60 seconds", async () => {
    const { fetchImpl } = stubFetch([json(503, {}, { "retry-after": "600" }), json(200, {})]);
    const { waits, sleep } = stubSleep();
    await postWithRetry({ url: ANTHROPIC_MESSAGES_URL, headers: {}, body: {}, fetchImpl, sleep });
    expect(waits).toEqual([60_000]);
  });

  it("gives up after two retries, waiting 2 s then 8 s", async () => {
    const { fetchImpl, calls } = stubFetch([json(500, {}), json(502, {}), json(504, {})]);
    const { waits, sleep } = stubSleep();
    const err = await rejection(anthropicProvider({ apiKey: KEY, choice, fetchImpl, sleep }).complete(req));
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(504);
    expect(calls).toHaveLength(3);
    expect(waits).toEqual([2000, 8000]);
  });

  it("does not retry a 400", async () => {
    const { fetchImpl, calls } = stubFetch([
      json(400, { type: "error", error: { type: "invalid_request_error", message: "bad schema" } }),
    ]);
    const { waits, sleep } = stubSleep();
    const err = await rejection(anthropicProvider({ apiKey: KEY, choice, fetchImpl, sleep }).complete(req));
    expect(err).toBeInstanceOf(HttpError);
    expect(err.message).toContain("400");
    expect(err.message).toContain("bad schema");
    expect(calls).toHaveLength(1);
    expect(waits).toEqual([]);
  });
});

describe("errors", () => {
  it("treats a truncated response as an error", async () => {
    const { fetchImpl } = stubFetch([json(200, okMessage({ stop_reason: "max_tokens" }))]);
    const err = await rejection(anthropicProvider({ apiKey: KEY, choice, fetchImpl }).complete(req));
    expect(err).toBeInstanceOf(ProviderResponseError);
    expect((err as ProviderResponseError).reason).toBe("truncated");
  });

  it("treats a refusal and a response without text as errors", async () => {
    const { fetchImpl } = stubFetch([
      json(200, okMessage({ stop_reason: "refusal" })),
      json(200, okMessage({ content: [{ type: "thinking", thinking: "", signature: "x" }] })),
    ]);
    const provider = anthropicProvider({ apiKey: KEY, choice, fetchImpl });
    expect(((await rejection(provider.complete(req))) as ProviderResponseError).reason).toBe("refused");
    expect(((await rejection(provider.complete(req))) as ProviderResponseError).reason).toBe("empty");
  });

  it("never puts the key in a thrown message", async () => {
    const echo = `invalid x-api-key: ${KEY}`;
    const cases: Array<Response | Error> = [
      json(401, { type: "error", error: { type: "authentication_error", message: echo } }),
      new Error(`connect failed with header ${KEY}`),
      new Response(`<html>${KEY}</html>`, { status: 200 }),
      json(200, okMessage({ stop_reason: "max_tokens" })),
    ];
    for (const response of cases) {
      const { fetchImpl } = stubFetch([response]);
      const err = await rejection(anthropicProvider({ apiKey: KEY, choice, fetchImpl }).complete(req));
      expect(err.message).not.toContain(KEY);
      expect(String(err.stack)).not.toContain(KEY);
      expect(JSON.stringify(err)).not.toContain(KEY);
    }
  });

  it("does not return the key in the result", async () => {
    const { fetchImpl } = stubFetch([json(200, okMessage())]);
    const provider = anthropicProvider({ apiKey: KEY, choice, fetchImpl });
    expect(JSON.stringify(provider)).not.toContain(KEY);
    expect(JSON.stringify(await provider.complete(req))).not.toContain(KEY);
  });
});
