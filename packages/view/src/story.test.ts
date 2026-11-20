import { type BetterReason, ExampleStory as ExampleStorySchema, type ExampleStory, type MoveDetail } from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import { storyOf } from "../../patterns/src/story";
import { type ScriptedEval, fixtureGame } from "../../patterns/src/test-fixtures";
import { type StoryLine, storyCost, storyLines } from "./story";

/** A move with sensible defaults; the board after it is not read by the view. */
const mv = (o: Partial<MoveDetail> & Pick<MoveDetail, "san" | "from" | "to" | "piece" | "color">): MoveDetail => ({
  uci: `${o.from}${o.to}`,
  check: false,
  mate: false,
  fenAfter: "8/8/8/8/8/8/8/8 w - - 0 1",
  ...o,
});

/** F1: `r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2Q3R w - - 0 1`, Qd2 allows Ne4+ forking king and queen. */
const F1: ExampleStory = {
  played: mv({ san: "Qd2", from: "d1", to: "d2", piece: "queen", color: "white" }),
  punish: [
    mv({ san: "Ne4+", from: "f6", to: "e4", piece: "knight", color: "black", check: true }),
    mv({ san: "Ke1", from: "f2", to: "e1", piece: "king", color: "white" }),
    mv({ san: "Nxd2", from: "e4", to: "d2", piece: "knight", color: "black", captured: "queen" }),
    mv({ san: "Kxd2", from: "e1", to: "d2", piece: "king", color: "white", captured: "knight" }),
  ],
  // The game played the whole line, and so paid for the move.
  replyFound: true,
  followed: 4,
  inGame: {
    moves: [
      mv({ san: "Ne4+", from: "f6", to: "e4", piece: "knight", color: "black", check: true }),
      mv({ san: "Ke1", from: "f2", to: "e1", piece: "king", color: "white" }),
      mv({ san: "Nxd2", from: "e4", to: "d2", piece: "knight", color: "black", captured: "queen" }),
      mv({ san: "Kxd2", from: "e1", to: "d2", piece: "king", color: "white", captured: "knight" }),
    ],
    ended: false,
    paid: true,
    net: 6,
    lost: { square: "d2", piece: "queen", color: "white" },
  },
  better: [mv({ san: "Re1", from: "h1", to: "e1", piece: "rook", color: "white" })],
  targets: [
    { square: "d2", piece: "queen", color: "white" },
    { square: "f2", piece: "king", color: "white" },
  ],
  lost: { square: "d2", piece: "queen", color: "white" },
  gain: -6,
  betterGain: 0,
  betterReason: { kind: "covers-square", square: "e4" },
  winPctBefore: 94.2,
  winPctAfter: 26.4,
  depth: 18,
};

/** F3: `r4rk1/ppp2ppp/5n2/8/8/8/PPPQ1KPP/R6R b - - 1 1`, h6 misses the same fork. */
const F3: ExampleStory = {
  played: mv({ san: "h6", from: "h7", to: "h6", piece: "pawn", color: "black" }),
  punish: [mv({ san: "Rhe1", from: "h1", to: "e1", piece: "rook", color: "white" })],
  replyFound: true,
  better: [
    mv({ san: "Ne4+", from: "f6", to: "e4", piece: "knight", color: "black", check: true }),
    mv({ san: "Ke1", from: "f2", to: "e1", piece: "king", color: "white" }),
    mv({ san: "Nxd2", from: "e4", to: "d2", piece: "knight", color: "black", captured: "queen" }),
    mv({ san: "Kxd2", from: "e1", to: "d2", piece: "king", color: "white", captured: "knight" }),
  ],
  key: { line: "better", index: 0 },
  targets: [
    { square: "f2", piece: "king", color: "white" },
    { square: "d2", piece: "queen", color: "white" },
  ],
  gain: 0,
  betterGain: 6,
  betterReason: { kind: "wins", piece: "queen", gave: "knight", gain: 6 },
  winPctBefore: 76,
  winPctAfter: 8,
  depth: 18,
};

/** F2: `r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3`, Nxe5 hangs the knight. */
const F2: ExampleStory = {
  played: mv({ san: "Nxe5", from: "f3", to: "e5", piece: "knight", color: "white", captured: "pawn" }),
  punish: [mv({ san: "Nxe5", from: "c6", to: "e5", piece: "knight", color: "black", captured: "knight" })],
  replyFound: true,
  followed: 1,
  better: [mv({ san: "Bb5", from: "f1", to: "b5", piece: "bishop", color: "white" })],
  targets: [],
  lost: { square: "e5", piece: "knight", color: "white" },
  gain: -2,
  betterReason: { kind: "holds" },
  winPctBefore: 55,
  winPctAfter: 12,
  depth: 18,
};

const texts = (s: ExampleStory, patternId?: string) => storyLines(s, patternId).map((l) => [l.tag, l.text]);

/** A story whose game played the first `n` plies of `punish` (the game's moves only, not paid). */
const withGame = (s: ExampleStory, n: number, over: Partial<NonNullable<ExampleStory["inGame"]>> = {}): ExampleStory => ({
  ...s,
  followed: n,
  replyFound: n >= 1,
  inGame: { moves: s.punish.slice(0, n), ended: false, ...over },
});

