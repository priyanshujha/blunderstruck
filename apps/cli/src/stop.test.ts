import { EngineExitedError } from "@blunderstruck/engine";
import { AnalysisAborted } from "@blunderstruck/report";
import { describe, expect, it } from "vitest";
import { stopMessage } from "./stop";

const counts = { done: 3, total: 12 };

describe("stopMessage", () => {
  it("reports a stop between games with its own counts", () => {
    expect(stopMessage(new AnalysisAborted(5, 150), true, counts)).toBe(
      "Stopped: 5 of 150 analysed; run report again to continue",
    );
  });

  it("treats the engine ending after an abort as the same stop, with the counts so far", () => {
    const err = new EngineExitedError('Stockfish exited during "go depth 12"');
    expect(stopMessage(err, true, counts)).toBe("Stopped: 3 of 12 analysed; run report again to continue");
  });

  it("keeps an engine exit without an abort as an error", () => {
    expect(stopMessage(new EngineExitedError("Stockfish has exited"), false, counts)).toBeUndefined();
  });

  it("keeps any other error as an error, aborted or not", () => {
    expect(stopMessage(new Error("network down"), true, counts)).toBeUndefined();
    expect(stopMessage(new Error("network down"), false, counts)).toBeUndefined();
  });
});
