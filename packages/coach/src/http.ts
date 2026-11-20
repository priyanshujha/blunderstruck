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

/**
 * POST JSON and return the parsed JSON body. Retries the statuses above; any other failure
 * throws an error that never contains a header value.
 */
export function postWithRetry(opts: PostOptions): Promise<unknown> {
  throw new Error("not implemented");
}
