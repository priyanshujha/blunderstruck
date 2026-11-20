import type { Store } from "./store";

/** Write the whole store as NDJSON: a header line, then tracks, games, analyses and reports. */
export async function exportStore(store: Store, write: (line: string) => Promise<void>): Promise<void> {
  throw new Error("not implemented");
}

/** Read NDJSON written by `exportStore`. Safe to run twice: it upserts and keeps higher report revisions. */
export async function importStore(
  store: Store,
  lines: AsyncIterable<string>,
): Promise<{ imported: number }> {
  throw new Error("not implemented");
}
