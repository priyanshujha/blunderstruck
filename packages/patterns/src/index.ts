export type { Detector, DetectorFamily, DetectorHit, GameDetector, PlayerGame, SetDetector } from "./types";
export * from "./rules";
export {
  attackersOf,
  bestExchange,
  classifyMotif,
  compareLines,
  exchangeGain,
  legalMove,
  lineOutcome,
  lineToSan,
  material,
  MATE_VALUE,
  moveLabel,
  moveMaterial,
  PIECE_VALUES,
  pieceName,
  positionFromFen,
  positionKey,
  see,
  squareName,
  tacticSwing,
  uciToSan,
  type LineComparison,
  type LineOutcome,
} from "./board";
export {
  answerTo,
  clockBefore,
  lostOnTime,
  mateFor,
  moveAt,
  parseClock,
  playerMoves,
  previousOwnMove,
  replyTo,
  toPlayerGame,
} from "./game";
export { findPatterns } from "./find";
export { openingStats, patternStats, rankTop, summarize } from "./aggregate";
export { DETECTORS } from "./detectors";
