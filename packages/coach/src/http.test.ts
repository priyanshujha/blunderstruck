import { describe, expect, it } from "vitest";
import { HttpError, REQUEST_TIMEOUT_MS, postWithRetry } from "./http";

const KEY = "sk-test-secret-key-0123456789";
const URL_ = "https://api.example.test/v1/thing";
const headers = { "x-api-key": KEY, "content-type": "application/json" };

function timeoutError(): Error {
  // What fetch rejects with when an AbortSignal.timeout fires.
  return new DOMException(`The operation was aborted due to timeout (${KEY})`, "TimeoutError");
}

function stubFetch(responses: Array<Response | Error>) {
  const calls: RequestInit[] = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(init ?? {});
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

describe("postWithRetry timeouts", () => {
  it("passes a timeout signal on every attempt, 60 s by default", async () => {
    expect(REQUEST_TIMEOUT_MS).toBe(60_000);
    const { fetchImpl, calls } = stubFetch([new Response("{}", { status: 200 })]);
    await postWithRetry({ url: URL_, headers, body: {}, fetchImpl });
    expect(calls[0]!.signal).toBeInstanceOf(AbortSignal);
  });

  it("retries a timeout like a 5xx, then succeeds", async () => {
    const { fetchImpl, calls } = stubFetch([timeoutError(), new Response('{"ok":true}', { status: 200 })]);
    const { waits, sleep } = stubSleep();
    expect(await postWithRetry({ url: URL_, headers, body: {}, fetchImpl, sleep, timeoutMs: 5 })).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
    expect(waits).toEqual([2000]);
  });

  it("gives up after two retries with an HttpError that names the timeout but not the key", async () => {
    const { fetchImpl, calls } = stubFetch([timeoutError(), timeoutError(), timeoutError()]);
    const { waits, sleep } = stubSleep();
    const err = await rejection(postWithRetry({ url: URL_, headers, body: {}, fetchImpl, sleep }));
    expect(err).toBeInstanceOf(HttpError);
    expect(err.name).toBe("HttpError");
    expect((err as HttpError).status).toBeUndefined();
    expect(err.message).toContain("timed out after 60 s");
    expect(err.message).not.toContain(KEY);
    expect(JSON.stringify(err)).not.toContain(KEY);
    expect(calls).toHaveLength(3);
    expect(waits).toEqual([2000, 8000]);
  });

  it("aborts a real slow fetch with the injected timeout", async () => {
    const slowFetch = ((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as typeof fetch;
    const { sleep } = stubSleep();
    const err = await rejection(postWithRetry({ url: URL_, headers, body: {}, fetchImpl: slowFetch, sleep, timeoutMs: 5 }));
    expect(err).toBeInstanceOf(HttpError);
    expect(err.message).toContain("timed out");
  });

  it("does not retry other network errors, and redacts the key from them", async () => {
    const { fetchImpl, calls } = stubFetch([new TypeError(`fetch failed: ${KEY}`)]);
    const err = await rejection(postWithRetry({ url: URL_, headers, body: {}, fetchImpl, sleep: stubSleep().sleep }));
    expect(err).toBeInstanceOf(HttpError);
    expect(err.message).not.toContain(KEY);
    expect(calls).toHaveLength(1);
  });
});
