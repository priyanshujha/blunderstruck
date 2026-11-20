import type { Evaluator } from "@blunderstruck/engine";
import type { CoachProvider } from "@blunderstruck/coach";
import type { fetchGames } from "@blunderstruck/ingest";
import type { Platform, RatingBand, ReportTimeClass, WeeklyReport } from "@blunderstruck/contracts";
import type { Store } from "@blunderstruck/store";

export interface ReportDeps {
  store: Store;
  fetchGames: typeof fetchGames;
  startEngine: () => Promise<{ evaluator: Evaluator; name: string; quit(): Promise<void> }>;
  provider?: CoachProvider;
  now: () => Date;
  onProgress?: (e: {
    phase: "sample" | "full";
    done: number;
    total: number;
    etaSeconds: number | null;
  }) => void;
  signal?: AbortSignal;
}

export interface ReportOptions {
  platform: Platform;
  username: string;
  timeClass?: ReportTimeClass;
  depth: number;
  band?: RatingBand;
  asOf?: string;
  force: boolean;
  sampleOnly: boolean;
  maxGames?: number;
}

export interface ReportOutcome {
  status: "new" | "unchanged" | "waiting" | "resumed";
  report?: WeeklyReport;
  newGames: number;
  /** How many more games a new report needs. */
  needed: number;
  /** Games still waiting for analysis. */
  pending: number;
}

/** Run the weekly loop for one player: resume anything unfinished, then fetch, analyse, judge and word. */
export async function runReport(deps: ReportDeps, opts: ReportOptions): Promise<ReportOutcome> {
  throw new Error("not implemented");
}
