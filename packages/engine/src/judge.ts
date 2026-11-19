import { type Color, JUDGMENT_THRESHOLDS, type Judgment, type Score } from "@blunderstruck/contracts";

/** White's win probability, 0-100, from a White-POV score (Lichess's logistic fit). */
export function winPct(score: Score): number {
  if ("mate" in score) return score.mate > 0 ? 100 : 0;
  const cp = Math.max(-1000, Math.min(1000, score.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function moverWinPct(score: Score, mover: Color): number {
  const w = winPct(score);
  return mover === "white" ? w : 100 - w;
}

/** UCI reports scores for the side to move; contracts store them from White's side. */
export function toWhitePov(score: Score, sideToMove: Color): Score {
  if (sideToMove === "white") return score;
  return "mate" in score ? { mate: -score.mate } : { cp: -score.cp };
}

export function judge(winPctLoss: number): Judgment {
  if (winPctLoss >= JUDGMENT_THRESHOLDS.blunder) return "blunder";
  if (winPctLoss >= JUDGMENT_THRESHOLDS.mistake) return "mistake";
  if (winPctLoss >= JUDGMENT_THRESHOLDS.inaccuracy) return "inaccuracy";
  return "ok";
}
