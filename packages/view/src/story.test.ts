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
  // The game played the whole line.
  replyFound: true,
  followed: 4,
  lostInGame: true,
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
  lostInGame: true,
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
  /** F1 where the game left the engine's line after `followed` plies. */
  const f1 = (followed: number, over: Partial<ExampleStory> = {}): ExampleStory => ({
    ...F1,
    followed,
    replyFound: followed >= 1,
    lostInGame: followed >= 3,
    ...over,
  });

  it("tells F1 in the past when the game played the whole line", () => {
    expect(texts(F1, "allowed-tactic")).toEqual([
      ["you", "Your queen went to d2."],
      ["they", "They found it: the knight jumped to e4 with check, hitting your king and queen at once."],
      ["then", "Your king had to step aside, the knight took your queen, and your king took the knight."],
      ["better", "Rook to e1. After it, e4 is guarded, so the knight cannot land there safely."],
    ]);
    expect(storyCost(F1).text).toBe("It cost your queen.");
  });

  it("tells what was played in the past and the rest of the line as what would follow", () => {
    expect(texts(f1(2)).slice(1, 3)).toEqual([
      ["they", "They found it: the knight jumped to e4 with check, hitting your king and queen at once."],
      ["then", "Your king had to step aside. From there the knight would take your queen, and your king would take the knight."],
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
    const { followed: _f, lostInGame: _l, ...old } = F1;
    expect(texts(old)[2]).toEqual([
      "then",
      "From there your king would have to step aside, the knight would take your queen, and your king would take the knight.",
    ]);
    expect(storyCost(old).text).toBe("It could have cost your queen.");
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
    const missed = { ...F2, followed: 0, replyFound: false, lostInGame: false, actualReply: a3 };
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
    const noAim = { ...s, followed: 0, rear: { square: "a8", piece: "bishop" as const, color: "black" as const } };
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
        const asFound = storyLines({ ...base, punish: [theirs(c.move)], better: [], followed: 1, replyFound: true });
        expect(asFound[1]!.text).toBe(c.found);

        // Later in the line: played, then only what would follow (said only when it is material).
        const quiet = mv({ san: "a6", from: "a7", to: "a6", piece: "pawn", color: B });
        const asThen = storyLines({ ...base, punish: [quiet, c.move], better: [], followed: 2, replyFound: true });
        expect(asThen[2]!.text).toBe(c.then);
        const asWould = storyLines({ ...base, punish: [quiet, c.move], better: [], followed: 1, replyFound: true });
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
  });
});

describe("storyCost", () => {
  it("leads with the piece lost in the game, winning chances as the detail", () => {
    const c = storyCost(F1, "allowed-tactic");
    expect(c.text).toBe("It cost your queen.");
    expect(c.segments).toEqual([{ text: "It cost your " }, { piece: "queen", color: "white" }, { text: "." }]);
    expect(c.detail).toBe("Your winning chances went from 94% to 26%.");
  });

  it("says what the piece went for, and the exchange, as played or as possible", () => {
    expect(storyCost({ ...F1, lostFor: "rook" }).text).toBe("It cost your queen for a rook.");
    // The queen was taken in the game but the line stopped before anything came back: no trade claimed.
    expect(storyCost({ ...F1, lostFor: "rook", followed: 3 }).text).toBe("It cost your queen.");
    expect(storyCost({ ...F1, lostFor: "rook", lostInGame: false }).text).toBe("It could have cost your queen for a rook.");
    const rook = { ...F1, lost: { square: "d4", piece: "rook" as const, color: "white" as const } };
    expect(storyCost({ ...rook, lostFor: "bishop" }).text).toBe("It cost the exchange (a rook for a bishop).");
    expect(storyCost({ ...rook, lostFor: "knight", lostInGame: false }).text).toBe("It could have cost the exchange (a rook for a knight).");
  });

  it("says checkmate, a missed win, material, or winning chances", () => {
    const mateIn1 = [mv({ san: "Qh2#", from: "h4", to: "h2", piece: "queen", color: "black", check: true, mate: true })];
    expect(storyCost({ ...F1, punish: mateIn1, followed: 1 }).text).toBe("It allowed checkmate.");
    expect(storyCost({ ...F1, punish: mateIn1, followed: 0, replyFound: false }).text).toBe("It could have allowed checkmate.");
    expect(storyCost(F3, "missed-tactic").text).toBe("It cost the chance to win their queen for your knight.");
    // Nothing beyond what the move played won: no material claim.
    expect(storyCost({ ...F3, gain: 6 }, "missed-tactic").text).toBe("Your winning chances went from 76% to 8%.");
    expect(storyCost({ ...F3, betterReason: { kind: "mates", mateIn: 2 } }, "missed-mate").text).toBe("It cost a forced mate.");
    expect(storyCost({ ...F1, lost: undefined, gain: -1 }).text).toBe("It cost a pawn.");
    expect(storyCost({ ...F1, lost: undefined, gain: -3 }).text).toBe("It cost about 3 pawns of material.");
    // Pawn counts are facts only when the whole line was played.
    expect(storyCost({ ...F1, lost: undefined, gain: -3, followed: 2 }).text).toBe("It could have cost about 3 pawns of material.");
    // A positional loss: nothing about material, only the chances.
    const positional = storyCost({ ...F1, lost: undefined, gain: 0 });
    expect(positional.text).toBe("Your winning chances went from 94% to 26%.");
    expect(positional.detail).toBeUndefined();
    expect(storyCost({ ...F3, betterGain: 2, betterReason: { kind: "wins", piece: "bishop", gave: "bishop", gain: 2 } }, "missed-tactic").text).toBe(
      "It cost the chance to win material worth about 2 pawns.",
    );
  });
});
