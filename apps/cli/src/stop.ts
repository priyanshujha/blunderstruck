import { EngineExitedError } from "@blunderstruck/engine";
import { AnalysisAborted } from "@blunderstruck/report";

/** Games analysed so far in the current pass, as the progress events report them. */
export interface StopCounts {
  done: number;
  total: number;
}

/**
 * The stop message for an interrupted run, or undefined when `err` is a real error.
 *
 * A stop between games is an `AnalysisAborted`. Where the interrupt also reaches the engine
 * (a console that signals every process attached to it), the engine can end mid-game instead;
 * after an abort that is the same stop, counted from the progress so far. Without an abort an
 * engine exit stays an error.
 */
export function stopMessage(err: unknown, aborted: boolean, counts: StopCounts): string | undefined {
  if (err instanceof AnalysisAborted) return `${err.message}; run report again to continue`;
  if (aborted && err instanceof EngineExitedError) {
    return `Stopped: ${counts.done} of ${counts.total} analysed; run report again to continue`;
  }
  return undefined;
}
