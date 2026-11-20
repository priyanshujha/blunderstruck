import {
  BLIND_SPOT_IDS,
  BLIND_SPOTS,
  type BlindSpot,
  blindSpotTokenValues,
  type ExampleStory,
  type FocusChoice,
  type FocusExample,
  focusTokenValues,
  type MoveDetail,
  PATTERN_IDS,
  type PatternStat,
  type PeriodStats,
  RATING_BANDS,
  type RatingBand,
  type ReportDraft,
  renderText,
  summaryTokenValues,
} from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import { TEMPLATE_STEPS, templateWording } from "./templates";
import { countSentences, exampleMoves, moveKey, namedMoves, parseWording, sentences } from "./validate";

const SETTINGS = { analysisVersion: 1, patternsVersion: 1, engine: { name: "stockfish", depth: 12 } };

function stat(patternId: string): PatternStat {
  return { patternId, games: 31, moves: 1000, gamesAffected: 9, occurrences: 12, per100Moves: 1.2, avgWinPctLoss: 30 };
}

function period(): PeriodStats {
  return {
    start: "2026-10-20T00:00:00.000Z",
    end: "2026-11-19T00:00:00.000Z",
    games: 31,
    moves: 1000,
    mistakesPer100Moves: 4.25,
    settings: SETTINGS,
    stats: PATTERN_IDS.map(stat),
  };
}

function choice(patternId: string, kind: FocusChoice["reason"]["kind"] = "new", weeksCounted = 5): FocusChoice {
  return {
    patternId,
    exampleGameIds: [],
    baseline: stat(patternId),
    target: 0.9,
    since: "2026-11-19T00:00:00.000Z",
    blindSpots: [],
    reason: {
      kind,
      previousRank: null,
      score: 10,
      recentCost: 8,
      naiveCostThisPeriod: 9,
      rate: 1.2,
      severity: 30,
      chronicity: 0.7,
      weeksRecurred: 4,
      weeksCounted,
      weeks: [true, true, false, true, true, null],
    },
    // An example from before stories: its moves and the squares of its position may be named.
    examples: [
      {
        patternId,
        gameId: `g-${patternId}`,
        ply: 5,
        winPctLoss: 30,
        fen: "rnbqkb1r/pppppppp/5n2/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 2 2",
        played: "Nf3",
        best: "e4",
      },
    ],
  };
}

function draft(focus: FocusChoice[], band: RatingBand = "club"): ReportDraft {
  return {
    player: "invented-player",
    track: { platform: "lichess", username: "invented-player", timeClass: "rapid" },
    kind: "first",
    revision: 0,
    periodStart: "2026-10-20T00:00:00.000Z",
    periodEnd: "2026-11-19T00:00:00.000Z",
    rating: 1500,
    band,
    bandSource: "ratings",
    settings: SETTINGS,
    gamesFound: 31,
    gamesAnalyzed: 31,
    gameIds: [],
    coverage: { sampled: 31, analysed: 31, total: 31, complete: true, sampleOnly: false },
    current: period(),
    comparison: null,
    weeks: Array.from({ length: 6 }, period),
    trends: [],
    priorities: [],
    focus,
    progress: [],
    retired: [],
    notes: [],
  };
}

const TWO = draft([choice("hung-piece"), choice("missed-tactic")]);

function answer(over: { summary?: string; focus?: Partial<{ patternId: string; title: string; why: string; drill: string }>[] } = {}) {
  const base = [
    { patternId: "hung-piece", title: "Pieces left out", why: "In {gamesAffected} of your {games} games.", drill: "Check e4 and Nf3." },
    { patternId: "missed-tactic", title: "Missed shots", why: "You missed a fork {occurrences} times.", drill: "Puzzles daily." },
  ];
  const focus = over.focus ? over.focus.map((f, i) => ({ ...base[i % 2]!, ...f })) : base;
  return JSON.stringify({ summary: over.summary ?? "Over {games} games, {mistakesPerGame} mistakes a game.", focus });
}

function withWhy(why: string) {
  return answer({ focus: [{ why }, {}] });
}

/** Rows of the count table that pass in an item field but state a per-game level, which a new summary may not write as a number. */
const SUMMARY_LEVEL_ROWS: ReadonlySet<string> = new Set(["You averaged 2 blunders a game.", "You went from 3 blunders a game to 2."]);

/** An error from the move rule rather than the count rule. */
const MOVE_ERROR = / names /;

const errorsOf = (text: string, d: ReportDraft = TWO, only?: string[]) => {
  const r = parseWording(text, d, only);
  return r.ok ? [] : r.errors;
};

