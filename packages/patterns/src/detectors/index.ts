import type { Detector } from "../types";
import { missedMate } from "./missed-mate";
import { allowedMate } from "./allowed-mate";
import { hungPiece } from "./hung-piece";
import { allowedTactic } from "./allowed-tactic";
import { missedCapture } from "./missed-capture";
import { missedTactic } from "./missed-tactic";
import { thrownWin } from "./thrown-win";
import { timeTrouble } from "./time-trouble";
import { openingTrouble } from "./opening-trouble";

/** Every detector, in `PATTERN_IDS` order (the tactical exclusivity order). */
export const DETECTORS: readonly Detector[] = [
  missedMate,
  allowedMate,
  hungPiece,
  allowedTactic,
  missedCapture,
  missedTactic,
  thrownWin,
  timeTrouble,
  openingTrouble,
];

export {
  missedMate,
  allowedMate,
  hungPiece,
  allowedTactic,
  missedCapture,
  missedTactic,
  thrownWin,
  timeTrouble,
  openingTrouble,
};