/** The story as stored before the game's own moves were kept. */
const withoutGame = (s: ExampleStory): ExampleStory => {
  const { inGame: _i, ...rest } = s;
  return rest;
};

describe("storyLines", () => {
  /** F1 where the game left the engine's line after `followed` plies (or played `actualReply` at once). */
  const f1 = (followed: number, over: Partial<ExampleStory> = {}): ExampleStory => {
    const s = { ...F1, ...over };
    if (followed >= 1) return withGame(s, followed);
    const reply = over.actualReply;
    return { ...s, followed: 0, replyFound: false, inGame: { moves: reply ? [reply] : [], ended: !reply } };
  };

  it("tells F1 in the past when the game played the whole line", () => {
    expect(texts(F1, "allowed-tactic")).toEqual([
      ["you", "Your queen went to d2."],
      ["they", "They found it: the knight jumped to e4 with check, hitting your king and queen at once."],
      ["then", "Your king stepped aside, the knight took your queen, and your king took the knight."],
      ["better", "Rook to e1. After it, e4 is guarded, so the knight cannot land there safely."],
    ]);
    expect(storyCost(F1).text).toBe("It cost your queen.");
  });

  it("tells what was played in the past and the rest of the line as what would follow", () => {
    expect(texts(f1(2)).slice(1, 3)).toEqual([
      ["they", "They found it: the knight jumped to e4 with check, hitting your king and queen at once."],
      ["then", "Your king stepped aside. From there the knight would take your queen, and your king would take the knight."],
    ]);
    expect(texts(f1(1))[2]).toEqual([
      "then",
      "From there your king would have to step aside, the knight would take your queen, and your king would take the knight.",
    ]);
    expect(storyCost(f1(2)).text).toBe("It could have cost your queen.");
    expect(storyCost(f1(1)).text).toBe("It could have cost your queen.");
  });

  it("leaves out the rest of the line when nothing material remains", () => {
    const quietRest = f1(1, { punish: [F1.punish[0]!, F1.punish[1]!] });
    expect(texts(quietRest).map(([t]) => t)).toEqual(["you", "they", "better"]);
  });

  it("states only what the game did when it left the line at once", () => {
    const rb8 = mv({ san: "Rb8", from: "a8", to: "b8", piece: "rook", color: "black" });
    expect(texts(f1(0, { actualReply: rb8 })).slice(1, 3)).toEqual([
      ["they", "That let the knight jump to e4 with check, hitting your king and queen at once."],
      ["then", "In the game they played rook to b8 instead."],
    ]);
    const bxa2 = mv({ san: "Bxa2+", from: "e6", to: "a2", piece: "bishop", color: "black", captured: "pawn", check: true });
    expect(texts(f1(0, { actualReply: bxa2 }))[2]).toEqual(["then", "In the game they played bishop takes your pawn on a2, with check, instead."]);
    const castled = mv({ san: "O-O", from: "e8", to: "g8", piece: "king", color: "black", castle: "king" });
    expect(texts(f1(0, { actualReply: castled }))[2]).toEqual(["then", "In the game they castled kingside instead."]);
    // No reply at all: the game ended on the move.
    expect(texts(f1(0))[2]).toEqual(["then", "The game ended there."]);
    expect(storyCost(f1(0, { actualReply: rb8 })).text).toBe("It could have cost your queen.");
  });

  it("reads a story stored before plies were counted as only its first reply played", () => {
    const { followed: _f, ...stored } = withoutGame(F1);
    const old = { ...stored, actualReply: F1.punish[0]! };
    expect(texts(old)[1]![1]).toBe("They found it: the knight jumped to e4 with check, hitting your king and queen at once.");
    expect(texts(old)[2]).toEqual([
      "then",
      "From there your king would have to step aside, the knight would take your queen, and your king would take the knight.",
    ]);
    expect(storyCost(old).text).toBe("It could have cost your queen.");
  });

  it("does not say they found it for an older story whose reply took the piece another way", () => {
    // Older reports set `replyFound` when any move took the piece; here a bishop took the queen, not the engine's knight.
    const { followed: _f, ...stored } = withoutGame(F1);
    const bxd2 = mv({ san: "Bxd2", from: "g5", to: "d2", piece: "bishop", color: "black", captured: "queen" });
    const old = { ...stored, replyFound: true, actualReply: bxd2 };
    // Without the game's later moves the capture's cost is unknown: it is left unsaid, never set against "could have cost".
    expect(texts(old).slice(1)).toEqual([
      ["they", "That let the knight jump to e4 with check, hitting your king and queen at once."],
      ["better", "Rook to e1. After it, e4 is guarded, so the knight cannot land there safely."],
    ]);
    expect(storyCost(old).text).toBe("It could have cost your queen.");
  });

  it("says what the game played next, and nothing more, for a story stored without the game's moves", () => {
    const old = { ...withoutGame(F1), followed: 4 };
    // Plies counted as followed are not told as played: only the next move is known.
    expect(texts(old)[2]).toEqual([
      "then",
      "From there your king would have to step aside, the knight would take your queen, and your king would take the knight.",
    ]);
    expect(storyCost(old).text).toBe("It could have cost your queen.");
    const rb8 = mv({ san: "Rb8", from: "a8", to: "b8", piece: "rook", color: "black" });
    expect(texts({ ...old, followed: 0, replyFound: false, actualReply: rb8 })[2]).toEqual(["then", "In the game they played rook to b8 instead."]);
  });

  it("keeps pieces as segments a page can draw", () => {
    const they = storyLines(f1(0))[1]!;
    expect(they.segments).toEqual([
      { text: "That let the " },
      { piece: "knight", color: "black" },
      { text: " jump to e4 with check, hitting your " },
      { piece: "king", color: "white" },
      { text: " and " },
      { piece: "queen", color: "white" },
      { text: " at once." },
    ]);
  });

  it("gives F3's better move and why it wins", () => {
    const better = storyLines(F3, "missed-tactic").find((l) => l.tag === "better")!;
    expect(better.text).toContain("Knight to e4, with check.");
    expect(better.text).toContain("It wins their queen for your knight.");
    expect(better.text).toBe("Knight to e4, with check. That hits their king and queen at once. It wins their queen for your knight.");
    expect(storyLines(F3)[0]!.text).toBe("Your pawn went to h6.");
  });

  it("tells a hung piece as left there, then taken or only allowed", () => {
    expect(texts(F2, "hung-piece")).toEqual([
      ["you", "Your knight took the pawn on e5. That left your knight on e5 where it could be taken."],
      ["they", "They found it: their knight took your knight on e5."],
      ["better", "Bishop to b5. It keeps the position together."],
    ]);
    const a3 = mv({ san: "a3", from: "a2", to: "a3", piece: "pawn", color: "white" });
    const missed = { ...F2, followed: 0, replyFound: false, actualReply: a3 };
    expect(texts(missed, "hung-piece").slice(1, 3)).toEqual([
      ["they", "That let their knight take your knight on e5."],
      ["then", "In the game they played pawn to a3 instead."],
    ]);
    expect(storyCost(missed).text).toBe("It could have cost your knight.");
  });

  it("puts the targets on the key move when it is later in the line", () => {
    const s: ExampleStory = {
      ...F1,
      punish: [
        mv({ san: "Bxc3", from: "b4", to: "c3", piece: "bishop", color: "black", captured: "knight" }),
        mv({ san: "bxc3", from: "b2", to: "c3", piece: "pawn", color: "white", captured: "bishop" }),
        mv({ san: "Ne4", from: "f6", to: "e4", piece: "knight", color: "black" }),
      ],
      followed: 3,
      inGame: {
        moves: [
          mv({ san: "Bxc3", from: "b4", to: "c3", piece: "bishop", color: "black", captured: "knight" }),
          mv({ san: "bxc3", from: "b2", to: "c3", piece: "pawn", color: "white", captured: "bishop" }),
          mv({ san: "Ne4", from: "f6", to: "e4", piece: "knight", color: "black" }),
        ],
        ended: false,
      },
      key: { line: "punish", index: 2 },
      targets: [
        { square: "c3", piece: "pawn", color: "white" },
        { square: "d2", piece: "queen", color: "white" },
        { square: "f2", piece: "rook", color: "white" },
      ],
    };
    const [, they, then] = storyLines(s);
    expect(they!.text).toBe("They found it: the bishop took your knight on c3.");
    expect(then!.text).toBe("Your pawn took the bishop, and the knight went to e4, hitting your queen, rook and pawn at once.");
  });

  it("names a discovered attack's rear piece and what it aims at, in the tense of what happened", () => {
    const s: ExampleStory = {
      ...F1,
      punish: [mv({ san: "Nc3+", from: "d5", to: "c3", piece: "knight", color: "black", check: true })],
      followed: 1,
      targets: [
        { square: "e1", piece: "king", color: "white" },
        { square: "d2", piece: "queen", color: "white" },
      ],
      rear: { square: "d8", piece: "rook", color: "black" },
    };
    expect(storyLines(s)[1]!.text).toBe(
      "They found it: the knight jumped to c3 with check. Moving it opened the line behind it: their rook on d8 was now aimed at your queen.",
    );
    expect(storyLines({ ...s, followed: 0, replyFound: false })[1]!.text).toBe(
      "That let the knight jump to c3 with check. Moving it would open the line behind it: their rook on d8 would be aimed at your queen.",
    );
    const noAim = { ...s, followed: 0, replyFound: false, rear: { square: "a8", piece: "bishop" as const, color: "black" as const } };
    expect(storyLines(noAim)[1]!.text).toBe(
      "That let the knight jump to c3 with check. Moving it would open the line behind it for their bishop on a8.",
    );
  });

  describe("every move kind", () => {
    const W = "white" as const;
    const B = "black" as const;
    const cases: { name: string; move: MoveDetail; you: string; they: string; found: string; then: string; would?: string; better: string }[] = [
      {
        name: "quiet",
        move: mv({ san: "Bc4", from: "f1", to: "c4", piece: "bishop", color: W }),
        you: "Your bishop went to c4.",
        they: "That let the bishop come to c4.",
        found: "They found it: the bishop went to c4.",
        then: "Your bishop went to c4.",
        better: "Bishop to c4.",
      },
      {
        name: "knight quiet",
        move: mv({ san: "Nf3", from: "g1", to: "f3", piece: "knight", color: W }),
        you: "Your knight went to f3.",
        they: "That let the knight jump to f3.",
        found: "They found it: the knight jumped to f3.",
        then: "Your knight went to f3.",
        better: "Knight to f3.",
      },
      {
        name: "capture",
        move: mv({ san: "Bxf7", from: "c4", to: "f7", piece: "bishop", color: W, captured: "pawn" }),
        you: "Your bishop took the pawn on f7.",
        they: "That let the bishop take your pawn on f7.",
        found: "They found it: the bishop took your pawn on f7.",
        then: "Your bishop took the pawn.",
        would: "From there your bishop would take the pawn.",
        better: "Bishop takes the pawn on f7.",
      },
      {
        name: "same-kind capture",
        move: mv({ san: "Nxe5", from: "f3", to: "e5", piece: "knight", color: W, captured: "knight" }),
        you: "Your knight took their knight on e5.",
        they: "That let their knight take your knight on e5.",
        found: "They found it: their knight took your knight on e5.",
        then: "Your knight took their knight.",
        would: "From there your knight would take their knight.",
        better: "Knight takes their knight on e5.",
      },
      {
        name: "check",
        move: mv({ san: "Qh5+", from: "d1", to: "h5", piece: "queen", color: W, check: true }),
        you: "Your queen went to h5 with check.",
        they: "That let the queen come to h5 with check.",
        found: "They found it: the queen went to h5 with check.",
        then: "Your queen went to h5 with check.",
        better: "Queen to h5, with check.",
      },
      {
        name: "mate",
        move: mv({ san: "Qxf7#", from: "h5", to: "f7", piece: "queen", color: W, captured: "pawn", check: true, mate: true }),
        you: "Your queen took the pawn on f7: checkmate.",
        they: "That let the queen take your pawn on f7: checkmate.",
        found: "They found it: the queen took your pawn on f7: checkmate.",
        then: "Your queen took the pawn: checkmate.",
        would: "From there your queen would take the pawn: checkmate.",
        better: "Queen takes the pawn on f7, checkmate.",
      },
      {
        name: "castling kingside",
        move: mv({ san: "O-O", from: "e1", to: "g1", piece: "king", color: W, castle: "king" }),
        you: "You castled kingside.",
        they: "That let them castle kingside.",
        found: "They found it: they castled kingside.",
        then: "You castled kingside.",
        better: "Castle kingside.",
      },
      {
        name: "castling queenside",
        move: mv({ san: "O-O-O", from: "e1", to: "c1", piece: "king", color: W, castle: "queen" }),
        you: "You castled queenside.",
        they: "That let them castle queenside.",
        found: "They found it: they castled queenside.",
        then: "You castled queenside.",
        better: "Castle queenside.",
      },
      {
        name: "promotion",
        move: mv({ san: "e8=Q", from: "e7", to: "e8", piece: "pawn", color: W, promotion: "queen" }),
        you: "Your pawn reached e8 and became a queen.",
        they: "That let the pawn reach e8 and become a queen.",
        found: "They found it: the pawn went to e8 and became a queen.",
        then: "Your pawn went to e8 and became a queen.",
        would: "From there your pawn would go to e8 and become a queen.",
        better: "Pawn to e8, becoming a queen.",
      },
      {
        name: "promotion with capture",
        move: mv({ san: "exd8=N", from: "e7", to: "d8", piece: "pawn", color: W, captured: "rook", promotion: "knight" }),
        you: "Your pawn took the rook on d8 and became a knight.",
        they: "That let the pawn take your rook on d8 and become a knight.",
        found: "They found it: the pawn took your rook on d8 and became a knight.",
        then: "Your pawn took the rook and became a knight.",
        would: "From there your pawn would take the rook and become a knight.",
        better: "Pawn takes the rook on d8, becoming a knight.",
      },
      {
        name: "en passant",
        move: mv({ san: "exd6", from: "e5", to: "d6", piece: "pawn", color: W, captured: "pawn", enPassant: true }),
        you: "Your pawn took their pawn en passant, landing on d6.",
        they: "That let their pawn take your pawn en passant, landing on d6.",
        found: "They found it: their pawn took your pawn en passant, landing on d6.",
        then: "Your pawn took their pawn en passant.",
        would: "From there your pawn would take their pawn en passant.",
        better: "Pawn takes their pawn en passant, landing on d6.",
      },
    ];

    /** The same move as the opponent's: colour swapped, so "your" and "the" trade places. */
    const theirs = (m: MoveDetail): MoveDetail => ({ ...m, color: B });
    const base: ExampleStory = {
      ...F1,
      targets: [],
      key: undefined,
      rear: undefined,
      lost: undefined,
      betterReason: undefined,
      followed: 0,
      replyFound: false,
    };

    for (const c of cases) {
      it(c.name, () => {
        const asYou = storyLines({ ...base, played: c.move, punish: [], better: [] });
        expect(asYou.map((l) => l.text)).toEqual([c.you]);

        // Allowed, not played; then played.
        const asThey = storyLines({ ...base, punish: [theirs(c.move)], better: [] });
        expect(asThey[1]!.text).toBe(c.they);
        const asFound = storyLines(withGame({ ...base, punish: [theirs(c.move)], better: [] }, 1));
        expect(asFound[1]!.text).toBe(c.found);

        // Later in the line: played, then only what would follow (said only when it is material).
        const quiet = mv({ san: "a6", from: "a7", to: "a6", piece: "pawn", color: B });
        const asThen = storyLines(withGame({ ...base, punish: [quiet, c.move], better: [] }, 2));
        expect(asThen[2]!.text).toBe(c.then);
        const asWould = storyLines(withGame({ ...base, punish: [quiet, c.move], better: [] }, 1));
        expect(asWould.find((l) => l.tag === "then")?.text).toBe(c.would);

        const asBetter = storyLines({ ...base, punish: [], better: [c.move] });
        expect(asBetter.at(-1)).toEqual(expect.objectContaining({ tag: "better", text: c.better }));
      });
    }
  });

  describe("every better reason", () => {
    const cases: [BetterReason, string][] = [
      [{ kind: "mates", mateIn: 3 }, "It forces mate in 3 moves."],
      [{ kind: "mates", mateIn: 1 }, "It gives mate at once."],
      [{ kind: "mates" }, "It forces mate."],
      [{ kind: "wins", piece: "rook", gave: "bishop", gain: 2 }, "It wins their rook for your bishop."],
      [{ kind: "wins", piece: "queen", gain: 9 }, "It wins their queen."],
      [{ kind: "wins", gain: 3 }, "It wins material worth about 3 pawns."],
      [{ kind: "wins", gain: 1 }, "It wins material worth about a pawn."],
      // Equal pieces, or pieces that do not match the swing, are not named.
      [{ kind: "wins", piece: "queen", gave: "queen", gain: 5 }, "It wins material worth about 5 pawns."],
      [{ kind: "wins", piece: "bishop", gave: "bishop", gain: 2 }, "It wins material worth about 2 pawns."],
      [{ kind: "wins", piece: "queen", gain: 3 }, "It wins material worth about 3 pawns."],
      [{ kind: "covers-square", square: "e4", piece: "knight" }, "After it, e4 is guarded, so the knight cannot land there safely."],
      [{ kind: "covers-square", square: "e4" }, "After it, e4 is guarded, so the knight cannot land there safely."],
      [{ kind: "covers-square", square: "c5" }, "After it, c5 is guarded."],
      [{ kind: "stops-key-move", square: "e4", piece: "knight" }, "After it, the knight can no longer go to e4."],
      [{ kind: "stops-key-move" }, "After it, the knight can no longer go to e4."],
      [{ kind: "holds" }, "It keeps the position together."],
    ];
    for (const [reason, sentence] of cases) {
      it(`${reason.kind} ${JSON.stringify(reason)}`, () => {
        const better = storyLines({ ...F1, betterReason: reason }).at(-1)!;
        expect(better.text).toBe(`Rook to e1. ${sentence}`);
      });
    }
    it("stops-key-move without a punishing move", () => {
      expect(storyLines({ ...F1, punish: [], betterReason: { kind: "stops-key-move" } }).at(-1)!.text).toBe(
        "Rook to e1. After it, their best reply is no longer possible.",
      );
    });

    describe("holds, for a piece the reply would take at once", () => {
      // 1.h3? Bxc3: the bishop on b4 takes the knight on c3, which stood there before the move.
      const hangs: ExampleStory = {
        played: mv({ san: "h3", from: "h2", to: "h3", piece: "pawn", color: "white" }),
        punish: [mv({ san: "Bxc3", from: "b4", to: "c3", piece: "bishop", color: "black", captured: "knight" })],
        replyFound: false,
        followed: 0,
        better: [mv({ san: "Ne4", from: "c3", to: "e4", piece: "knight", color: "white" })],
        targets: [],
        lost: { square: "c3", piece: "knight", color: "white" },
        gain: -3,
        betterGain: 0,
        betterReason: { kind: "holds", gain: 0 },
        winPctBefore: 50,
        winPctAfter: 20,
        depth: 18,
      };
      const better = (s: ExampleStory) => storyLines(s).at(-1)!.text;

      it("says the better move moves the piece away", () => {
        expect(better(hangs)).toBe("Knight to e4. It moves your knight off c3, where the bishop could take it.");
      });

      it("says the better move takes the piece that would take it", () => {
        const axb4 = mv({ san: "axb4", from: "a3", to: "b4", piece: "pawn", color: "white", captured: "bishop" });
        expect(better({ ...hangs, better: [axb4] })).toBe("Pawn takes the bishop on b4. It takes the bishop that could take your knight.");
      });

      it("keeps the general sentence when the stored lines do not show it", () => {
        const general = "It keeps the position together.";
        // The better move does something else.
        expect(better({ ...hangs, better: [mv({ san: "Rb1", from: "a1", to: "b1", piece: "rook", color: "white" })] })).toBe(`Rook to b1. ${general}`);
        // The played move put the piece there (F2): it did not stand there before.
        expect(better(F2)).toBe(`Bishop to b5. ${general}`);
        // The reply takes something else, or nothing is lost.
        expect(better({ ...hangs, lost: undefined })).toBe(`Knight to e4. ${general}`);
        expect(better({ ...hangs, lost: { square: "c3", piece: "bishop", color: "white" } })).toBe(`Knight to e4. ${general}`);
        // The played move left from the attacker's square, so the attacker did not stand there before it.
        expect(better({ ...hangs, played: mv({ san: "Kb3", from: "b4", to: "b3", piece: "king", color: "white" }) })).toBe(`Knight to e4. ${general}`);
        // Other kinds are unchanged.
        expect(better({ ...hangs, betterReason: { kind: "covers-square", square: "c3" } })).toBe("Knight to e4. After it, c3 is guarded, so the bishop cannot land there safely.");
      });
    });
  });
});