describe("parseWording", () => {
  it("accepts a good answer", () => {
    const r = parseWording(answer(), TWO);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.focus.map((f) => f.patternId)).toEqual(["hung-piece", "missed-tactic"]);
  });

  it('rejects "in 9 of 31 games" and accepts "in {gamesAffected} of {games} games"', () => {
    expect(errorsOf(withWhy("You hung a piece in 9 of 31 games."))).not.toEqual([]);
    expect(errorsOf(withWhy("You hung a piece in {gamesAffected} of {games} games."))).toEqual([]);
  });

  /**
   * Every sentence, checked against a draft that shows 31 games, 9 games affected and 12
   * occurrences. Each row is checked as a why (and a title when it fits, and the summary when it
   * holds no tokens), which are record fields, and as a drill, where counts in words are free.
   */
  const R = true;
  const X = false;
  it.each([
    // [sentence, passes in summary, title and why, passes in drill]
    ["You hung a piece in 9 of 31 games.", X, X],
    ["That was 9/31.", R, R],
    ["It cost 40% of the time.", X, X],
    ["It cost 12 percent.", X, X],
    ["It happened 3 times.", R, R],
    ["For 2 weeks running.", R, R],
    ["In 12 games out of the lot.", X, X],
    ["About 1.5 per hundred.", X, X],
    ["Once every 30 moves.", R, R],
    ["You made 4.25 mistakes per hundred moves.", X, X],
    ["That happened 12 separate times.", X, R],
    ["You blundered 9 pieces in 31 outings.", X, X],
    ["Solve 3 per day.", R, R],
    ["Your 1500 rating says otherwise.", R, R],
    ["Keep 90 seconds in reserve.", R, R],
    ["You hung a piece in nine of thirty-one games.", X, X],
    ["It happened twelve separate times.", R, R],
    ["In half the games the queen went first.", R, R],
    ["Twice in a dozen outings.", R, R],
    ["For three weeks running.", R, R],
    ["For two weeks, play only slow games.", R, R],
    ["Replay two master games in your opening.", X, R],
    ["Nine errors in the endgame alone.", R, R],
    ["You blundered 9 pieces in the endgame.", R, R],
    ["You left nine pieces en prise.", R, R],
    ["You hung 3 queens this month.", R, R],
    ["You lost two rooks to back-rank tricks.", R, R],
    ["You gave away three bishops.", R, R],
    ["Nine positions went wrong the same way.", R, R],
    ["Seven losses came from the same idea.", R, R],
    ["Twelve percent of your moves were errors.", X, X],
    ["It happens twice in every hundred moves.", R, R],
    ["That is two per hundred moves.", X, X],
    ["It came up in nine of your recent rated games.", X, R],
    ["You slip once every 20 moves.", R, R],
    ["You had under 10 seconds in most games.", R, R],
    ["That is two-point-one mistakes per hundred moves.", X, X],
    ["You hung a piece in ٩ games.", X, X],
    ["It happened ３ times.", R, R],
    ["It came up in a third of your games.", X, X],
    ["It came up in a quarter of your games.", X, X],
    ["It went wrong in half the games.", R, R],
    ["The count went from three to two.", R, R],
    ["Keep it below two.", R, R],
    ["There were nine such moments.", R, R],
    ["Do this drill three times a week.", R, R],
    ["Solve a set twice a week.", R, R],
    ["Analyse one game a day.", R, R],
    ["Play one 15-minute game each day.", R, R],
    ["Review one of your losses each day.", R, R],
    ["Replay one of your games with the engine off.", R, R],
    ["Play it out against an engine ten times.", R, R],
    ["It happened twice. Once is a slip.", R, R],
    ["Ten minutes a day, or 10 minutes if you prefer digits.", R, R],
    ["Play one longer game each day.", R, R],
    ["Play the 2 most forcing moves first.", R, R],
    ["Run a 3-fold check before you move.", R, R],
    ["Use one of your two bishops on the long diagonal.", R, R],
    ["It turned up in most of your games.", R, R],
    ["{gamesAffected} of {games} games", R, R],
    ["You hung a piece in {gamesAffected} of your {games} games.", R, R],
    ["Nf3", R, R],
    ["1.e4", R, R],
    ["move 12", R, R],
    ["2 rooks", R, R],
    ["O-O", R, R],
    ["e4", R, R],
    ["mate in 2", R, R],
    ["Qxh7+", R, R],
    ["20...Qxh2", R, R],
    ["Calculate 2 moves deep.", R, R],
    ["Calculate two moves deep.", R, R],
    ["Watch the first 12 moves.", R, R],
    ["By move 12 of the game the plan was gone.", R, R],
    ["Look again at moves 10 to 15.", R, R],
    ["Find 3 candidate moves before you choose.", R, R],
    ["Solve 5 puzzles, then play.", R, R],
    ["Below 30 seconds, play safe moves.", R, R],
    ["In 3+2 blitz the clock bites early.", R, R],
    ["A rook on the 7th rank is worth 2 pawns.", R, R],
    ["The knight on f6 was loose after e4.", R, R],
    ["Nf3 of all moves left the bishop on b5 hanging.", R, R],
    ["After 1. e4 e5 2. Nf3 the queen on d1 does nothing.", R, R],
    ["Qxh7+ was mate in the example; O-O-O walked into it; exd5 and e8=Q# came later.", R, R],
    ["Move 12 was where it went wrong.", R, R],
    ["Pick one habit and keep it for the week.", R, R],
    ["Castle early: 0-0 or 0-0-0, then connect the rooks.", R, R],
    ["The bishop on the a1-h8 diagonal eyes the f7-square.", R, R],
    ["The d5-pawn blocks it; e4-e5 opens the line.", R, R],
    ["Look for a 2-move combination first.", R, R],
    ["Play 10-minute games to practise this.", R, R],
    ["Use a 5-second rule before every capture.", R, R],
    ["The 10th move is where it usually goes wrong.", R, R],
    ["Learn the first 25 moves of your main line.", R, R],
    ["Checks, captures, threats: all 3 before every move.", R, R],
    ["Trade 2 rooks when you are ahead.", R, R],
    ["Three queens on the board is a puzzle, not a game plan.", R, R],
    ["{rate} times per hundred moves in your games.", X, X],
    ["You hung a piece in 9 games; check before every move.", X, X],
    ["You blundered a piece in nine games, so slow down.", X, R],
    ["Since you hung a piece in nine games, do 10 puzzles a day.", X, R],
    ["Your games had 12 hung pieces", R, R],
    ["Nine times you walked into a fork", X, R],
    ["You made the same mistake 6 times", R, R],
    ["You lost on time in 4 games", R, R],
    ["With 9 games affected out of 14", X, R],
    ["Half your games had a hanging piece", R, R],
    ["In a third of your games…", X, X],
    ["You gave up 5 pieces", R, R],
    ["You allowed four forks", R, R],
    ["You threw 3 wins away", R, R],
    ["Nine games ended with a hung piece.", R, R],
    ["Nd5 forked two pieces at once.", R, R],
    ["Two minor pieces were loose", R, R],
    ["One piece left alone is often the whole game.", R, R],
    ["One loose piece…", R, R],
    ["two extra pawns", R, R],
    ["four pawns against three", R, R],
    ["Twice-defended", R, R],
    ["The knight on c3 forks the king and rook after Nd5+.", R, R],
    ["After 1.e4 e5 2.Nf3 Nc6 3.Bc4, watch the f7 square.", R, R],
    ["In the Italian, 4.c3 prepares d4 with two central pawns.", R, R],
    ["A rook on the 7th rank ties down two pawns at once.", R, R],
    ["Rook and two pawns against a rook is usually a draw.", R, R],
    ["With four pawns against three on one wing, push the candidate pawn first.", R, R],
    ["Bb5 pins the knight to the king, and the pin holds for three moves.", R, R],
    ["Solve 15 tactics puzzles every morning before you play.", R, R],
    ["Play three 10-minute games a day and review each one.", R, R],
    ["Spend at most 20 seconds on the first 10 moves.", R, R],
    ["Keep 2 minutes on the clock for the last 10 moves of the game.", R, R],
    ["Set aside 30 minutes, three times a week, for endgame study.", R, R],
    ["Learn the Lucena position: king on the 8th rank, rook cutting off the other king.", R, R],
    ["In king and pawn endings, count the squares: a king 3 squares away still catches the pawn.", R, R],
    ["Two bishops against bishop and knight is a real edge in open positions.", R, R],
    ["A double attack hits two targets at once; look for it after every capture.", R, R],
    ["Calculate every forcing line three moves deep before you commit.", R, R],
    ["Play the first 8 moves from memory, then slow down.", R, R],
    ["Do one set of 20 puzzles, then play one rapid game.", R, R],
    ["Replay a master game in your opening twice a month.", R, R],
    ["The queen on h5 and bishop on c4 both aim at f7.", R, R],
    ["Three pieces attack the king and only two defend it.", R, R],
    ["Nf3 developed a piece and guarded e5 at the same time.", R, R],
    ["In 5+0 blitz, premove only when the recapture is forced.", R, R],
    ["Use the 5-second rule: before each capture, count to five.", R, R],
    ["Thirty seconds of checking beats ten minutes of regret.", R, R],
    ["Your two rooks are strongest when doubled on an open file.", R, R],
    ["Look at the first 3 candidate moves, then pick one.", R, R],
    ["Puzzle rush for 5 minutes, twice a day, is plenty.", R, R],
    ["Mate in 3 starts with a quiet move, Qg4.", R, R],
    ["After 20...Qxh2+ 21.Kf1, the king runs out of squares.", R, R],
    ["Win the exchange first, then trade down to two rooks against one.", R, R],
    ["Twice-defended pawns rarely fall to a single attacker.", R, R],
    ["The bishop pair is worth about half a pawn in open positions.", R, R],
    ["Keep the 50-move rule in mind in long endings.", R, R],
    ["Each day, set up one position from a master game and play it out ten times.", R, R],
    ["Castle by move 10, then bring both rooks to the centre.", R, R],
    ["Two rooks, no plan", R, R],
    ["Ten seconds of checking", R, R],
    ["You hung a piece {occurrences} times in {gamesAffected} of your {games} games.", R, R],
    ["You hung a piece in 7 games this month.", R, R],
    ["In eleven games you gave away a knight.", X, R],
    ["That made 4 losses in a row.", R, R],
    ["Your games this period had 9 hung pieces.", R, R],
    ["Three of your losses came from the same opening.", X, R],
    ["You blundered your queen twice.", R, R],
    ["Twice you walked into a back-rank mate.", R, R],
    ["You missed a mate in one five times.", X, R],
    ["The fork caught you out in 6 different games.", R, R],
    ["Half of your games ended in time trouble.", X, X],
    ["A quarter of your losses came from one opening.", X, X],
    ["You lost 3 of your last 5 games on time.", X, X],
    ["In 8 games you had under a minute by move 30.", R, R],
    ["You've dropped a pawn in twelve games.", X, R],
    ["You have allowed 5 forks so far.", R, R],
    ["Your rate is 2 per hundred moves.", X, X],
    ["That is a rate of three a game.", R, R],
    ["You averaged 2 blunders a game.", R, R],
    ["It came back in 4 weeks out of 6.", R, R],
    ["It showed up for 5 weeks running, then stopped.", R, R],
    ["These games had nine missed tactics.", R, R],
    ["You threw away two winning positions.", R, R],
    ["You left your queen en prise once.", R, R],
    ["You were winning in 10 games but drew 4.", R, R],
    ["Six times the clock ran out on you.", X, R],
    ["You lost about a third of your games to it.", X, X],
    ["You made 30 percent of your mistakes in the endgame.", X, X],
    ["Over 14 games you gave up 6 pieces.", R, R],
    ["1 in 4 of your games ended this way.", X, X],
    ["You lost points in 7 of the 20 games.", X, X],
    ["This week you hung two pieces.", R, R],
    ["By my count you blundered 11 times.", R, R],
    ["Nearly half your games had a loose piece.", R, R],
    ["You missed 9 free captures.", R, R],
    ["You played 25 games and lost 12.", R, R],
    ["Nine of your wins were close calls.", X, R],
    ["You went from 3 blunders a game to 2.", R, R],
    ["Nine hung pieces this week", R, R],
    ["You hung 9 pieces", R, R],
    ["Good start. You hung a piece in nine games, though.", X, R],

    // Rule A: a value the report showed (31 games, 9 affected, 12 occurrences) copied next to a record noun.
    ["You hung a piece in 9 games.", X, X],
    ["It came up 12 times.", X, R],
    ["Across 31 games the same thing happened.", X, R],
    ["9 of your games had a loose knight.", X, X],
    ["That happened on 12 occasions.", X, R],
    ["Loose pieces cost you 9 losses.", X, R],
    ["In 9 separate games the queen was lost.", X, X],
    ["Look back at those 9 games tonight.", R, R],
    ["It turned up in 9 of your 31 games.", X, X],

    // Rule B: statistic forms, whatever the numbers.
    ["You hung a piece in 40% of games.", X, X],
    ["A loose piece in 3 of 5 games is too many.", X, X],
    ["Two out of three games went this way.", X, X],
    ["That is 1 in 4 games.", X, X],
    ["2/5 games ended early.", X, X],
    ["Two thirds of your games had one.", X, X],
    ["Half of the wins slipped away late.", X, X],
    ["Your average is 1.4 per game.", X, X],
    ["A rate of 0.8 is the problem.", X, X],
    ["That is 3 per 100 moves.", X, X],
    ["The percentage is high.", X, X],

    // Rule C: a count in words beside a record noun, about the player, in the record fields.
    ["You missed a fork in five games.", X, R],
    ["Twice in your games the rook was trapped.", X, R],
    ["Your eleven losses came from the same trap.", X, R],
    ["You walked into a pin on six occasions.", X, R],
    ["Nine times you left the back rank weak.", X, R],

    // Positions, clocks, schedules and practice, including numbers that equal a shown value.
    ["Make it a firm rule: once you are under 10 seconds, only capture, recapture or check.", R, R],
    ["With 9 seconds left you played Kg8 when Nxe6 won the rook.", R, R],
    ["Gather 12 of your own blitz positions where a king move walked into a tactic.", R, R],
    ["Play a block of 3+2 games this week with one rule: by move 25, keep 15 seconds.", R, R],
    ["Add 12 themed puzzles a day on forks, solved from the defending side.", R, R],
    ["Play 9 games a day this week, all at 10+0.", R, R],
    ["Play 3 games per session and review the losses.", R, R],
    ["Play 9 rapid games weekly.", R, R],
    ["At move 31 the rook was still on a1.", R, R],
    ["Kg1 in game 9 was the moment it turned.", R, R],
    ["A queen and two rooks against a queen: trade one rook first.", R, R],
    ["In the first example, 2 pawns beat a knight in the endgame.", R, R],
    ["Spend 30 seconds per move in the opening, then speed up.", R, R],
    ["In 1+1 bullet, 9 seconds is a long think.", R, R],
    ["Nf5 and Qg4 hit two weak squares at once in your game.", R, R],
    ["In {gamesAffected} of your {games} games you dropped a piece, {occurrences} times in all.", R, R],
    ["After 31 moves the game was lost.", R, R],
    ["After 14 moves the game was lost.", R, R],
    ["You missed a mate in two in a game you then lost.", R, R],
    ["You missed mate in 9 in that game.", R, R],
    ["Play 9 games this week with the London.", R, R],
    ["Win 9 games in a row against the engine.", R, R],
    ["Play 12 games tonight at 10+0.", R, R],
  ] as const)("%j: record fields %s, drill %s", (text, inRecord, inDrill) => {
    const cases: [string, string, boolean][] = [
      ["why", answer({ focus: [{ why: text }, {}] }), inRecord],
      ["drill", answer({ focus: [{ drill: text }, {}] }), inDrill],
    ];
    if (text.length <= 60) cases.push(["title", answer({ focus: [{ title: text }, {}] }), inRecord]);
    // A level written as a number ("2 blunders a game") is the summary's business: {mistakesPerGame}.
    if (!/[{}]/.test(text)) cases.push(["summary", answer({ summary: text }), inRecord && !SUMMARY_LEVEL_ROWS.has(text)]);
    for (const [field, json, passes] of cases) {
      // The count rule alone: moves and squares are the move rule's business, tested below.
      const errors = errorsOf(json).filter((e) => !MOVE_ERROR.test(e));
      expect(errors.length === 0, `${field}: ${errors.join("\n")}`).toBe(passes);
    }
  });

  it.each([
    // [sentence, passes in record fields, passes in drill], with shown values 1 to 5 and 14
    ["Play 5 games this week with the London", R, R],
    ["Play 2 games, then review them", X, R],
    ["Win 2 games in a row", R, R],
    ["Repeat it 3 times", X, R],
    ["Spend 2 times as long", X, R],
    ["Review your 3 most recent losses", X, R],
    ["Solve 2 sets each week, 10 puzzles each", R, R],
    ["After 14 moves the game was lost", R, R],
    ["Play 4 games today", R, R],
    ["You hung a piece in 2 games, so slow down", X, X],
    ["Look again at 2 of your games", X, X],
    ["Go through the 3 games you lost on time", X, X],
    ["It came up in 3 out of 5 games", X, X],
  ] as const)("%j with few games: record fields %s, drill %s", (text, inRecord, inDrill) => {
    const shown = new Set([1, 2, 3, 4, 5, 14]);
    expect(countSentences(text, { shown, record: true }).length === 0).toBe(inRecord);
    expect(countSentences(text, { shown, record: false }).length === 0).toBe(inDrill);
  });

  it("unwraps a code fence in linear time", () => {
    const t0 = performance.now();
    expect(parseWording(`\`\`\`json\n${" ".repeat(4_000)}`, TWO).ok).toBe(false);
    expect(parseWording(`\`\`\`json\n${" ".repeat(4_000)}\`\`\`x`, TWO).ok).toBe(false);
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it("checks copied values against the draft it is given", () => {
    const text = withWhy("You hung a piece in 7 games.");
    expect(errorsOf(text)).toEqual([]);
    const seven = draft([choice("hung-piece"), choice("missed-tactic")]);
    seven.current = { ...seven.current, stats: seven.current.stats.map((s) => ({ ...s, gamesAffected: 7 })) };
    expect(errorsOf(text, seven)).toHaveLength(1);
  });

  it("splits sentences without breaking move text or decimals", () => {
    expect(sentences("After 1. e4 e5 2.Nf3 Nc6, play 20...Qxh2. Then 1.5 is a decimal! Next; last\nline")).toEqual([
      "After 1. e4 e5 2.Nf3 Nc6, play 20...Qxh2",
      "Then 1.5 is a decimal",
      "Next",
      "last",
      "line",
    ]);
    expect(sentences("Play Nf3. Then castle.")).toEqual(["Play Nf3", "Then castle"]);
    expect(sentences("Look at move 12. Black had a fork...")).toEqual(["Look at move 12", "Black had a fork"]);
  });

  it("names the sentence and asks for a token, never for a move into the drill", () => {
    const errors = errorsOf(withWhy("The knight on f6 was loose. It happened 12 times."));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe(
      'focus[0] (hung-piece).why, the sentence "It happened 12 times": Write this count with its token ({games}, {gamesAffected}, {occurrences}) or leave the number out.',
    );
    expect(errorsOf(answer({ summary: "You hung a piece in 9 games." }))[0]).toMatch(/token \(\{games\}, \{mistakesPerGame\}, \{focusCount\}\)/);
    for (const e of [...errors, ...errorsOf(answer({ focus: [{ drill: "Get it under 40%." }, {}] }))]) {
      expect(e).not.toMatch(/into the drill|study quantity/);
    }
  });

  it("skips the count scan on a field that is already too long", () => {
    const long = `${"9".repeat(500)} games`;
    expect(errorsOf(withWhy(long))).toEqual([expect.stringMatching(/why is 506 characters/)]);
  });

  it("scans a 20,000-character field quickly", () => {
    const inputs = [
      "1.".repeat(10_000),
      "9 ".repeat(10_000),
      "you hung nine of your games ".repeat(715).slice(0, 20_000),
      "9 of 31 games, half of your games, 1.5 per ".repeat(500).slice(0, 20_000),
      "a-".repeat(10_000),
      "{".repeat(20_000),
      `${"e4 ".repeat(6_666)}.`,
      "1.1.1.".repeat(3_334).slice(0, 20_000),
      "half ".repeat(4_000),
    ];
    for (const text of inputs) {
      const t0 = performance.now();
      countSentences(text, { shown: new Set([9, 12, 31]), record: true });
      expect(performance.now() - t0).toBeLessThan(100);
    }
  });

  it("rejects the tokens the report prints itself in every focus field", () => {
    for (const token of ["rate", "baselineRate", "target", "weeksRecurred", "weeksCounted"]) {
      for (const field of ["title", "why", "drill"] as const) {
        const errors = errorsOf(answer({ focus: [{ [field]: `Now at {${token}}.` }, {}] }));
        expect(errors.join("\n")).toMatch(
          new RegExp(`focus\\[0\\] \\(hung-piece\\)\\.${field} uses \\{${token}\\}; the report prints the weeks, rate, starting rate and target lines itself`),
        );
      }
    }
  });

  it("rejects unknown tokens and tokens from the wrong field", () => {
    expect(errorsOf(withWhy("In {bogus} games."))[0]).toMatch(/\{bogus\}, which is not an allowed token/);
    expect(errorsOf(withWhy("At {mistakeRate} per hundred moves."))[0]).toMatch(/\{mistakeRate\}/);
    expect(errorsOf(answer({ summary: "At {rate} per hundred moves." }))[0]).toMatch(/summary uses \{rate\}, which is not an allowed token/);
    expect(errorsOf(answer({ summary: "In {gamesAffected} games." }))[0]).toMatch(/summary uses \{gamesAffected\}/);
    expect(errorsOf(withWhy("A stray { brace."))[0]).toMatch(/unmatched brace/);
  });

  it("rejects wrong, missing, extra and reordered pattern ids", () => {
    expect(errorsOf(answer({ focus: [{ patternId: "thrown-win" }, {}] }))[0]).toMatch(/exactly these patternIds/);
    expect(errorsOf(answer({ focus: [{}] }))[0]).toMatch(/exactly these patternIds/);
    expect(errorsOf(answer({ focus: [{}, {}, {}] }))[0]).toMatch(/exactly these patternIds/);
    const reordered = JSON.stringify({ summary: "Fine.", focus: JSON.parse(answer()).focus.reverse() });
    expect(errorsOf(reordered)[0]).toMatch(/exactly these patternIds/);
  });

  it("expects only the ids in only, in draft order", () => {
    const one = JSON.stringify({ summary: "Fine.", focus: [JSON.parse(answer()).focus[1]] });
    expect(errorsOf(one, TWO, ["missed-tactic"])).toEqual([]);
    expect(errorsOf(answer(), TWO, ["missed-tactic"])[0]).toMatch(/\[missed-tactic\]/);
  });

  it("enforces the length limits", () => {
    expect(errorsOf(answer({ focus: [{ title: "x".repeat(60) }, {}] }))).toEqual([]);
    expect(errorsOf(answer({ focus: [{ title: "x".repeat(61) }, {}] }))[0]).toMatch(/title is 61 characters/);
    expect(errorsOf(answer({ focus: [{ why: "x".repeat(401) }, {}] }))[0]).toMatch(/why is 401/);
    expect(errorsOf(answer({ focus: [{ drill: "x".repeat(401) }, {}] }))[0]).toMatch(/drill is 401/);
    expect(errorsOf(answer({ summary: "x".repeat(601) }))[0]).toMatch(/summary is 601/);
  });

  it("rejects text that is not the schema", () => {
    expect(errorsOf("not json")).toEqual(["the answer is not valid JSON"]);
    expect(errorsOf("[]")[0]).toMatch(/JSON object/);
    expect(errorsOf(JSON.stringify({ summary: "Fine." }))).toContain("focus must be an array");
    expect(errorsOf(JSON.stringify({ summary: "", focus: [] }), draft([]))).toContain("summary must be a non-empty string");
    expect(errorsOf(JSON.stringify({ summary: "Fine.", focus: [], extra: 1 }), draft([]))).toContain("unexpected field extra");
    expect(errorsOf(answer({ focus: [{ title: "" }, {}] }))).toContain("focus[0].title must be a non-empty string");
  });

  it("accepts an answer wrapped in a code fence", () => {
    expect(parseWording("```json\n" + answer() + "\n```", TWO).ok).toBe(true);
  });
});

describe("templateWording", () => {
  const bands = RATING_BANDS.map((b) => b.id);

  /** The draft with this period's stat for `id` set to `affected` of `games` games. */
  function withAffected(
    id: string,
    affected: number,
    games: number,
    kind: FocusChoice["reason"]["kind"] = "kept",
    band: RatingBand = "club",
    weeksCounted = 5,
  ): ReportDraft {
    const d = draft([choice(id, kind, weeksCounted)], band);
    d.current = {
      ...d.current,
      games,
      stats: d.current.stats.map((s) =>
        s.patternId === id ? { ...s, games, gamesAffected: affected, occurrences: affected, per100Moves: affected / 10 } : s,
      ),
    };
    return d;
  }

  const PRINTED = /\{(weeksRecurred|weeksCounted|rate|baselineRate|target)\}/;

  it.each(bands)("passes the checks and renders for every pattern, reason and games affected at band %s", (band) => {
    for (const id of PATTERN_IDS) {
      for (const [kind, weeksCounted] of [["new", 5], ["kept", 2], ["rose", 0], ["returned", 6]] as const) {
        for (const [affected, games] of [[0, 14], [0, 1], [1, 14], [1, 1], [5, 14], [14, 14]] as const) {
          const d = withAffected(id, affected, games, kind, band, weeksCounted);
          const w = templateWording(d);
          const parsed = parseWording(JSON.stringify(w), d);
          expect(parsed, `${id} ${band} ${kind} ${affected}/${games}: ${JSON.stringify(parsed)}`).toMatchObject({ ok: true });
          const values = focusTokenValues(d.focus[0]!, d);
          const item = w.focus[0]!;
          for (const text of [item.title, item.why, item.drill]) {
            expect(text).not.toMatch(PRINTED);
            expect(renderText(text, values)).not.toMatch(/[{}]/);
          }
          expect(renderText(item.why, values).split(/(?<=\.)\s+/).length).toBeLessThanOrEqual(2);
          renderText(w.summary, summaryTokenValues(d));
        }
      }
    }
  });

  it("does not open the why with the game count, since the report prints the frequency below it", () => {
    for (const id of PATTERN_IDS) {
      const d = draft([choice(id)]);
      const why = templateWording(d).focus[0]!.why;
      expect(why).not.toMatch(/\{(gamesAffected|games|occurrences)\}/);
      expect(renderText(why, focusTokenValues(d.focus[0]!, d))).not.toMatch(/\d/);
    }
  });

  it.each([
    [0, 14, "these 14 games. Keep the habit going so it stays that way."],
    [0, 1, "this game. Keep the habit going so it stays that way."],
    [1, 14, "A piece was left where it could simply be taken. "],
    [5, 14, "A piece was left where it could simply be taken. "],
    [14, 14, "A piece was left where it could simply be taken. "],
    [1, 1, "A piece was left where it could simply be taken. "],
  ])("reads right with %i of %i games affected, for every pattern", (affected, games, expected) => {
    for (const id of PATTERN_IDS) {
      const d = withAffected(id, affected, games);
      const w = templateWording(d);
      expect(parseWording(JSON.stringify(w), d)).toMatchObject({ ok: true });
      const why = renderText(w.focus[0]!.why, focusTokenValues(d.focus[0]!, d));
      if (affected === 0 || id === "hung-piece") expect(why).toContain(expected);
      if (affected > 0) expect(why).not.toMatch(/\d/);
      expect(why).not.toMatch(/\b0 of\b|\b1 of\b|\b1 games\b/);
    }
  });

  it("gives every pattern and drill level a quiet-period drill that points at no mistakes", () => {
    for (const id of [...PATTERN_IDS, "unknown-pattern"]) {
      for (const band of bands) {
        const quiet = templateWording(withAffected(id, 0, 14, "kept", band)).focus[0]!.drill;
        const busy = templateWording(withAffected(id, 5, 14, "kept", band)).focus[0]!.drill;
        // An unknown pattern has no stat of its own, so it always reads as quiet.
        if (id !== "unknown-pattern") expect(quiet).not.toBe(busy);
        expect(quiet).not.toMatch(/this period|you lost|you did not|your own|missed|revisit|go back|example|from your games|recent games/i);
      }
    }
  });

  it("gives missed-tactic a quiet-period why when it stayed away", () => {
    expect(templateWording(withAffected("missed-tactic", 0, 14)).focus[0]!.why).toBe(
      "No winning tactic went unplayed in these {games} games. Keep the habit going so it stays that way.",
    );
  });

  it("sizes the drill by band", () => {
    const novice = templateWording(draft([choice("hung-piece")], "novice")).focus[0]!.drill;
    const club = templateWording(draft([choice("hung-piece")], "club")).focus[0]!.drill;
    const expert = templateWording(draft([choice("hung-piece")], "expert")).focus[0]!.drill;
    expect(new Set([novice, club, expert]).size).toBe(3);
    expect(templateWording(draft([choice("hung-piece")], "beginner")).focus[0]!.drill).toBe(novice);
  });

  it("leaves weeks, rate and target out of why, since the report prints them below it", () => {
    for (const id of PATTERN_IDS) {
      const w = templateWording(draft([choice(id)])).focus[0]!;
      for (const text of [w.why, w.drill]) {
        expect(text).not.toMatch(/\{(weeksRecurred|weeksCounted|rate|baselineRate|target)\}/);
        expect(text).not.toMatch(/weeks?\b/i);
      }
    }
    expect(templateWording(draft([choice("missed-tactic")])).focus[0]!.why).toBe(
      "You had a winning tactic and did not play it. A shot like that can decide a game on the spot.",
    );
  });

  it("writes a summary for none, one or two items, few games, and earlier progress", () => {
    const render = (d: ReportDraft) => renderText(templateWording(d).summary, summaryTokenValues(d));
    expect(render(draft([]))).toContain("No single habit");
    expect(render(draft([choice("hung-piece")]))).toContain("One habit stands out: pieces left hanging.");
    expect(render(TWO)).toContain("The habits that stand out: pieces left hanging and missed tactics.");
    const few = { ...draft([]), notes: ["few-games" as const] };
    expect(render(few)).toContain("Only 31 games");
    expect(render(few)).toContain(
      "Only 31 games in this period, so here are the numbers on their own. There are not enough games yet to pick something to work on; that starts once you have played a few more.",
    );
    const weekly = { ...few, kind: "weekly" as const };
    expect(render(weekly)).toContain("That is not enough games to pick something to work on this time; it starts again once you have played a few more.");
    expect(parseWording(JSON.stringify(templateWording(weekly)), weekly)).toMatchObject({ ok: true });
    for (const d of [few, weekly, { ...few, current: { ...few.current, games: 0 } }, { ...weekly, current: { ...weekly.current, games: 1 } }]) {
      expect(render(d)).not.toMatch(/focus item|this week/i);
    }
    for (const [games, opening] of [[1, "Just a single game in this period"], [0, "No games were played in this period"]] as const) {
      const d = { ...few, current: { ...few.current, games } };
      expect(render(d)).toContain(opening);
      expect(render(d)).not.toMatch(/\b[01] games\b/);
      expect(parseWording(JSON.stringify(templateWording(d)), d)).toMatchObject({ ok: true });
    }
    const better = draft([choice("missed-tactic")]);
    better.progress = [{ patternId: "hung-piece", previous: stat("hung-piece"), current: stat("hung-piece"), verdict: "improved", pValue: 0.01 }];
    better.retired = [{ patternId: "thrown-win", why: "graduated", since: better.periodEnd, baseline: stat("thrown-win"), current: stat("thrown-win") }];
    const text = render(better);
    expect(text).toContain("Fewer pieces left hanging than before");
    expect(text).toContain("Graduated, and well earned: thrown wins.");
    expect(parseWording(JSON.stringify(templateWording(better)), better).ok).toBe(true);
  });
});

/*
 * Fixture positions F1 to F3, with stories as the patterns package builds them.
 * F1: r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2Q3R w - - 0 1, White plays Qd2 and allows Ne4+ forking king and queen.
 * F2: r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3, White plays Nxe5 and loses the knight.
 * F3: r4rk1/ppp2ppp/5n2/8/8/8/PPPQ1KPP/R6R b - - 1 1, Black plays h6 and misses Ne4+.
 */
function mv(san: string, uci: string, piece: MoveDetail["piece"], color: MoveDetail["color"], fenAfter: string, extra: Partial<MoveDetail> = {}): MoveDetail {
  return {
    san,
    uci,
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    piece,
    color,
    check: /[+#]/.test(san),
    mate: san.includes("#"),
    fenAfter,
    ...extra,
  };
}

const F1_STORY: ExampleStory = {
  played: mv("Qd2", "d1d2", "queen", "white", "r4rk1/ppp2ppp/5n2/8/8/8/PPPQ1KPP/R6R b - - 1 1"),
  punish: [
    mv("Ne4+", "f6e4", "knight", "black", "r4rk1/ppp2ppp/8/8/4n3/8/PPPQ1KPP/R6R w - - 2 2"),
    mv("Ke1", "f2e1", "king", "white", "r4rk1/ppp2ppp/8/8/4n3/8/PPPQ2PP/R3K2R b - - 3 2"),
    mv("Nxd2", "e4d2", "knight", "black", "r4rk1/ppp2ppp/8/8/8/8/PPPn2PP/R3K2R w - - 0 3", { captured: "queen" }),
    mv("Kxd2", "e1d2", "king", "white", "r4rk1/ppp2ppp/8/8/8/8/PPPK2PP/R6R b - - 0 3", { captured: "knight" }),
  ],
  replyFound: true,
  better: [mv("Re1", "h1e1", "rook", "white", "r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2QR3 b - - 1 1")],
  targets: [
    { square: "f2", piece: "king", color: "white" },
    { square: "d2", piece: "queen", color: "white" },
  ],
  lost: { square: "d2", piece: "queen", color: "white" },
  gain: -6,
  betterReason: { kind: "covers-square", square: "e4" },
  winPctBefore: 96,
  winPctAfter: 28,
  depth: 18,
};

const F2_STORY: ExampleStory = {
  played: mv("Nxe5", "f3e5", "knight", "white", "r1bqkbnr/pppp1ppp/2n5/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 3", { captured: "pawn" }),
  punish: [mv("Nxe5", "c6e5", "knight", "black", "r1bqkbnr/pppp1ppp/8/4n3/4P3/8/PPPP1PPP/RNBQKB1R w KQkq - 0 4", { captured: "knight" })],
  replyFound: true,
  better: [mv("Bb5", "f1b5", "bishop", "white", "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3")],
  targets: [],
  lost: { square: "e5", piece: "knight", color: "white" },
  gain: -2,
  betterReason: { kind: "holds" },
  winPctBefore: 54,
  winPctAfter: 8,
  depth: 18,
};

const F3_STORY: ExampleStory = {
  played: mv("h6", "h7h6", "pawn", "black", "r4rk1/ppp2pp1/5n1p/8/8/8/PPPQ1KPP/R6R w - - 0 2"),
  punish: [],
  replyFound: false,
  better: [
    mv("Ne4+", "f6e4", "knight", "black", "r4rk1/ppp2ppp/8/8/4n3/8/PPPQ1KPP/R6R w - - 2 2"),
    mv("Ke1", "f2e1", "king", "white", "r4rk1/ppp2ppp/8/8/4n3/8/PPPQ2PP/R3K2R b - - 3 2"),
    mv("Nxd2", "e4d2", "knight", "black", "r4rk1/ppp2ppp/8/8/8/8/PPPn2PP/R3K2R w - - 0 3", { captured: "queen" }),
    mv("Kxd2", "e1d2", "king", "white", "r4rk1/ppp2ppp/8/8/8/8/PPPK2PP/R6R b - - 0 3", { captured: "knight" }),
  ],
  targets: [],
  gain: 0,
  betterGain: 6,
  betterReason: { kind: "wins", piece: "queen", gave: "knight", gain: 6 },
  winPctBefore: 30,
  winPctAfter: 3,
  depth: 18,
};

function storied(patternId: string, gameId: string, ply: number, story: ExampleStory, fen: string): FocusExample {
  return { patternId, gameId, ply, winPctLoss: 60, fen, played: story.played.san, story };
}

function spot(id: string, over: Partial<BlindSpot> = {}): BlindSpot {
  const basis = BLIND_SPOTS.find((b) => b.id === id)?.basis ?? "line";
  return { id, basis, count: 23, games: 14, of: 62, baselineCount: 30, baselineOf: 240, examples: [], ...over };
}

/** allowed-tactic shown with F1 and F2, with two blind spots. */
function allowedItem(spots = ["answer-check", "moved-piece-lost"]): FocusChoice {
  return {
    ...choice("allowed-tactic"),
    blindSpots: spots.map((id) => spot(id)),
    examples: [
      storied("allowed-tactic", "g-f1", 21, F1_STORY, "r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2Q3R w - - 0 1"),
      storied("allowed-tactic", "g-f2", 5, F2_STORY, "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3"),
    ],
  };
}

/** missed-tactic shown with F3, one blind spot. */
function missedItem(): FocusChoice {
  return {
    ...choice("missed-tactic"),
    blindSpots: [spot("best-check")],
    examples: [storied("missed-tactic", "g-f3", 22, F3_STORY, "r4rk1/ppp2ppp/5n2/8/8/8/PPPQ1KPP/R6R b - - 1 1")],
  };
}

const STORIED = draft([allowedItem(), missedItem()]);

const STEP_A = "Before every move, list each check your opponent will have after it.";
const STEP_B = "Before you let go of a piece, count who attacks and who defends its new square.";
const STEP_C = "On every move, look at each check you can give before anything else.";

function storiedAnswer(over: {
  summary?: string;
  a?: Partial<{ title: string; why: string; drill: string; steps: unknown }>;
  b?: Partial<{ title: string; why: string; drill: string; steps: unknown }>;
} = {}): string {
  return JSON.stringify({
    summary: over.summary ?? "Over {games} games you made {mistakesPerGame} mistakes a game.",
    focus: [
      {
        patternId: "allowed-tactic",
        title: "Checks you did not see coming",
        why: "In {gamesAffected} of your {games} games a move let them in. Qd2 walked into Ne4+, hitting the king on f2 and the queen on d2.",
        drill: "Before each move, look for their checks, captures and attacks.",
        steps: [
          { blindSpot: "answer-check", text: STEP_A },
          { blindSpot: "moved-piece-lost", text: STEP_B },
        ],
        ...over.a,
      },
      {
        patternId: "missed-tactic",
        title: "Forks that went unplayed",
        why: "You missed a shot in {gamesAffected} of your {games} games. Ne4+ won the queen; h6 let it go.",
        drill: "Solve 10 fork puzzles a day.",
        steps: [{ blindSpot: "best-check", text: STEP_C }],
        ...over.b,
      },
    ],
  });
}

const storiedErrors = (text: string, d: ReportDraft = STORIED) => {
  const r = parseWording(text, d);
  return r.ok ? [] : r.errors;
};

describe("the move rule", () => {
  it("accepts moves and squares from the item's example stories", () => {
    expect(storiedErrors(storiedAnswer())).toEqual([]);
    // Capture marks and disambiguation name the same move; check signs may be left off.
    expect(storiedErrors(storiedAnswer({ a: { why: "Ne4 forked king and queen, then Nd2 took the queen." } }))).toEqual([]);
    expect(storiedErrors(storiedAnswer({ a: { why: "Bb5 would have held; Nxe5 lost the knight on e5." } }))).toEqual([]);
  });

  it("rejects a move that is not in the item's examples, naming it and the moves shown", () => {
    const errors = storiedErrors(storiedAnswer({ a: { why: "Nc3 would have kept everything safe." } }));
    expect(errors).toEqual([
      "focus[0] (allowed-tactic).why names Nc3: this move is not in the examples shown (the moves shown: Qd2, Ne4+, Ke1, Nxd2, Kxd2, Re1, Nxe5, Bb5). Name only those moves, or say it in words without a move.",
    ]);
  });

  it("rejects a move from another item's examples", () => {
    // h6 is F3's move, shown only for missed-tactic; as a bare pawn move it reads as a square.
    expect(storiedErrors(storiedAnswer({ a: { drill: "Do not play h6 when a check is coming." } }))).toEqual([
      expect.stringMatching(/^focus\[0\] \(allowed-tactic\)\.drill names the square h6, which is not on a move or piece/),
    ]);
    expect(storiedErrors(storiedAnswer({ b: { title: "Bb5 was never the answer" } }))).toEqual([
      expect.stringMatching(/^focus\[1\] \(missed-tactic\)\.title names Bb5: this move is not in the examples shown \(the moves shown: h6, Ne4\+, Ke1, Nxd2, Kxd2\)/),
    ]);
  });

  it("rejects squares outside the stories' moves and pieces", () => {
    expect(storiedErrors(storiedAnswer({ a: { why: "The rook on a8 was watching." } }))).toEqual([
      expect.stringMatching(/allowed-tactic\)\.why names the square a8/),
    ]);
    // e4 is a square of the punishing move and the better reason; f2 holds a piece hit.
    expect(storiedErrors(storiedAnswer({ a: { why: "The knight landed on e4 with the king on f2." } }))).toEqual([]);
  });

  it("checks steps by the same move rule", () => {
    const steps = [
      { blindSpot: "answer-check", text: "Before every move, ask whether Nd5 is possible." },
      { blindSpot: "moved-piece-lost", text: STEP_B },
    ];
    expect(storiedErrors(storiedAnswer({ a: { steps } }))).toEqual([
      expect.stringMatching(/^focus\[0\] \(allowed-tactic\)\.steps\[0\] \(answer-check\) names Nd5: this move is not in the examples shown/),
    ]);
    const ok = [{ blindSpot: "answer-check", text: "Before every move, look for a knight check like Ne4+." }, steps[1]];
    expect(storiedErrors(storiedAnswer({ a: { steps: ok } }))).toEqual([]);
  });

  it("lets the summary name no move or square", () => {
    expect(storiedErrors(storiedAnswer({ summary: "Qd2 was the costliest move of the period." }))).toEqual([
      "summary names Qd2; the summary names no move or square, so say it in words.",
    ]);
    expect(storiedErrors(storiedAnswer({ summary: "A lot went wrong on e4." }))).toHaveLength(1);
  });

  it("allows an example without a story its move played, best move, fact and position", () => {
    const legacy: FocusExample = {
      patternId: "hung-piece",
      gameId: "g-old",
      ply: 9,
      winPctLoss: 40,
      evidence: "allowed Bxf7+ Kxf7 (fork)",
      fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
      played: "Nf6",
      best: "Bc5",
    };
    const m = exampleMoves([legacy]);
    for (const san of ["Nf6", "Bc5", "Bxf7+", "Kxf7"]) expect(m.keys.has(moveKey(san))).toBe(true);
    expect(m.squares.has("c4")).toBe(true); // the bishop on c4
    expect(m.squares.has("d5")).toBe(false); // an empty square
  });

  it("finds moves and squares in running text, tokens and move numbers aside", () => {
    expect(namedMoves("After 1.e4 e5 2.Nf3 Nc6, {games} games; O-O-O and exd5, e8=Q#, the f7-square.")).toEqual({
      moves: ["Nf3", "Nc6", "O-O-O", "exd5", "e8=Q#"],
      squares: ["e4", "e5", "f7"],
    });
    expect(moveKey("Nbxd2+")).toBe(moveKey("Nd2"));
    expect(moveKey("0-0")).toBe("O-O");
    expect(moveKey("exd5")).not.toBe(moveKey("d5"));
  });
});

describe("habit steps", () => {
  const withSteps = (steps: unknown) => storiedAnswer({ a: { steps } });
  const a = { blindSpot: "answer-check", text: STEP_A };
  const b = { blindSpot: "moved-piece-lost", text: STEP_B };

  it("accepts one step per blind spot in order, with step tokens", () => {
    const tokens = { blindSpot: "answer-check", text: "In {count} of {of} cases across {games} games the reply was a check: list their checks before every move." };
    expect(storiedErrors(withSteps([tokens, b]))).toEqual([]);
    const r = parseWording(withSteps([tokens, b]), STORIED);
    expect(r.ok && renderText(r.value.focus[0]!.steps[0]!.text, blindSpotTokenValues(spot("answer-check")))).toBe(
      "In 23 of 62 cases across 14 games the reply was a check: list their checks before every move.",
    );
  });

  it("rejects steps in the wrong order, missing or extra", () => {
    const order = /allowed-tactic\)\.steps must hold exactly one step per blind spot, in this order: \[answer-check, moved-piece-lost\]/;
    expect(storiedErrors(withSteps([b, a]))).toEqual([expect.stringMatching(order)]);
    expect(storiedErrors(withSteps([a]))).toEqual([expect.stringMatching(order)]);
    expect(storiedErrors(withSteps([a, b, { blindSpot: "undefended", text: STEP_A }]))).toEqual([expect.stringMatching(order)]);
    expect(storiedErrors(withSteps([]))).toEqual([expect.stringMatching(order)]);
    expect(storiedErrors(JSON.stringify({ ...JSON.parse(storiedAnswer()), focus: JSON.parse(storiedAnswer()).focus.map((f: object) => ({ ...f, steps: undefined })) }))).toHaveLength(2);
  });

  it("rejects steps on an item with no blind spots, and accepts a missing steps field there", () => {
    const d = draft([{ ...allowedItem([]) }, missedItem()]);
    expect(storiedErrors(withSteps([a]), d)).toEqual([expect.stringMatching(/steps must be empty: this item has no blind spots/)]);
    const answer = JSON.parse(withSteps([]));
    delete answer.focus[0].steps;
    expect(storiedErrors(JSON.stringify(answer), d)).toEqual([]);
  });

  it("rejects an over-long step, a foreign token, a copied count and a statistic", () => {
    const long = { blindSpot: "answer-check", text: `${"Look at their checks. ".repeat(10)}` };
    expect(storiedErrors(withSteps([long, b]))).toEqual([expect.stringMatching(/steps\[0\] \(answer-check\) is 220 characters; the limit is 200/)]);
    for (const text of ["It happened in {gamesAffected} games.", "Keep it under {rate}.", "Check {mistakeRate}."]) {
      expect(storiedErrors(withSteps([{ blindSpot: "answer-check", text }, b]))).toEqual([
        expect.stringMatching(/steps\[0\] \(answer-check\) uses \{\w+\}.*allowed: \{count\}, \{of\}, \{games\}/),
      ]);
    }
    // 23 is the blind spot's count, shown to the model; a count belongs in a token.
    expect(storiedErrors(withSteps([{ blindSpot: "answer-check", text: "You allowed a check in 23 games; list them first." }, b]))).toEqual([
      expect.stringMatching(/steps\[0\] \(answer-check\), the sentence .*Write this count with its token \(\{count\}, \{of\}, \{games\}\)/),
    ]);
    expect(storiedErrors(withSteps([{ blindSpot: "answer-check", text: "It was a check 37% of the time." }, b]))).toHaveLength(1);
    // Practice numbers stay free, as in a drill.
    expect(storiedErrors(withSteps([{ blindSpot: "answer-check", text: "Spend 10 seconds on their checks before every move." }, b]))).toEqual([]);
  });

  it("rejects steps that are not objects with blindSpot and text", () => {
    expect(storiedErrors(withSteps("look"))).toEqual(["focus[0].steps must be an array"]);
    expect(storiedErrors(withSteps([{ blindSpot: "answer-check", text: STEP_A, extra: 1 }, b]))).toEqual([
      "focus[0].steps[0] has unexpected field extra",
    ]);
    expect(storiedErrors(withSteps([{ blindSpot: "answer-check", text: "" }, b]))).toEqual(["focus[0].steps[0].text must be a non-empty string"]);
  });
});

