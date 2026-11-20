import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The database file: `--db`, else `BLUNDERSTRUCK_DB`, else `~/.blunderstruck/blunderstruck.db`.
 * `openSqliteStore` creates the parent folders. The web app applies the same rule.
 */
export function dbPath(flag: string | undefined, env: Record<string, string | undefined> = process.env): string {
  return flag || env.BLUNDERSTRUCK_DB || join(homedir(), ".blunderstruck", "blunderstruck.db");
}
