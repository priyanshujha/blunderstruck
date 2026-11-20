import { describe, expect, it } from "vitest";
import {
  classifyMotif,
  exchangeGain,
  lineOutcome,
  lineToSan,
  MATE_VALUE,
  moveLabel,
  moveMaterial,
  parseSquare,
  positionFromFen,
  positionKey,
  see,
  tacticSwing,
  uciToSan,
} from "./board";

const sq = (s: string) => parseSquare(s)!;
const boardOf = (fen: string) => positionFromFen(fen).board;

// Four Knights after 4.Ba6??: the bishop on a6 is attacked by the b7 pawn.
const AFTER_BA6 = "r1bqkb1r/pppp1ppp/B1n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQK2R b KQkq - 5 4";
const FOUR_KNIGHTS = "r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 4 4";
const FORK_MISSED = "3q3k/6pp/8/4N3/8/8/6PP/6K1 w - - 0 1";
const FORK_ALLOWED = "3q2k1/6pp/8/4N3/8/8/6PP/6K1 b - - 0 1";
const QB5_BLOCK = "rn1qkb1r/ppp1pppp/5n2/5bN1/4p3/8/PPPPQPPP/RNB1KB1R w KQkq - 4 5";
const MATE_IN_1 = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";

describe("see", () => {
  it("counts an undefended piece in full and a defended one by the exchange", () => {
    expect(see(boardOf(AFTER_BA6), sq("a6"), "black")).toBe(3);
    // Knight takes a pawn defended by a pawn: loses, so 0.
    expect(see(boardOf("4k3/8/2p5/3p4/8/4N3/8/4K3 w - - 0 1"), sq("d5"), "white")).toBe(0);
    // Pawn takes a knight defended by a pawn: +3 -1.
    expect(see(boardOf("4k3/8/2p5/3n4/4P3/8/8/4K3 w - - 0 1"), sq("d5"), "white")).toBe(2);
  });

  it("sees x-rays and never lets the king capture into a defended square", () => {
    // Doubled rooks against one defender: R takes defended rook, R recaptures... wins a rook net 5-5+5.
    expect(see(boardOf("3rk3/8/8/3r4/8/8/3R4/3RK3 w - - 0 1"), sq("d5"), "white")).toBe(5);
    // Only the king attacks a defended pawn: no capture.
    expect(see(boardOf("4k3/8/8/2p5/3p4/4K3/8/8 w - - 0 1"), sq("d4"), "white")).toBe(0);
    // An undefended pawn next to the king can be taken.
    expect(see(boardOf("4k3/8/8/8/3p4/4K3/8/8 w - - 0 1"), sq("d4"), "white")).toBe(1);
  });

  it("is 0 on an empty or own square", () => {
    expect(see(boardOf(FOUR_KNIGHTS), sq("d4"), "white")).toBe(0);
    expect(see(boardOf(FOUR_KNIGHTS), sq("e4"), "white")).toBe(0);
  });
});

describe("moveMaterial and exchangeGain", () => {
  it("counts captures, en passant and promotion", () => {
    expect(moveMaterial(AFTER_BA6, "b7a6")).toBe(3);
    expect(moveMaterial(FOUR_KNIGHTS, "f1a6")).toBe(0);
    expect(moveMaterial("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1", "e5d6")).toBe(1);
    expect(moveMaterial("1n2k3/P7/8/8/8/8/8/4K3 w - - 0 1", "a7b8q")).toBe(3 + 8);
    expect(moveMaterial(FOUR_KNIGHTS, "e1e8")).toBe(0); // illegal
  });

  it("nets out the exchange on the destination", () => {
    expect(exchangeGain(AFTER_BA6, "b7a6")).toBe(3);
    expect(exchangeGain(FOUR_KNIGHTS, "f1a6")).toBe(-3);
    // 4.Bb5 is not attacked; 4...Nxe4 is met by Nxe4.
    expect(exchangeGain(FOUR_KNIGHTS, "f1b5")).toBe(0);
    expect(exchangeGain("r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/2N2N2/PPPP1PPP/R1BQK2R b KQkq - 5 4", "f6e4")).toBe(-2);
  });
});

