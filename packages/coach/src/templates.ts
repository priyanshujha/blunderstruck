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
  /** The first sentence of `why`: what happened. `WHERE` becomes the games phrase ("in {gamesAffected} of your {games} games"). */
  what: string;
  /** The second sentence of `why`: why it matters. Reads right for one game or many. */
  matters: string;
  /** The first sentence of `why` when it did not happen at all this period. `THESE` becomes "these {games} games". */
  quiet: string;
  drill: Record<DrillLevel, string>;
  /** The drill when it did not happen at all this period: keeps the habit going without pointing at mistakes that were not made. */
  quietDrill: Record<DrillLevel, string>;
}

/**
 * Plain wording per pattern. Every string is a token template (`FOCUS_TOKENS`) and passes the
 * same checks as model wording: no counts written as numbers, none of the tokens the report
 * prints itself, nothing over the length limits.
 */
const TEXT: Record<PatternId, PatternText> = {
  "missed-mate": {
    title: "Checkmates left on the board",
    noun: "missed mates",
    what: "You had a quick checkmate and played something else WHERE.",
    matters: "A mate on the board ends the game; letting it go gives the opponent another chance.",
    quiet: "No quick mate slipped away in THESE.",
    drill: {
      plain:
        "Every time the other king looks short of room, stop and try every check before any other move. A few mate-in-one puzzles a day make this a habit.",
      club:
        "Before each move, list every check you have and follow each one two moves deep. Add a daily set of mate-in-two puzzles, solved without moving the pieces.",
      training:
        "Check forcing moves first, always: checks, then captures, then threats. Solve mate-in-two and mate-in-three sets against the clock, then replay your own missed mates and find what hid them.",
    },
    quietDrill: {
      plain:
        "Keep looking for checks every time the other king is short of room. A few mate-in-one puzzles a day keep the habit sharp.",
      club:
        "Keep listing every check before each move and following each one two moves deep. A daily set of mate-in-two puzzles, solved without moving the pieces, keeps it sharp.",
      training:
        "Keep checks, captures and threats first in every position. Solve mate-in-two and mate-in-three sets against the clock to keep the patterns fresh.",
    },
  },
  "allowed-mate": {
    title: "Quick mates against you",
    noun: "quick mates allowed",
    what: "A move let the other side force checkmate within a couple of moves WHERE.",
    matters: "Nothing else on the board matters if the king falls first.",
    quiet: "No quick mate got through against you in THESE.",
    drill: {
      plain:
        "Before every move, look at your own king and ask: after my move, can they check me, and what happens then? If a check looks dangerous, deal with it first.",
      club:
        "Before each move, list the checks your opponent will have after it and make sure each has an answer. Practise defensive puzzles where the only move stops a mate.",
      training:
        "Make the opponent's checks and captures part of every candidate-move check. Study your own games where the king fell quickly and name the weak square or line each time.",
    },
    quietDrill: {
      plain:
        "Keep asking before every move: after my move, can they check me, and what happens then?",
      club:
        "Keep listing the checks your opponent will have after each move. A few defensive puzzles a week, where only one move stops a mate, keep it fresh.",
      training:
        "Keep the opponent's checks and captures in every candidate-move check. Study master games where a king came under fire and name the weak square or line.",
    },
  },
  "hung-piece": {
    title: "Pieces left out in the open",
    noun: "pieces left hanging",
    what: "A piece was left where it could simply be taken WHERE.",
    matters: "A free piece is often the whole game, and it is the easiest loss to stop.",
    quiet: "No piece was left hanging in THESE.",
    drill: {
      plain:
        "Before you let go of a piece, ask: after this move, can anything of mine be taken for free? Look at every piece, not only the one you moved.",
      club:
        "Before each move, list the pieces it leaves attacked and count attackers against defenders. Do a short set of hanging-piece puzzles every day until the check is automatic.",
      training:
        "Run a blunder check on every move, including the obvious ones. Go back to each piece you lost this period and find the move where that check would have caught it.",
    },
    quietDrill: {
      plain:
        "Keep asking before you let go of a piece: after this move, can anything of mine be taken for free?",
      club:
        "Keep counting attackers against defenders before each move. A short set of hanging-piece puzzles every other day keeps the check automatic.",
      training:
        "Keep the blunder check on every move, including the obvious ones. Solve mixed loose-piece puzzles against the clock to keep it quick.",
    },
  },
  "allowed-tactic": {
    title: "Shots left open for the opponent",
    noun: "tactics allowed",
    what: "A move left the other side a winning tactic, such as a fork, WHERE.",
    matters: "A tactic like that hands over material without the opponent having to work for it.",
    quiet: "No tactic was left open for the opponent in THESE.",
    drill: {
      plain:
        "After choosing a move, pretend you are your opponent: what is their best check, capture or attack now? If you find one that hurts, choose again.",
      club:
        "Before each move, look for the opponent's forcing replies: checks, captures and double attacks. Practise puzzles from the defending side, where you must spot the threat first.",
      training:
        "Make a blunder check part of every decision, looking at their forcing replies and then your answers. Replay your own positions from this period and find the reply you did not see.",
    },
    quietDrill: {
      plain:
        "After choosing a move, keep pretending you are your opponent: what is their best check, capture or attack now?",
      club:
        "Keep looking for the opponent's forcing replies before each move. Puzzles from the defending side a few times a week keep the threat-spotting sharp.",
      training:
        "Keep the blunder check in every decision, their forcing replies first. Solve puzzles from the defending side against the clock to keep it quick.",
    },
  },
  "missed-capture": {
    title: "Free material left on the board",
    noun: "missed captures",
    what: "You could have won material with a capture and played something else WHERE.",
    matters: "Free material is the simplest advantage there is, and it was already sitting there.",
    quiet: "No free material was left on the board in THESE.",
    drill: {
      plain:
        "Before every move, look at each of your opponent's pieces and ask: is it guarded? If one is not, see if you can take it safely.",
      club:
        "Start every move by listing all captures for both sides and counting attackers against defenders. A short daily set of win-material puzzles trains the counting.",
      training:
        "Treat every capture as a candidate move and count each exchange to the end. Revisit your missed captures from this period and note why each one looked unsafe.",
    },
    quietDrill: {
      plain:
        "Before every move, keep looking at each of your opponent's pieces and asking: is it guarded?",
      club:
        "Keep listing all captures for both sides before each move. A short set of win-material puzzles a few times a week keeps the counting quick.",
      training:
        "Keep treating every capture as a candidate move and counting each exchange to the end. Solve exchange-counting puzzles against the clock to stay sharp.",
    },
  },
  "missed-tactic": {
    title: "Tactics that went unplayed",
    noun: "missed tactics",
    what: "You had a winning tactic and did not play it WHERE.",
    matters: "A shot like that can decide a game on the spot.",
    quiet: "No winning tactic went unplayed in THESE.",
    drill: {
      plain:
        "When the other side has pieces bunched together or one left unguarded, stop and look for a move that attacks two things at once. A few fork puzzles a day help.",
      club:
        "Look at every check, capture and threat before choosing a move, even in quiet positions. Solve a themed puzzle set each day: forks, pins and discovered attacks.",
      training:
        "Search forcing lines in every position with loose pieces or an exposed king. Solve harder mixed tactics without moving pieces, and replay your missed shots to see what hid them.",
    },
    quietDrill: {
      plain:
        "Whenever pieces are bunched together or unguarded, keep looking for a move that attacks two things at once. A few fork puzzles a day help.",
      club:
        "Keep looking at every check, capture and threat before choosing a move. A themed puzzle set each day keeps forks, pins and discovered attacks fresh.",
      training:
        "Keep searching forcing lines in every position with loose pieces or an exposed king. Solve harder mixed tactics without moving the pieces.",
    },
  },
  "thrown-win": {
    title: "Wins that got away",
    noun: "thrown wins",
    what: "You reached a winning position and did not win WHERE.",
    matters: "The hard part was already done, so this is the cheapest kind of point to win back.",
    quiet: "No winning position got away in THESE.",
    drill: {
      plain:
        "Once you are well ahead, play safe: trade pieces, guard your king and check every move for free captures. Slow and sure wins the game.",
      club:
        "When you are winning, look first at what your opponent wants, then simplify: trade pieces, not pawns, and keep your king covered. Practise converting won positions against a friend or an engine.",
      training:
        "Treat a winning position as a new problem: find the opponent's best counterplay before your own plan. Play out won positions from your games against an engine until the win is routine.",
    },
    quietDrill: {
      plain:
        "Once you are well ahead, keep playing safe: trade pieces, guard your king and check every move for free captures.",
      club:
        "When you are winning, keep looking first at what your opponent wants, then simplify. Practise converting won positions against a friend or an engine.",
      training:
        "Keep treating a winning position as a new problem: the opponent's best counterplay first. Play out won endgames against an engine until the win is routine.",
    },
  },
  "time-trouble": {
    title: "When the clock gets short",
    noun: "mistakes in time trouble",
    what: "Mistakes came with the clock nearly empty WHERE.",
    matters: "The position was not the problem; the clock made the decision.",
    quiet: "The clock did not cost you in THESE.",
    drill: {
      plain:
        "Spend less time on the first few moves so you have time later. When your clock gets low, keep it simple: protect your pieces and make safe moves.",
      club:
        "Set a rough time budget per phase and check the clock every few moves. In easy positions, move quickly; save your thinking for the moments that need it.",
      training:
        "Review where your time went in your recent games and cut the long thinks in positions that did not need them. Practise faster games with a fixed routine for low-clock moves.",
    },
    quietDrill: {
      plain:
        "Keep spending less time on the first few moves so there is time later, and keep it simple when the clock gets low.",
      club:
        "Keep the rough time budget per phase and check the clock every few moves. Move quickly in easy positions and save your thinking for the hard ones.",
      training:
        "Keep the fixed routine for low-clock moves and cut long thinks where the position does not need them. Practise faster games to keep the routine automatic.",
    },
  },
  "opening-trouble": {
    title: "The same opening hole, again",
    noun: "repeated opening mistakes",
    what: "An early position you have met before went wrong again WHERE.",
    matters: "Fix the position once and it stays fixed in every game that reaches it.",
    quiet: "The old opening hole stayed shut in THESE.",
    drill: {
      plain:
        "Look up the position from your example games and learn one good move for it. Play it a few times against a friend or a computer until it feels normal.",
      club:
        "Take the position from your examples, find the main move and the idea behind it, and play a few training games from there. One line learned well beats ten skimmed.",
      training:
        "Prepare the exact position from your examples: the engine's move, the plans after it, and the traps on both sides. Drill it from both colours until the reply is automatic.",
    },
    quietDrill: {
      plain:
        "Keep the good move for that position fresh: play it a few times against a friend or a computer.",
      club:
        "Keep the line fresh: replay the main move and the idea behind it, and now and then play a few training games from that position.",
      training:
        "Keep the prepared position fresh: run through the engine's move, the plans after it and the traps on both sides, from both colours.",
    },
  },
};

