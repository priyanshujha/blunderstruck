import type { Store } from "./store";

/**
 * Open (creating if needed) the SQLite file at `path`, or `:memory:`, and migrate it to the
 * latest schema. Uses the built-in `node:sqlite`.
 */
export async function openSqliteStore(path: string): Promise<Store> {
  throw new Error("not implemented");
}