describe("lineOutcome", () => {
  it("finds a mate for whoever delivers it", () => {
    expect(lineOutcome(MATE_IN_1, ["h5f7"], "white")).toEqual({ mate: "for", gain: MATE_VALUE, plies: 1 });
    expect(lineOutcome(MATE_IN_1, ["h5f7"], "black")).toEqual({ mate: "against", gain: -MATE_VALUE, plies: 1 });
  });

  it("Qb5+ ...Bd7 wins no material", () => {
    const o = lineOutcome(QB5_BLOCK, ["e2b5", "f5d7", "b5c4", "e7e6"], "white");
    expect(o).toEqual({ gain: 0, plies: 4 });
    expect(classifyMotif(QB5_BLOCK, ["e2b5", "f5d7", "b5c4", "e7e6"])).toBeUndefined();
  });

  it("a short line is settled by the best exchange of the side to move", () => {
    expect(lineOutcome(FORK_MISSED, ["e5f7", "h8g8", "f7d8"], "white")).toEqual({ gain: 9, plies: 3 });
    expect(lineOutcome(AFTER_BA6, [], "white")).toEqual({ gain: -3, plies: 0 });
    expect(lineOutcome(FORK_ALLOWED, ["g8h8", "e5f7", "h8g8", "f7d8"], "black").gain).toBe(-9);
  });

  it("keeps counting past ply 4 through a check and a pending capture", () => {
    // 4...Rd1+ is check, so ply 4 is not quiet; 5.Rxd1 settles it a rook up.
    const fen = "3r3k/6pp/8/8/8/8/6PP/R5K1 w - - 0 1";
    expect(lineOutcome(fen, ["h2h3", "h7h6", "g2g3", "d8d1", "a1d1", "h8h7"], "white")).toEqual({ gain: 5, plies: 5 });
    // Next move after ply 4 is a capture (Nxd8), so it is not quiet either.
    expect(lineOutcome(FORK_MISSED, ["g2g3", "g7g6", "e5f7", "h8g8", "f7d8", "g8f8"], "white")).toEqual({
      gain: 9,
      plies: 5,
    });
  });

  it("finds a mate that comes after a quiet point", () => {
    // Nh6+ (double check) Kh8 Qg8+ Rxg8 Nf7#: ply 4 is quiet, the smothered mate is on ply 5.
    const fen = "5rk1/5Npp/8/8/2Q5/8/6PP/6K1 w - - 0 1";
    const line = ["f7h6", "g8h8", "c4g8", "f8g8", "h6f7"];
    expect(lineOutcome(fen, line, "white")).toEqual({ mate: "for", gain: MATE_VALUE, plies: 5 });
    // The same line scored for the side being mated, as a played line is.
    expect(lineOutcome(fen, line, "black")).toEqual({ mate: "against", gain: -MATE_VALUE, plies: 5 });
    expect(classifyMotif(fen, line)).toBe("mate");
    // Cut before the mate, it is just the queen given up at the quiet point.
    expect(lineOutcome(fen, line.slice(0, 4), "white")).toEqual({ gain: -9, plies: 4 });
    // The Qb5+ ...Bd7 block still settles at its quiet point with no gain.
    expect(lineOutcome(QB5_BLOCK, ["e2b5", "f5d7", "b5c4", "e7e6"], "white")).toEqual({ gain: 0, plies: 4 });
  });

  it("stops at the first illegal move", () => {
    expect(lineOutcome(FOUR_KNIGHTS, ["e1e8", "a7a6"], "white")).toEqual({ gain: 0, plies: 0 });
  });
});

describe("tacticSwing", () => {
  it("needs a mate the played line lacks, or a material swing of 2", () => {
    expect(tacticSwing({ mate: "for", gain: MATE_VALUE, plies: 3 }, { gain: 0, plies: 4 })).toBe(true);
    expect(tacticSwing({ mate: "for", gain: MATE_VALUE, plies: 3 }, { mate: "for", gain: MATE_VALUE, plies: 5 })).toBe(false);
    expect(tacticSwing({ gain: 3, plies: 4 }, { gain: 1, plies: 4 })).toBe(true);
    expect(tacticSwing({ gain: 2, plies: 4 }, { gain: 1, plies: 4 })).toBe(false);
  });
});

describe("classifyMotif", () => {
  it("names a knight fork, from both sides", () => {
    expect(classifyMotif(FORK_MISSED, ["e5f7", "h8g8", "f7d8"])).toBe("fork");
    const afterKh8 = "3q3k/6pp/8/4N3/8/8/6PP/6K1 w - - 1 2";
    expect(classifyMotif(afterKh8, ["e5f7", "h8g8", "f7d8"])).toBe("fork");
  });

  it("does not call it a fork when the forking piece takes nothing", () => {
    expect(classifyMotif(FORK_MISSED, ["e5f7", "h8g8", "f7h6"])).toBeUndefined();
  });

  it("names mate and discovered check", () => {
    expect(classifyMotif(MATE_IN_1, ["h5f7"])).toBe("mate");
    expect(classifyMotif("3k4/8/8/8/3N4/8/8/3R3K w - - 0 1", ["d4f5"])).toBe("discovered-attack");
  });

  it("names a discovered attack when the slider then takes the piece", () => {
    // Nd4-b3 uncovers Rd1 on the queen; ...Ke7 lets Rxd8 follow.
    const fen = "3q4/5k2/8/8/3N4/8/8/3R3K w - - 0 1";
    expect(classifyMotif(fen, ["d4b3", "f7e7", "d1d8"])).toBe("discovered-attack");
    expect(classifyMotif(fen, ["d4b3", "f7e7", "h1g1"])).toBeUndefined();
  });
});

describe("text helpers", () => {
  it("writes SAN, lines, labels and position keys", () => {
    expect(uciToSan(FOUR_KNIGHTS, "f1a6")).toBe("Ba6");
    expect(uciToSan(FOUR_KNIGHTS, "e1e8")).toBe("e1e8");
    expect(uciToSan("r3k3/8/8/8/8/8/8/4K2R w Kq - 0 1", "e1g1")).toBe("O-O");
    expect(lineToSan(FORK_MISSED, ["e5f7", "h8g8", "f7d8", "zz"])).toEqual(["Nf7+", "Kg8", "Nxd8"]);
    expect(moveLabel({ ply: 7, color: "white", san: "Ba6" })).toBe("4.Ba6");
    expect(moveLabel({ ply: 8, color: "black", san: "d6" })).toBe("4...d6");
    expect(positionKey(FOUR_KNIGHTS)).toBe("r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq -");
  });
});
