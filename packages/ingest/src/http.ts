export interface FetchOptions {
  /** Upper bound on games returned. Default 50. */
  max?: number;
  /** Only games played at or after this instant. */
  since?: Date;
  /** Lichess personal token (optional; raises rate limits). */
  lichessToken?: string;
  /** Contact string for the User-Agent, as both platforms' API guidelines ask. */
  contact?: string;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
}

export class IngestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "IngestError";
  }
}

export function userAgent(contact?: string): string {
  const c = contact ?? process.env.BLUNDERSTRUCK_CONTACT;
  return c ? `blunderstruck (+${c})` : "blunderstruck";
}

export async function get(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const res = await fetchImpl(url, { headers });
  if (res.status === 404) throw new IngestError(`not found: ${url}`, 404);
  if (res.status === 429) throw new IngestError(`rate limited by ${new URL(url).host}`, 429);
  if (!res.ok) throw new IngestError(`${res.status} from ${url}`, res.status);
  return res;
}
