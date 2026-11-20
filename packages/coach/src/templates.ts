import type { FocusChoice, PatternId, RatingBand, ReportDraft } from "@blunderstruck/contracts";
import type { WordingText } from "./validate";

/** How deep a drill goes: plain words for the lower bands, real training for the upper ones. */
type DrillLevel = "plain" | "club" | "training";

const LEVEL: Record<RatingBand, DrillLevel> = {
  novice: "plain",
  beginner: "plain",
  club: "club",
  advanced: "training",
  expert: "training",
};

interface PatternText {
  title: string;
  /** Short noun phrase for the summary, e.g. "pieces left hanging". */
  noun: string;
  /** The first sentence of `why`, in the player's numbers (tokens only). */
  what: string;
  drill: Record<DrillLevel, string>;
}

/**
 * Plain wording per pattern. Every string is a token template (`FOCUS_TOKENS`) and passes the
 * same checks as model wording: no counts written as numbers, nothing over the length limits.
 */
const TEXT: Record<PatternId, PatternText> = {
  "missed-mate": {
    title: "Checkmates left on the board",
    noun: "missed mates",
    what: "You had a quick checkmate and played something else in {gamesAffected} of your {games} games.",
    drill: {
      plain:
        "Every time the other king looks short of room, stop and try every check before any other move. A few mate-in-one puzzles a day make this a habit.",
      club:
        "Before each move, list every check you have and follow each one two moves deep. Add a daily set of mate-in-two puzzles, solved without moving the pieces.",
      training:
        "Check forcing moves first, always: checks, then captures, then threats. Solve mate-in-two and mate-in-three sets against the clock, then replay your own missed mates and find what hid them.",
    },
  },
  "allowed-mate": {
    title: "Quick mates against you",
    noun: "quick mates allowed",
    what: "A move let the other side force checkmate within a couple of moves in {gamesAffected} of your {games} games.",
    drill: {
      plain:
        "Before every move, look at your own king and ask: after my move, can they check me, and what happens then? If a check looks dangerous, deal with it first.",
      club:
        "Before each move, list the checks your opponent will have after it and make sure each has an answer. Practise defensive puzzles where the only move stops a mate.",
      training:
        "Make the opponent's checks and captures part of every candidate-move check. Study your own games where the king fell quickly and name the weak square or line each time.",
    },
  },
  "hung-piece": {
    title: "Pieces left out in the open",
    noun: "pieces left hanging",
    what: "A piece was left where it could simply be taken in {gamesAffected} of your {games} games.",
    drill: {
      plain:
        "Before you let go of a piece, ask: after this move, can anything of mine be taken for free? Look at every piece, not only the one you moved.",
      club:
        "Before each move, list the pieces it leaves attacked and count attackers against defenders. Do a short set of hanging-piece puzzles every day until the check is automatic.",
      training:
        "Run a blunder check on every move, including the obvious ones. Go back to each piece you lost this period and find the move where that check would have caught it.",
    },
  },
  "allowed-tactic": {
    title: "Shots left open for the opponent",
    noun: "tactics allowed",
    what: "A move left the other side a winning tactic, such as a fork, in {gamesAffected} of your {games} games.",
    drill: {
      plain:
        "After choosing a move, pretend you are your opponent: what is their best check, capture or attack now? If you find one that hurts, choose again.",
      club:
        "Before each move, look for the opponent's forcing replies: checks, captures and double attacks. Practise puzzles from the defending side, where you must spot the threat first.",
      training:
        "Make a blunder check part of every decision, looking at their forcing replies and then your answers. Replay your own positions from this period and find the reply you did not see.",
    },
  },
  "missed-capture": {
    title: "Free material left on the board",
    noun: "missed captures",
    what: "You could have won material with a capture and played something else in {gamesAffected} of your {games} games.",
    drill: {
      plain:
        "Before every move, look at each of your opponent's pieces and ask: is it guarded? If one is not, see if you can take it safely.",
      club:
        "Start every move by listing all captures for both sides and counting attackers against defenders. A short daily set of win-material puzzles trains the counting.",
      training:
        "Treat every capture as a candidate move and count each exchange to the end. Revisit your missed captures from this period and note why each one looked unsafe.",
    },
  },
  "missed-tactic": {
    title: "Tactics that went unplayed",
    noun: "missed tactics",
    what: "You had a winning tactic and did not play it in {gamesAffected} of your {games} games.",
    drill: {
      plain:
        "When the other side has pieces bunched together or one left unguarded, stop and look for a move that attacks two things at once. A few fork puzzles a day help.",
      club:
        "Look at every check, capture and threat before choosing a move, even in quiet positions. Solve a themed puzzle set each day: forks, pins and discovered attacks.",
      training:
        "Search forcing lines in every position with loose pieces or an exposed king. Solve harder mixed tactics without moving pieces, and replay your missed shots to see what hid them.",
    },
  },
  "thrown-win": {
    title: "Wins that got away",
    noun: "thrown wins",
    what: "You reached a winning position and did not win in {gamesAffected} of your {games} games.",
    drill: {
      plain:
        "Once you are well ahead, play safe: trade pieces, guard your king and check every move for free captures. Slow and sure wins the game.",
      club:
        "When you are winning, look first at what your opponent wants, then simplify: trade pieces, not pawns, and keep your king covered. Practise converting won positions against a friend or an engine.",
      training:
        "Treat a winning position as a new problem: find the opponent's best counterplay before your own plan. Play out won positions from your games against an engine until the win is routine.",
    },
  },
  "time-trouble": {
    title: "When the clock gets short",
    noun: "mistakes in time trouble",
    what: "Mistakes came with the clock nearly empty in {gamesAffected} of your {games} games.",
    drill: {
      plain:
        "Spend less time on the first few moves so you have time later. When your clock gets low, keep it simple: protect your pieces and make safe moves.",
      club:
        "Set a rough time budget per phase and check the clock every few moves. In easy positions, move quickly; save your thinking for the moments that need it.",
      training:
        "Review where your time went in your recent games and cut the long thinks in positions that did not need them. Practise faster games with a fixed routine for low-clock moves.",
    },
  },
  "opening-trouble": {
    title: "The same opening hole, again",
    noun: "repeated opening mistakes",
    what: "The same early position went wrong more than once, in {gamesAffected} of your {games} games.",
    drill: {
      plain:
        "Look up the position from your example games and learn one good move for it. Play it a few times against a friend or a computer until it feels normal.",
      club:
        "Take the position from your examples, find the main move and the idea behind it, and play a few training games from there. One line learned well beats ten skimmed.",
      training:
        "Prepare the exact position from your examples: the engine's move, the plans after it, and the traps on both sides. Drill it from both colours until the reply is automatic.",
    },
  },
};