describe("template steps", () => {
  it("has a step for every blind-spot id that passes the check and renders", () => {
    expect(Object.keys(TEMPLATE_STEPS).sort()).toEqual([...BLIND_SPOT_IDS].sort());
    for (const id of BLIND_SPOT_IDS) {
      for (const band of RATING_BANDS.map((b) => b.id)) {
        const d = draft([{ ...allowedItem([id]) }], band);
        const t = templateWording(d);
        expect(t.focus[0]!.steps).toEqual([{ blindSpot: id, text: TEMPLATE_STEPS[id] }]);
        const r = parseWording(JSON.stringify(t), d);
        expect(r.ok ? [] : r.errors, id).toEqual([]);
      }
      const text = TEMPLATE_STEPS[id];
      expect(text.length).toBeLessThanOrEqual(200);
      expect(() => renderText(text, blindSpotTokenValues(spot(id)))).not.toThrow();
    }
  });

  it("gives one step per blind spot in order, a plain step for an unknown id, and none without blind spots", () => {
    const d = draft([allowedItem(["moved-piece-lost", "answer-check", "lost-queen"]), { ...missedItem(), blindSpots: [] }]);
    const t = templateWording(d);
    expect(t.focus[0]!.steps.map((s) => s.blindSpot)).toEqual(["moved-piece-lost", "answer-check", "lost-queen"]);
    expect(t.focus[1]!.steps).toEqual([]);
    const unknown = draft([{ ...allowedItem([]), blindSpots: [spot("from-a-later-version")] }]);
    const u = templateWording(unknown);
    expect(u.focus[0]!.steps[0]!.blindSpot).toBe("from-a-later-version");
    expect(parseWording(JSON.stringify(u), unknown).ok).toBe(true);
  });

  it("words the two measured blind spots as board habits", () => {
    expect(TEMPLATE_STEPS["answer-check"]).toBe(
      "Before every move, list each check your opponent will have after it, and make sure every one of them has a safe answer.",
    );
    expect(TEMPLATE_STEPS["moved-piece-lost"]).toBe(
      "Before you let go of a piece, look at the square it lands on and count who attacks it and who defends it once it is there.",
    );
  });
});

