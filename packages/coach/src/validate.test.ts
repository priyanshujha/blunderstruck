import {
  type FocusChoice,
  focusTokenValues,
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
import { templateWording } from "./templates";
import { countSentences, parseWording, sentences } from "./validate";

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
    examples: [],
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
  return JSON.stringify({ summary: over.summary ?? "Over {games} games, {mistakeRate} mistakes per hundred moves.", focus });
}

function withWhy(why: string) {
  return answer({ focus: [{ why }, {}] });
}

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
    if (!/[{}]/.test(text)) cases.push(["summary", answer({ summary: text }), inRecord]);
    for (const [field, json, passes] of cases) {
      const errors = errorsOf(json);
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
    expect(errorsOf(answer({ summary: "You hung a piece in 9 games." }))[0]).toMatch(/token \(\{games\}, \{mistakeRate\}, \{focusCount\}\)/);
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

  it("renders the player's numbers in the why of the default draft", () => {
    const d = draft([choice("hung-piece")]);
    expect(renderText(templateWording(d).focus[0]!.why, focusTokenValues(d.focus[0]!, d))).toContain("9 of your 31 games");
  });

  it.each([
    [0, 14, "these 14 games. Keep the habit going so it stays that way."],
    [0, 1, "this game. Keep the habit going so it stays that way."],
    [1, 14, "in a single game out of 14."],
    [5, 14, "in 5 of your 14 games."],
    [14, 14, "in each of your 14 games."],
    [1, 1, "in your only game this period."],
  ])("reads right with %i of %i games affected, for every pattern", (affected, games, expected) => {
    for (const id of PATTERN_IDS) {
      const d = withAffected(id, affected, games);
      const w = templateWording(d);
      expect(parseWording(JSON.stringify(w), d)).toMatchObject({ ok: true });
      const why = renderText(w.focus[0]!.why, focusTokenValues(d.focus[0]!, d));
      expect(why).toContain(expected);
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
      "You had a winning tactic and did not play it in {gamesAffected} of your {games} games. A shot like that can decide a game on the spot.",
    );
  });

  it("writes a summary for none, one or two items, few games, and earlier progress", () => {
    const render = (d: ReportDraft) => renderText(templateWording(d).summary, summaryTokenValues(d));
    expect(render(draft([]))).toContain("No single habit");
    expect(render(draft([choice("hung-piece")]))).toContain("One habit stands out: pieces left hanging.");
    expect(render(TWO)).toContain("The habits that stand out: pieces left hanging and missed tactics.");
    const few = { ...draft([]), notes: ["few-games" as const] };
    expect(render(few)).toContain("Only 31 games");
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