describe("the moves each line tells, from the real story builder", () => {
  // 1.Qc1? allows ...Ne2+ 2.Kh1 Nxc1 3.Rxc1 (the engine's line); better was Qd4.
  const FEN = "r4rk1/ppp2ppp/8/8/3n4/8/PPPQ1PPP/5RK1 w - - 0 1";
  const EVALS: Record<string, ScriptedEval> = {
    1: { cp: 765, pv: ["d2d4", "b7b6", "d4a4", "c7c5", "h2h4", "h7h6", "f1e1", "f8c8", "c2c3", "c8c7"] },
    2: { cp: -750, pv: ["d4e2", "g1h1", "e2c1", "f1c1", "a8d8", "g2g3", "f7f5", "c1e1", "g8f7", "h1g2"] },
  };
  const built = async (moves: string): Promise<ExampleStory> => {
    const g = await fixtureGame({ pgn: `[Event "fixture"]\n[SetUp "1"]\n[FEN "${FEN}"]\n\n${moves} *`, as: "white", evals: EVALS });
    const s = storyOf(g, { gameId: g.analysis.gameId, ply: 1, patternId: "allowed-tactic" });
    expect(s).toBeDefined();
    return ExampleStorySchema.parse(s);
  };
  const told = (s: ExampleStory) => storyLines(s, "allowed-tactic").map((l) => [l.tag, l.moves.map((m) => `${m.source}${m.index}${m.played ? "" : "?"}`)]);
  /** The SAN of the moves a line tells, from the story itself. */
  const sans = (s: ExampleStory, line: StoryLine): string[] =>
    line.moves.map((m) => (m.source === "played" ? s.played : m.source === "actualReply" ? s.actualReply! : m.source === "inGame" ? s.inGame!.moves[m.index]! : s[m.source][m.index]!).san);

  it("covers the game's moves, solid, when the game followed the engine's line", async () => {
    const s = await built("1. Qc1 Ne2+ 2. Kh1 Nxc1 3. Rxc1 Rad8");
    expect(told(s)).toEqual([
      ["you", ["played0"]],
      ["they", ["punish0"]],
      ["then", ["inGame1", "inGame2", "inGame3"]],
      ["better", s.better.map((_, i) => `better${i}?`)],
    ]);
    expect(sans(s, storyLines(s, "allowed-tactic")[2]!)).toEqual(["Kh1", "Nxc1", "Rxc1"]);
  });

  it("covers the game's move, and the engine's reply as not played, when the game left the line at once", async () => {
    const s = await built("1. Qc1 Rad8");
    const lines = storyLines(s, "allowed-tactic");
    expect(told(s).slice(0, 3)).toEqual([
      ["you", ["played0"]],
      ["they", ["punish0?"]],
      ["then", ["inGame0"]],
    ]);
    expect(lines[2]!.text).toBe("In the game they played rook to d8 instead. The game ended there.");
    expect(sans(s, lines[1]!)).toEqual(["Ne2+"]);
    expect(sans(s, lines[2]!)).toEqual(["Rad8"]);
  });

  it("covers no move when the game ended there", async () => {
    const s = await built("1. Qc1");
    const lines = storyLines(s, "allowed-tactic");
    expect(told(s).slice(0, 3)).toEqual([
      ["you", ["played0"]],
      ["they", ["punish0?"]],
      ["then", []],
    ]);
    expect(lines[2]!.text).toBe("The game ended there.");
  });

  it("covers the game's moves and then the rest of the engine's line as not played", async () => {
    const s = await built("1. Qc1 Ne2+ 2. Kh1 Rad8 3. h3 h6 4. a3 a6");
    const then = storyLines(s, "allowed-tactic").find((l) => l.tag === "then")!;
    expect(then.text).toMatch(/From there /);
    const played = then.moves.filter((m) => m.played);
    const notPlayed = then.moves.filter((m) => !m.played);
    expect(played.every((m) => m.source === "inGame")).toBe(true);
    expect(notPlayed.length).toBeGreaterThan(0);
    expect(notPlayed.every((m) => m.source === "punish")).toBe(true);
    // The engine's moves follow on from where the game's own stop.
    expect(notPlayed[0]!.index).toBe(played.length + 1);
    expect(notPlayed.at(-1)!.index).toBe(s.punish.length - 1);
  });

  it("covers the next move and then the engine's line as not played, for a story stored without the game's moves", () => {
    const older = { ...withoutGame(F1), followed: 2 };
    expect(told(older)).toEqual([
      ["you", ["played0"]],
      ["they", ["punish0"]],
      ["then", ["punish1?", "punish2?", "punish3?"]],
      ["better", ["better0?"]],
    ]);
    const left: ExampleStory = { ...withoutGame(F1), followed: 0, replyFound: false, actualReply: mv({ san: "Rb8", from: "a8", to: "b8", piece: "rook", color: "black" }) };
    expect(told(left).slice(1, 3)).toEqual([
      ["they", ["punish0?"]],
      ["then", ["actualReply0"]],
    ]);
  });
});