const FALLBACK: PatternText = {
  title: "A recurring mistake",
  noun: "recurring mistakes",
  what: "This mistake turned up WHERE.",
  matters: "It costs more than it looks.",
  quiet: "This mistake stayed away in THESE.",
  drill: {
    plain: "Before every move, check what your move leaves open and what your opponent can do next.",
    club: "Before every move, list checks, captures and threats for both sides, then choose.",
    training: "Replay the example positions, find the better move in each, and note what made it hard to see.",
  },
  quietDrill: {
    plain: "Keep checking what your move leaves open and what your opponent can do next.",
    club: "Keep listing checks, captures and threats for both sides before every move.",
    training: "Keep the checks going on every move, and solve a short mixed puzzle set each day.",
  },
};

function textFor(patternId: string): PatternText {
  return (TEXT as Record<string, PatternText>)[patternId] ?? FALLBACK;
}

/** "in {gamesAffected} of your {games} games", in the right grammar for one game, some or all. */
function where(affected: number, games: number): string {
  if (games <= 1) return "in your only game this period";
  if (affected >= games) return "in each of your {games} games";
  if (affected === 1) return "in a single game out of {games}";
  return "in {gamesAffected} of your {games} games";
}

/** This period's games and games affected for the item's pattern. */
function periodCounts(item: FocusChoice, draft: ReportDraft): { games: number; affected: number } {
  const stat = draft.current.stats.find((s) => s.patternId === item.patternId);
  return { games: stat?.games ?? draft.current.games, affected: stat?.gamesAffected ?? 0 };
}

