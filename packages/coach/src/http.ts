/** HTTP statuses worth retrying. */
export const RETRY_STATUSES: readonly number[] = [429, 500, 502, 503, 504, 529];
/** Retries after the first attempt. */
export const RETRY_MAX = 2;
/** Waits before each retry, in milliseconds, unless the response says `retry-after`. */
export const RETRY_DELAYS_MS: readonly number[] = [2000, 8000];
/** A `retry-after` wait is capped at this many seconds. */
export const RETRY_AFTER_CAP_SECONDS = 60;

export interface PostOptions {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/** A request that failed: a non-retried or exhausted HTTP status, a network error or a bad body. */
export class HttpError extends Error {
  constructor(
    message: string,
    /** The HTTP status, or undefined when no response arrived. */
    readonly status?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Replace every header value (keys among them) that appears in `text`. */
function redact(text: string, headers: Record<string, string>): string {
  let out = text;
  for (const v of Object.values(headers)) {
    if (v.length >= 6) out = out.split(v).join("[redacted]");
  }
  return out;
}

/** The wait a `retry-after` header asks for, in milliseconds, or undefined if absent or unreadable. */
function retryAfterMs(header: string | null, now: number): number | undefined {
  if (header === null) return undefined;
  const trimmed = header.trim();
  let seconds: number;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    seconds = Number(trimmed);
  } else {
    const at = Date.parse(trimmed);
    if (Number.isNaN(at)) return undefined;
    seconds = Math.max(0, (at - now) / 1000);
  }
  return Math.round(Math.min(seconds, RETRY_AFTER_CAP_SECONDS) * 1000);
}

/** A short description of an error body, without echoing anything long. */
function describeBody(text: string): string {
  try {
    const parsed = JSON.parse(text) as unknown;
    const err = (parsed as { error?: unknown })?.error;
    const record = (Array.isArray(parsed) ? parsed[0]?.error : err) as
      | { message?: unknown; type?: unknown; status?: unknown }
      | undefined;
    const parts = [record?.type ?? record?.status, record?.message].filter((p) => typeof p === "string");
    if (parts.length > 0) return parts.join(": ").slice(0, 300);
  } catch {
    // not JSON; fall through
  }
  return text.trim().slice(0, 200);
}

/**
 * POST JSON and return the parsed JSON body. Retries the statuses above; any other failure
 * throws an error that never contains a header value.
 */
export async function postWithRetry(opts: PostOptions): Promise<unknown> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const host = (() => {
    try {
      return new URL(opts.url).host;
    } catch {
      return "the provider";
    }
  })();
  const payload = JSON.stringify(opts.body);

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(opts.url, { method: "POST", headers: opts.headers, body: payload });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new HttpError(redact(`request to ${host} failed: ${detail}`, opts.headers));
    }

    if (res.ok) {
      const text = await res.text();
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new HttpError(`response from ${host} was not JSON`, res.status);
      }
    }

    const text = await res.text().catch(() => "");
    if (RETRY_STATUSES.includes(res.status) && attempt < RETRY_MAX) {
      const wait =
        retryAfterMs(res.headers.get("retry-after"), Date.now()) ??
        (RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)] ?? 0);
      await sleep(wait);
      continue;
    }

    const tries = attempt + 1;
    const detail = describeBody(text);
    throw new HttpError(
      redact(
        `${host} returned HTTP ${res.status}${tries > 1 ? ` after ${tries} attempts` : ""}${detail ? `: ${detail}` : ""}`,
        opts.headers,
      ),
      res.status,
    );
  }
}