describe("storyCost", () => {
  /** F1 whose game took what the move allowed, with the game's own figures. */
  const paid = (over: Partial<NonNullable<ExampleStory["inGame"]>>, s: ExampleStory = F1): ExampleStory => ({
    ...s,
    inGame: { moves: s.punish, ended: false, paid: true, ...over },
  });
  /** F1 whose game did not (yet) take it. */
  const unpaid = (s: ExampleStory = F1): ExampleStory => ({ ...s, inGame: { moves: [s.punish[0]!], ended: false } });

  it("leads with the piece lost in the game, winning chances as the detail", () => {
    const c = storyCost(F1, "allowed-tactic");
    expect(c.text).toBe("It cost your queen.");
    expect(c.segments).toEqual([{ text: "It cost your " }, { piece: "queen", color: "white" }, { text: "." }]);
    expect(c.detail).toBe("Your winning chances went from 94% to 26%.");
  });

  it("says what the piece went for, and the exchange, as paid or as possible", () => {
    expect(storyCost(paid({ net: 4, lost: F1.lost, lostFor: "rook" })).text).toBe("It cost your queen for a rook.");
    expect(storyCost(unpaid({ ...F1, lostFor: "rook" })).text).toBe("It could have cost your queen for a rook.");
    const rook = { square: "d4", piece: "rook" as const, color: "white" as const };
    expect(storyCost(paid({ net: 2, lost: rook, lostFor: "bishop", exchange: true })).text).toBe("It cost the exchange (a rook for a bishop).");
    expect(storyCost(paid({ net: 3, lost: rook, lostFor: "bishop", exchange: true })).text).toBe("It cost the exchange (a rook for a bishop) and a pawn.");
    expect(storyCost(unpaid({ ...F1, gain: -2, lost: rook, lostFor: "knight" })).text).toBe("It could have cost the exchange (a rook for a knight).");
  });

  it("says checkmate, a missed win, material, or winning chances", () => {
    const mateIn1 = [mv({ san: "Qh2#", from: "h4", to: "h2", piece: "queen", color: "black", check: true, mate: true })];
    expect(storyCost(paid({}, { ...F1, punish: mateIn1 })).text).toBe("It allowed checkmate.");
    expect(storyCost(unpaid({ ...F1, punish: mateIn1 })).text).toBe("It could have allowed checkmate.");
    expect(storyCost(withoutGame({ ...F1, punish: mateIn1 })).text).toBe("It could have allowed checkmate.");
    expect(storyCost(F3, "missed-tactic").text).toBe("It cost the chance to win their queen for your knight.");
    // Nothing beyond what the move played won: no material claim.
    expect(storyCost({ ...F3, gain: 6 }, "missed-tactic").text).toBe("Your winning chances went from 76% to 8%.");
    expect(storyCost({ ...F3, betterReason: { kind: "mates", mateIn: 2 } }, "missed-mate").text).toBe("It cost a forced mate.");
    expect(storyCost(paid({ net: 1, lost: undefined })).text).toBe("It cost a pawn.");
    expect(storyCost(paid({ net: 3, lost: undefined })).text).toBe("It cost about 3 pawns of material.");
    expect(storyCost(unpaid({ ...F1, lost: undefined, gain: -3 })).text).toBe("It could have cost about 3 pawns of material.");
    // A positional loss: nothing about material, only the chances.
    const positional = storyCost(unpaid({ ...F1, lost: undefined, gain: 0 }));
    expect(positional.text).toBe("Your winning chances went from 94% to 26%.");
    expect(positional.detail).toBeUndefined();
    expect(storyCost({ ...F3, betterGain: 2, betterReason: { kind: "wins", piece: "bishop", gave: "bishop", gain: 2 } }, "missed-tactic").text).toBe(
      "It cost the chance to win material worth about 2 pawns.",
    );
  });

  it("states a cost as a fact only when the game paid, whatever else the game's moves show", () => {
    // The whole line played but not marked paid (an older story): a possibility.
    expect(storyCost({ ...F1, inGame: { moves: F1.punish, ended: false } }).text).toBe("It could have cost your queen.");
    // Stored without the game's moves, even with the whole line counted as followed.
    expect(storyCost({ ...withoutGame(F1), followed: 4 }).text).toBe("It could have cost your queen.");
  });
});

