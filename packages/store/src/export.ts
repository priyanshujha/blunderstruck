import { EXPORT_FORMAT, ExportLine, Track, trackKey, type GameRecord } from "@blunderstruck/contracts";
import { SCHEMA_VERSION } from "./migrations";
import type { Store } from "./store";

/** Games written per `putGames` call during an import. */
const GAME_BATCH = 500;

/**
 * Write the whole store as NDJSON: a header line, then tracks, games, analyses and reports.
 * Each call of `write` gets one line without its newline. A track that has reports but was never
 * stored with `putTrack` is written too, taken from its reports, with `createdAt` set to its
 * earliest report's period end; so an export always imports into a complete store. Period stats
 * are not exported; they are rebuilt from the games and analyses.
 */
export async function exportStore(store: Store, write: (line: string) => Promise<void>): Promise<void> {
  const emit = (line: ExportLine) => write(JSON.stringify(line));
  await emit({
    type: "header",
    format: EXPORT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
  });

  const tracks = new Map<string, Track & { createdAt: string }>();
  for (const t of await store.tracks()) tracks.set(trackKey(t), t);
  for await (const r of store.allReports()) {
    const key = trackKey(r.track);
    const end = new Date(r.periodEnd).toISOString();
    const known = tracks.get(key);
    if (!known) tracks.set(key, { ...Track.parse(r.track), createdAt: end });
  }
  const keys = [...tracks.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const k of keys) {
    const t = tracks.get(k);
    if (t) await emit({ type: "track", data: t });
  }

  for await (const g of store.allGames()) await emit({ type: "game", data: g });
  for await (const a of store.allAnalyses()) await emit({ type: "analysis", data: a });
  for await (const r of store.allReports()) await emit({ type: "report", data: r });
}

function summarise(error: unknown): string {
  if (error && typeof error === "object" && "issues" in error && Array.isArray(error.issues)) {
    return error.issues
      .slice(0, 3)
      .map((i: { path?: unknown[]; message?: string }) => `${(i.path ?? []).join(".") || "(line)"}: ${i.message ?? "invalid"}`)
      .join("; ");
  }
  return String(error);
}

/**
 * Read NDJSON written by `exportStore`. Safe to run twice: it upserts and keeps higher report
 * revisions. Blank lines are skipped. The first line must be the export header; a header from a
 * newer schema is refused. Any line that is not valid JSON or does not match its schema stops the
 * import with an error naming its line number; lines before it have already been written.
 */
export async function importStore(
  store: Store,
  lines: AsyncIterable<string>,
): Promise<{ imported: number }> {
  let lineNo = 0;
  let header = false;
  let imported = 0;
  let pending: GameRecord[] = [];

  const flush = async () => {
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];
    await store.putGames(batch);
  };

  for await (const raw of lines) {
    lineNo += 1;
    const text = raw.trim();
    if (text === "") continue;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error(`import line ${lineNo}: not valid JSON`);
    }
    const parsed = ExportLine.safeParse(value);
    if (!parsed.success) throw new Error(`import line ${lineNo}: ${summarise(parsed.error)}`);
    const line = parsed.data;

    if (!header) {
      if (line.type !== "header") throw new Error(`import line ${lineNo}: expected the export header first`);
      if (line.schemaVersion > SCHEMA_VERSION) {
        throw new Error(
          `import line ${lineNo}: this export was written by a newer version of blunderstruck (schema ${line.schemaVersion}; this version reads up to ${SCHEMA_VERSION})`,
        );
      }
      header = true;
      continue;
    }

    try {
      switch (line.type) {
        case "header":
          throw new Error("a second export header");
        case "track": {
          const { createdAt, ...track } = line.data;
          await store.putTrack(track, createdAt);
          break;
        }
        case "game":
          pending.push(line.data);
          if (pending.length >= GAME_BATCH) await flush();
          break;
        case "analysis":
          await flush();
          await store.putAnalysis(line.data);
          break;
        case "report":
          await flush();
          await store.putReport(line.data);
          break;
      }
    } catch (err) {
      throw new Error(`import line ${lineNo}: ${err instanceof Error ? err.message : String(err)}`);
    }
    imported += 1;
  }
  await flush();
  if (!header) throw new Error("import: no export header found");
  return { imported };
}
