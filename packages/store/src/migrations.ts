import type { DatabaseSync } from "node:sqlite";

/** The schema version this code writes. */
export const SCHEMA_VERSION = 1;

/** How long a connection waits for another writer, in milliseconds. */
export const BUSY_TIMEOUT_MS = 5000;

/**
 * Bring `db` to `SCHEMA_VERSION`, one numbered migration per transaction. Refuses a database
 * written by a newer version.
 */
export function migrate(db: DatabaseSync): void {
  throw new Error("not implemented");
}