describe("scope of the story allowances and blind-spot values", () => {
  it("does not let a storied example's fact add moves or squares", () => {
    const item = allowedItem();
    item.examples = [{ ...item.examples[0]!, evidence: "allowed Bb4+ Kd1 (fork) on c3" }, item.examples[1]!];
    const d = draft([item, missedItem()]);
    expect(storiedErrors(storiedAnswer({ a: { why: "Bb4+ was the shot." } }), d)).toEqual([
      expect.stringMatching(/why names Bb4\+: this move is not in the examples shown/),
    ]);
    expect(storiedErrors(storiedAnswer({ a: { why: "The square c3 mattered." } }), d)).toEqual([
      expect.stringMatching(/why names the square c3/),
    ]);
  });

  it("checks an item's why and steps against its blind-spot numbers, and its drill and the summary without them", () => {
    const item = { ...allowedItem(), blindSpots: [spot("answer-check", { count: 10 }), spot("moved-piece-lost")] };
    const d = draft([item, missedItem()]);
    const drill = "Play a block of 10 bullet games this week, then 10 games a day at rapid.";
    expect(storiedErrors(storiedAnswer({ a: { drill } }), d)).toEqual([]);
    expect(storiedErrors(storiedAnswer({ summary: "Play 10 games, then look back." }), d)).toEqual([]);
    expect(storiedErrors(storiedAnswer({ a: { why: "It happened in 10 games." } }), d)).toEqual([
      expect.stringMatching(/allowed-tactic\)\.why, the sentence "It happened in 10 games"/),
    ]);
    const steps = [{ blindSpot: "answer-check", text: "You allowed a check in 10 games; list their checks first." }, { blindSpot: "moved-piece-lost", text: STEP_B }];
    expect(storiedErrors(storiedAnswer({ a: { steps } }), d)).toHaveLength(1);
    // Another item's blind-spot number is not this item's.
    expect(storiedErrors(storiedAnswer({ b: { why: "It happened in 10 games." } }), d)).toEqual([]);
  });

  it("words moved-after-capture as the capture it is", () => {
    expect(TEMPLATE_STEPS["moved-after-capture"]).toMatch(/^Before you capture, look at the square you take on: who can take back there/);
  });
});