/**
 * What happened and why it matters, in two sentences, read from this period's stat for the
 * pattern. A kept item that stayed away gets a quiet-period line instead. No weeks, rate or
 * target: the report prints those lines itself, right under the wording.
 */
function why(item: FocusChoice, draft: ReportDraft): string {
  const t = textFor(item.patternId);
  const { games, affected } = periodCounts(item, draft);
  if (affected === 0) {
    const these = games === 0 ? "this period" : games === 1 ? "this game" : "these {games} games";
    return `${t.quiet.replace("THESE", these)} Keep the habit going so it stays that way.`;
  }
  return `${t.what.replace("WHERE", where(affected, games))} ${t.matters}`;
}

function summary(draft: ReportDraft): string {
  const parts: string[] = [];
  if (draft.notes.includes("few-games")) {
    const games = draft.current.games;
    const opening =
      games === 0
        ? "No games were played in this period, so there is nothing to count yet."
        : games === 1
          ? "Just a single game in this period, so here are the numbers on their own."
          : "Only {games} games in this period, so here are the numbers on their own.";
    parts.push(`${opening} Focus items start once there are enough games to go on.`);
  } else {
    parts.push("Over {games} games you made {mistakeRate} mistakes per hundred moves.");
    if (draft.focus.length === 0) {
      parts.push("No single habit came back often enough to pick out, which is its own kind of good news.");
    } else if (draft.focus.length === 1) {
      parts.push(`One habit stands out: ${textFor(draft.focus[0]!.patternId).noun}.`);
    } else {
      const [a, b] = draft.focus.map((f) => textFor(f.patternId).noun);
      parts.push(`The habits that stand out: ${a} and ${b}.`);
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
      const drill = periodCounts(item, draft).affected === 0 ? t.quietDrill[level] : t.drill[level];
      return { patternId: item.patternId, title: t.title, why: why(item, draft), drill };
    }),
  };
}