const FALLBACK: PatternText = {
  title: "A recurring mistake",
  noun: "recurring mistakes",
  what: "This mistake turned up in {gamesAffected} of your {games} games.",
  drill: {
    plain: "Before every move, check what your move leaves open and what your opponent can do next.",
    club: "Before every move, list checks, captures and threats for both sides, then choose.",
    training: "Replay the example positions, find the better move in each, and note what made it hard to see.",
  },
};

function textFor(patternId: string): PatternText {
  return (TEXT as Record<string, PatternText>)[patternId] ?? FALLBACK;
}

function why(item: FocusChoice): string {
  const parts: string[] = [];
  if (item.reason.kind === "kept") parts.push("Still the one to work on.");
  if (item.reason.kind === "returned") parts.push("This one is back.");
  parts.push(textFor(item.patternId).what);
  parts.push("That is {rate} times per hundred moves.");
  if (item.reason.weeksCounted > 0) parts.push("It came up in {weeksRecurred} of your last {weeksCounted} weeks.");
  parts.push("The aim is {target} per hundred moves or fewer.");
  return parts.join(" ");
}

function summary(draft: ReportDraft): string {
  const parts: string[] = [];
  if (draft.notes.includes("few-games")) {
    parts.push(
      "Only {games} games in this period, so here are the numbers on their own. Focus items start once there are enough games to go on.",
    );
  } else {
    parts.push("Over {games} games you made {mistakeRate} mistakes per hundred moves.");
    if (draft.focus.length === 0) {
      parts.push("No single habit came back often enough to pick out, which is its own kind of good news.");
    } else if (draft.focus.length === 1) {
      parts.push(`One habit stands out: ${textFor(draft.focus[0]!.patternId).noun}.`);
    } else {
      const [a, b] = draft.focus.map((f) => textFor(f.patternId).noun);
      parts.push(`Two habits stand out: ${a} and ${b}.`);
    }
  }
  const improved = draft.progress.filter((p) => p.verdict === "improved").map((p) => textFor(p.patternId).noun);
  if (improved.length > 0) parts.push(`Fewer ${improved.join(" and ")} than before: nicely done.`);
  const graduated = draft.retired.filter((r) => r.why === "graduated").map((r) => textFor(r.patternId).noun);
  if (graduated.length > 0) parts.push(`Graduated, and well earned: ${graduated.join(" and ")}.`);
  return parts.join(" ");
}

/** Plain wording for a report, with no model: one title, why and drill per pattern, sized by band. */
export function templateWording(draft: ReportDraft): WordingText {
  const level = LEVEL[draft.band];
  return {
    summary: summary(draft),
    focus: draft.focus.map((item) => {
      const t = textFor(item.patternId);
      return { patternId: item.patternId, title: t.title, why: why(item), drill: t.drill[level] };
    }),
  };
}
