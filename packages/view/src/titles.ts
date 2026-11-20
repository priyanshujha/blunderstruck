import type { FocusExample } from "@blunderstruck/contracts";

/**
 * A short title for an example, from facts stored on it and nothing else: the pattern, whether
 * the game took what the move allowed (`inGame.paid`), the piece the engine's line takes
 * (`lost`). Never from the example's place in a list. Undefined for patterns with no story to
 * title.
 */
export function exampleTitle(ex: Pick<FocusExample, "patternId" | "story">): string | undefined {
  const story = ex.story;
  const paid = story?.inGame?.paid === true;
  switch (ex.patternId) {
    case "hung-piece":
      if (story?.lost) return paid ? `One ${story.lost.piece}, and they took it` : `One ${story.lost.piece}, left where it could be taken`;
      return "A piece left to be taken";
    case "allowed-tactic":
      return paid ? "A shot, and they took it" : "A shot left open";
    case "allowed-mate":
      return paid ? "Mate, and they found it" : "The door left open to mate";
    case "missed-tactic":
      return "A shot left in the drawer";
    case "missed-capture":
      return "A capture left on the board";
    case "missed-mate":
      return "Checkmate, left in the drawer";
    default:
      return undefined;
  }
}

const MOTIF_CHIP: Record<string, string> = {
  fork: "looked like a fork",
  "discovered-attack": "looked like a discovered attack",
  mate: "mate",
};

/**
 * The chip after the sentence that tells the key move, from the motif the finding carries. A
 * fork or discovered attack is read by rule of thumb, so it is said as "looked like". None
 * without a motif.
 */
export const motifChip = (ex: Pick<FocusExample, "motif">): string | undefined => (ex.motif ? (MOTIF_CHIP[ex.motif] ?? undefined) : undefined);
