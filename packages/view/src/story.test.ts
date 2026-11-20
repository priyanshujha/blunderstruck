import type { BetterReason, ExampleStory, MoveDetail } from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import { storyCost, storyLines } from "./story";

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
  replyFound: true,
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

describe("storyLines", () => {
  it("tells F1 move by move", () => {
    expect(texts(F1, "allowed-tactic")).toEqual([
      ["you", "Your queen went to d2."],
      ["they", "That let the knight jump to e4 with check, hitting your king and queen at once."],
      ["then", "Your king had to step aside, the knight took your queen, and your king took the knight."],
      ["better", "Rook to e1. After it, e4 is guarded, so the knight cannot land there safely."],
    ]);
  });

  it("keeps pieces as segments a page can draw", () => {
    const they = storyLines(F1)[1]!;
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

  it("tells a hung piece as left there and taken", () => {
    expect(texts(F2, "hung-piece")).toEqual([
      ["you", "Your knight took the pawn on e5. That left your knight on e5 where it could be taken."],
      ["they", "Their knight took your knight."],
      ["better", "Bishop to b5. It keeps the position together."],
    ]);
  });

  it("puts the targets on the key move when it is later in the line", () => {
    const s: ExampleStory = {
      ...F1,
      punish: [
        mv({ san: "Bxc3", from: "b4", to: "c3", piece: "bishop", color: "black", captured: "knight" }),
        mv({ san: "bxc3", from: "b2", to: "c3", piece: "pawn", color: "white", captured: "bishop" }),
        mv({ san: "Ne4", from: "f6", to: "e4", piece: "knight", color: "black" }),
      ],
      key: { line: "punish", index: 2 },
      targets: [
        { square: "c3", piece: "pawn", color: "white" },
        { square: "d2", piece: "queen", color: "white" },
        { square: "f2", piece: "rook", color: "white" },
      ],
    };
    const [, they, then] = storyLines(s);
    expect(they!.text).toBe("That let the bishop take your knight on c3.");
    expect(then!.text).toBe("Your pawn took the bishop, and the knight went to e4, hitting your queen, rook and pawn at once.");
  });

  it("says when they missed it and what the game did instead", () => {
    const s: ExampleStory = {
      ...F1,
      replyFound: false,
      actualReply: mv({ san: "Rb8", from: "a8", to: "b8", piece: "rook", color: "black" }),
    };
    expect(texts(s).slice(1, 3)).toEqual([
      ["they", "That let the knight jump to e4 with check, hitting your king and queen at once."],
      ["then", "They missed it. The game went on with the rook to b8."],
    ]);
    expect(texts({ ...s, actualReply: mv({ san: "Bxa2", from: "e6", to: "a2", piece: "bishop", color: "black", captured: "pawn", check: true }) })[2]).toEqual([
      "then",
      "They missed it. The game went on with the bishop taking your pawn on a2, with check.",
    ]);
    const { actualReply: _, ...none } = s;
    // No reply at all: the game ended on the move.
    expect(texts(none)[2]).toEqual(["then", "The game ended there."]);
    expect(storyCost(s).text).toBe("It could have cost your queen.");
    expect(storyCost(F1).text).toBe("It cost your queen.");
  });

  it("names a discovered attack's rear piece and what it aims at", () => {
    const s: ExampleStory = {
      ...F1,
      punish: [mv({ san: "Nc3+", from: "d5", to: "c3", piece: "knight", color: "black", check: true })],
      targets: [
        { square: "e1", piece: "king", color: "white" },
        { square: "d2", piece: "queen", color: "white" },
      ],
      rear: { square: "d8", piece: "rook", color: "black" },
    };
    expect(storyLines(s)[1]!.text).toBe(
      "That let the knight jump to c3 with check. Moving it opened the line behind it: their rook on d8 was now aimed at your queen.",
    );
    const noAim = { ...s, rear: { square: "a8", piece: "bishop" as const, color: "black" as const } };
    expect(storyLines(noAim)[1]!.text).toBe(
      "That let the knight jump to c3 with check. Moving it opened the line behind it for their bishop on a8.",
    );
  });

  describe("every move kind", () => {
    const W = "white" as const;
    const B = "black" as const;
    const cases: { name: string; move: MoveDetail; you: string; they: string; then: string; better: string }[] = [
      {
        name: "quiet",
        move: mv({ san: "Bc4", from: "f1", to: "c4", piece: "bishop", color: W }),
        you: "Your bishop went to c4.",
        they: "That let the bishop come to c4.",
        then: "Your bishop went to c4.",
        better: "Bishop to c4.",
      },
      {
        name: "knight quiet",
        move: mv({ san: "Nf3", from: "g1", to: "f3", piece: "knight", color: W }),
        you: "Your knight went to f3.",
        they: "That let the knight jump to f3.",
        then: "Your knight went to f3.",
        better: "Knight to f3.",
      },
      {
        name: "capture",
        move: mv({ san: "Bxf7", from: "c4", to: "f7", piece: "bishop", color: W, captured: "pawn" }),
        you: "Your bishop took the pawn on f7.",
        they: "That let the bishop take your pawn on f7.",
        then: "Your bishop took the pawn.",
        better: "Bishop takes the pawn on f7.",
      },
      {
        name: "same-kind capture",
        move: mv({ san: "Nxe5", from: "f3", to: "e5", piece: "knight", color: W, captured: "knight" }),
        you: "Your knight took their knight on e5.",
        they: "That let their knight take your knight on e5.",
        then: "Your knight took their knight.",
        better: "Knight takes their knight on e5.",
      },
      {
        name: "check",
        move: mv({ san: "Qh5+", from: "d1", to: "h5", piece: "queen", color: W, check: true }),
        you: "Your queen went to h5 with check.",
        they: "That let the queen come to h5 with check.",
        then: "Your queen went to h5 with check.",
        better: "Queen to h5, with check.",
      },
      {
        name: "mate",
        move: mv({ san: "Qxf7#", from: "h5", to: "f7", piece: "queen", color: W, captured: "pawn", check: true, mate: true }),
        you: "Your queen took the pawn on f7: checkmate.",
        they: "That let the queen take your pawn on f7: checkmate.",
        then: "Your queen took the pawn: checkmate.",
        better: "Queen takes the pawn on f7, checkmate.",
      },
      {
        name: "castling kingside",
        move: mv({ san: "O-O", from: "e1", to: "g1", piece: "king", color: W, castle: "king" }),
        you: "You castled kingside.",
        they: "That let them castle kingside.",
        then: "You castled kingside.",
        better: "Castle kingside.",
      },
      {
        name: "castling queenside",
        move: mv({ san: "O-O-O", from: "e1", to: "c1", piece: "king", color: W, castle: "queen" }),
        you: "You castled queenside.",
        they: "That let them castle queenside.",
        then: "You castled queenside.",
        better: "Castle queenside.",
      },
      {
        name: "promotion",
        move: mv({ san: "e8=Q", from: "e7", to: "e8", piece: "pawn", color: W, promotion: "queen" }),
        you: "Your pawn reached e8 and became a queen.",
        they: "That let the pawn reach e8 and become a queen.",
        then: "Your pawn went to e8 and became a queen.",
        better: "Pawn to e8, becoming a queen.",
      },
      {
        name: "promotion with capture",
        move: mv({ san: "exd8=N", from: "e7", to: "d8", piece: "pawn", color: W, captured: "rook", promotion: "knight" }),
        you: "Your pawn took the rook on d8 and became a knight.",
        they: "That let the pawn take your rook on d8 and become a knight.",
        then: "Your pawn took the rook and became a knight.",
        better: "Pawn takes the rook on d8, becoming a knight.",
      },
      {
        name: "en passant",
        move: mv({ san: "exd6", from: "e5", to: "d6", piece: "pawn", color: W, captured: "pawn", enPassant: true }),
        you: "Your pawn took their pawn en passant, landing on d6.",
        they: "That let their pawn take your pawn en passant, landing on d6.",
        then: "Your pawn took their pawn en passant.",
        better: "Pawn takes their pawn en passant, landing on d6.",
      },
    ];

    /** The same move as the opponent's: colour swapped, so "your" and "the" trade places. */
    const theirs = (m: MoveDetail): MoveDetail => ({ ...m, color: B });
    const base: ExampleStory = { ...F1, targets: [], key: undefined, rear: undefined, lost: undefined, betterReason: undefined };

    for (const c of cases) {
      it(c.name, () => {
        const asYou = storyLines({ ...base, played: c.move, punish: [], better: [] });
        expect(asYou.map((l) => l.text)).toEqual([c.you]);

        const asThey = storyLines({ ...base, punish: [theirs(c.move)], better: [] });
        expect(asThey[1]!.text).toBe(c.they);

        const quiet = mv({ san: "a6", from: "a7", to: "a6", piece: "pawn", color: B });
        const asThen = storyLines({ ...base, punish: [quiet, c.move], better: [] });
        expect(asThen[2]!.text).toBe(c.then);

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
  });
});

describe("storyCost", () => {
  it("leads with the piece lost, winning chances as the detail", () => {
    const c = storyCost(F1, "allowed-tactic");
    expect(c.text).toBe("It cost your queen.");
    expect(c.segments).toEqual([{ text: "It cost your " }, { piece: "queen", color: "white" }, { text: "." }]);
    expect(c.detail).toBe("Your winning chances went from 94% to 26%.");
  });

  it("says checkmate, a missed win, material, or winning chances", () => {
    const mate = { ...F1, punish: [mv({ san: "Qh2#", from: "h4", to: "h2", piece: "queen", color: "black", check: true, mate: true })] };
    expect(storyCost(mate).text).toBe("It allowed checkmate.");
    expect(storyCost({ ...mate, replyFound: false }).text).toBe("It could have allowed checkmate.");
    expect(storyCost(F3, "missed-tactic").text).toBe("It cost the chance to win their queen.");
    expect(storyCost({ ...F3, betterReason: { kind: "mates", mateIn: 2 } }, "missed-mate").text).toBe("It cost a forced mate.");
    expect(storyCost({ ...F1, lost: undefined, gain: -1 }).text).toBe("It cost a pawn.");
    expect(storyCost({ ...F1, lost: undefined, gain: -3 }).text).toBe("It cost about 3 pawns of material.");
    expect(storyCost({ ...F1, lost: undefined, gain: -3, replyFound: false }).text).toBe("It could have cost about 3 pawns of material.");
    // A positional loss: nothing about material, only the chances.
    const positional = storyCost({ ...F1, lost: undefined, gain: 0 });
    expect(positional.text).toBe("Your winning chances went from 94% to 26%.");
    expect(positional.detail).toBeUndefined();
    expect(storyCost({ ...F3, betterReason: { kind: "wins", piece: "bishop", gave: "bishop", gain: 2 } }, "missed-tactic").text).toBe(
      "It cost the chance to win material worth about 2 pawns.",
    );
  });
});