describe("from the game's own moves (inGame)", () => {
  const fork = F1.punish[0]!;
  const g = (over: Partial<NonNullable<ExampleStory["inGame"]>>): ExampleStory => ({
    ...F1,
    inGame: { moves: [], ended: false, ...over },
  });

  it("says the game ended only when it did", () => {
    expect(storyLines(g({ ended: true })).find((l) => l.tag === "then")?.text).toBe("The game ended there.");
    expect(storyLines(g({ moves: [fork], ended: true })).find((l) => l.tag === "then")?.text).toBe("The game ended there.");
    expect(storyLines(g({ moves: [fork], ended: false })).find((l) => l.tag === "then")?.text).toMatch(/^From there /);
  });

  it("tells a missed chance without any punishment", () => {
    const s = { ...F3, inGame: { moves: F3.punish, ended: false } };
    expect(storyLines(s, "missed-tactic").map((l) => l.tag)).toEqual(["you", "better"]);
  });
});

describe("only what the game shows is a fact, from the real story builder", () => {
  const fenPgn = (fen: string, moves: string): string => `[Event "fixture"]\n[SetUp "1"]\n[FEN "${fen}"]\n\n${moves} *`;
  // 1.Qc1? allows ...Ne2+ 2.Kh1 Nxc1 3.Rxc1; better was Qd4.
  const QC1 = "r4rk1/ppp2ppp/8/8/3n4/8/PPPQ1PPP/5RK1 w - - 0 1";
  const QC1_EVALS: Record<string, ScriptedEval> = {
    1: { cp: 765, pv: ["d2d4", "b7b6", "d4a4", "c7c5", "h2h4", "h7h6", "f1e1", "f8c8", "c2c3", "c8c7"] },
    2: { cp: -750, pv: ["d4e2", "g1h1", "e2c1", "f1c1", "a8d8", "g2g3", "f7f5", "c1e1", "g8f7", "h1g2"] },
  };
  // 1...h6? allows 2.d5, winning the pinned knight.
  const D5 = "4k3/ppp2ppp/2n5/1B6/3P4/8/PP3PPP/6K1 b - - 0 1";
  const D5_EVALS: Record<string, ScriptedEval> = {
    2: { cp: 54, pv: ["e8e7", "b5c6", "b7c6", "g1f1", "e7d6", "f1e2", "c6c5", "e2d3", "d6d5", "d4c5"] },
    3: { cp: 522, pv: ["d4d5", "e8e7", "d5c6", "b7b6", "g1f1", "e7d6", "f1e2", "d6c5", "b5a4", "c5d6"] },
  };
  const built = async (fen: string, moves: string, as: "white" | "black", evals: Record<string, ScriptedEval>, ply: number) => {
    const g = await fixtureGame({ pgn: fenPgn(fen, moves), as, evals });
    return ExampleStorySchema.parse(storyOf(g, { gameId: g.analysis.gameId, ply, patternId: "allowed-tactic" }));
  };
  const all = (s: ExampleStory): string[] => [...storyLines(s, "allowed-tactic").map((l) => `${l.tag}: ${l.text}`), `cost: ${storyCost(s, "allowed-tactic").text}`];
  /** Nothing may say or imply the move cost nothing: the game's moves are only the next few. */
  const noAllClear = (lines: string[]) => {
    for (const l of lines) expect(l).not.toMatch(/got away|nothing was lost|did not cost|cost nothing|no harm/i);
  };

  it("1.Qc1 Rad8 2.Qh6 gxh6 3.Kh1: the queen went by a later move of the player's own, so Qc1's cost is only a possibility", async () => {
    const s = await built(QC1, "1. Qc1 Rad8 2. Qh6 gxh6 3. Kh1", "white", QC1_EVALS, 1);
    const lines = all(s);
    expect(lines.at(-1)).toBe("cost: It could have cost your queen for a knight.");
    expect(lines.join(" ")).not.toContain("It cost");
    expect(lines[2]).toBe("then: In the game they played rook to d8 instead. After that, your queen went to h6, and the pawn took your queen.");
    expect(lines.join(" ")).not.toContain("The game ended there.");
    noAllClear(lines);
  });

  it("1...h6 2.d5: the opponent found it, read from the game's next move", async () => {
    const s = await built(D5, "1... h6 2. d5 Kf8 3. a3 a6 4. g3", "black", D5_EVALS, 2);
    const lines = all(s);
    expect(lines[1]).toBe("they: They found it: the pawn went to d5, hitting your knight.");
    expect(lines.join(" ")).not.toContain("That let");
    expect(lines.join(" ")).not.toContain("instead");
    noAllClear(lines);
  });

  it("1.Qc1 h6 2.a3 a6: the game is not said to have ended when its last move is beyond the story", async () => {
    const s = await built(QC1, "1. Qc1 h6 2. a3 a6", "white", QC1_EVALS, 1);
    const lines = all(s);
    expect(lines[2]).toBe("then: In the game they played pawn to h6 instead.");
    expect(lines.join(" ")).not.toContain("The game ended there.");
    expect(lines.at(-1)).toBe("cost: It could have cost your queen for a knight.");
    noAllClear(lines);
    // It is said when the reply was the game's last move.
    expect(all(await built(QC1, "1. Qc1 h6", "white", QC1_EVALS, 1))[2]).toBe("then: In the game they played pawn to h6 instead. The game ended there.");
  });

  it("a story without the game's moves says nothing of the game beyond its next move, and nothing against its cost", async () => {
    const full = await built(QC1, "1. Qc1 Rad8 2. Qh6 gxh6 3. Kh1", "white", QC1_EVALS, 1);
    const { inGame: _i, ...old } = full;
    const lines = all(old);
    expect(lines.slice(1)).toEqual([
      "they: That let the knight jump to e2 with check, hitting your king and queen at once.",
      "then: In the game they played rook to d8 instead.",
      expect.stringMatching(/^better: /),
      "cost: It could have cost your queen for a knight.",
    ]);
    // The reply found: only what would follow, never the plies counted as followed told as played.
    const { inGame: _j, ...oldFound } = await built(QC1, "1. Qc1 Ne2+ 2. Kh1 Nxc1 3. Rxc1 Rad8", "white", QC1_EVALS, 1);
    const found = all(oldFound);
    expect(found[1]).toMatch(/^they: They found it: /);
    expect(found[2]).toMatch(/^then: From there /);
    expect(found.at(-1)).toBe("cost: It could have cost your queen for a knight.");
    noAllClear([...lines, ...found]);
  });
});