describe("the summary's overall level", () => {
  it("rejects {mistakeRate} in a new summary and says to use {mistakesPerGame}", () => {
    expect(errorsOf(answer({ summary: "Over {games} games, {mistakeRate} mistakes in all." }))).toEqual([
      "summary uses {mistakeRate}; per-hundred-move figures are shown only in the report's details, so state the overall level with {mistakesPerGame} (mistakes a game) instead (allowed: {games}, {mistakesPerGame}, {focusCount})",
    ]);
    expect(errorsOf(answer({ summary: "Over {games} games, {mistakesPerGame} mistakes a game." }))).toEqual([]);
  });

  it("still renders a stored summary that uses {mistakeRate}", () => {
    expect(renderText("{mistakeRate} mistakes per hundred moves.", summaryTokenValues(TWO))).toBe("4.25 mistakes per hundred moves.");
  });

  it("states the level per game in the template summary", () => {
    const text = templateWording(TWO).summary;
    expect(text).toContain("Over {games} games you made {mistakesPerGame} mistakes a game.");
    expect(text).not.toContain("{mistakeRate}");
  });

  it.each([
    ["Over {games} games you made 1.4 mistakes a game.", false],
    ["You averaged 1.4 mistakes each game.", false],
    ["You made {mistakesPerGame} mistakes per hundred moves.", false],
    ["You made {mistakesPerGame} mistakes per 100 moves.", false],
    ["Over 31 games the same habits did the damage.", false],
    ["Most of it came in 2 games of the endgame kind: 2 games is no trend.", false],
    [
      "Over {games} games you made {mistakesPerGame} mistakes a game. Most of the damage came from pieces left loose, either for a tactic or simply for the taking.",
      true,
    ],
    ["Over {games} games you made {mistakesPerGame} mistakes a game, and {focusCount} habits stand out.", true],
  ] as const)("summary %j passes: %s", (summary, passes) => {
    const d = draft([choice("hung-piece"), choice("missed-tactic")]);
    // {focusCount} is 2 here, so "2 games" copies a shown value.
    const errors = errorsOf(answer({ summary }), d);
    expect(errors.length === 0, errors.join("\n")).toBe(passes);
  });

  it("rejects per-hundred figures in every item field, steps included, naming what to do", () => {
    for (const over of [{ title: "Loose pieces, per hundred" }, { why: "It came {occurrences} times, per 100 moves." }, { drill: "Aim for fewer per hundred moves." }]) {
      expect(errorsOf(answer({ focus: [over, {}] }))).toEqual([expect.stringMatching(/per-hundred-move figures are shown only in the report's details, so leave "per hundred" out\.$/)]);
    }
    const steps = [{ blindSpot: "answer-check", text: "Keep their checks rare, per hundred moves." }, { blindSpot: "moved-piece-lost", text: STEP_B }];
    expect(storiedErrors(storiedAnswer({ a: { steps } }))).toEqual([expect.stringMatching(/steps\[0\] \(answer-check\), the sentence .*leave "per hundred" out/)]);
    expect(errorsOf(answer({ summary: "You made {mistakesPerGame} mistakes per hundred moves." }))).toEqual([
      expect.stringMatching(/^summary, the sentence .*leave "per hundred" out and state the overall level with \{mistakesPerGame\} mistakes a game\.$/),
    ]);
  });
});
