import { PeriodStats, type Track, WeeklyReport, settingsKey, trackKey } from "@blunderstruck/contracts";
import { type Store, memoryStore } from "@blunderstruck/store";
import { DEMO_DATA } from "./demo-data";

/**
 * A made-up report to look at without Stockfish, a model key or games of your own: an invented
 * player, fixture positions, stories built by the real story builder (see `demo.test.ts`).
 * Everything lives in memory; no file is read or written.
 */
export const DEMO_TRACK: Track = { platform: "lichess", username: "tidy_rookling", timeClass: "rapid" };

/** Said at the top of every demo page. Trusted HTML, written here, never from report data. */
export const DEMO_NOTE =
  '<div class="wrap"><p class="banner" role="note"><b>A made-up example.</b> This report is for an invented player, built from fixture positions, not from anyone\'s games. ' +
  "To see your own, run <code>pnpm cli report &lt;lichess|chesscom&gt; &lt;user&gt;</code>, then <code>pnpm web &lt;lichess|chesscom&gt; &lt;user&gt;</code>.</p></div>";

/** An in-memory store holding the demo's reports and weekly counts. */
export async function demoStore(): Promise<Store> {
  const data = { reports: DEMO_DATA.reports.map((r) => WeeklyReport.parse(r)), weeks: DEMO_DATA.weeks.map((w) => PeriodStats.parse(w)) };
  const store = memoryStore();
  await store.putTrack(DEMO_TRACK, data.weeks[data.weeks.length - 1]?.start ?? data.reports[0]!.periodStart);
  for (const r of data.reports) await store.putReport(r);
  const settings = data.reports.at(-1)!.settings;
  for (const w of data.weeks) await store.putPeriodStats(trackKey(DEMO_TRACK), settingsKey(settings), w);
  return store;
}
