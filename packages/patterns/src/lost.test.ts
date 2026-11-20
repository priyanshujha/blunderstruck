import { describe, expect, it } from "vitest";
import { lostPiece } from "./lost";

/* Lines checked with Stockfish 19 at depth 18 (the scored part of each engine line). */

describe("lostPiece", () => {
  it("names the queen in Qd2? Ne4+ Ke1 Nxd2 Kxd2 (queen for a knight)", () => {
    const fen = "r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2Q3R w - - 0 1";
    expect(lostPiece(fen, ["d1d2", "f6e4", "f2e1", "e4d2", "e1d2"], "white")).toEqual({
      square: "d2",
      piece: "queen",
      color: "white",
    });
  });

  it("names a piece given for a pawn: 3.Nxe5? Nxe5", () => {
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
    expect(lostPiece(fen, ["f3e5", "c6e5"], "white")).toEqual({ square: "e5", piece: "knight", color: "white" });
  });

  it("names nothing for a knight traded for a knight and a pawn: Nd5? Nxd5 exd5 Qxd5", () => {
    const fen = "r2q1rk1/ppp2ppp/5n2/8/4P3/2N5/PPP1QPPP/R4RK1 w - - 0 1";
    expect(lostPiece(fen, ["c3d5", "f6d5", "e4d5", "d8d5"], "white")).toBeUndefined();
  });

  it("names nothing in Legal's trap from Black's side (bishop for a pawn and a knight)", () => {
    const fen = "rn1qkbnr/ppp2ppp/3p4/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R b KQkq - 3 4";
    expect(lostPiece(fen, ["g7g6", "f3e5", "d6e5", "d1g4"], "black")).toBeUndefined();
  });

  it("names nothing when only pawns are lost, and stops at an illegal move", () => {
    const fen = "4r1k1/5ppp/8/8/4p3/8/2QP1PPP/4K3 w - - 0 1";
    // d4? exd3+ wins a pawn; the line breaks before ...dxc2.
    expect(lostPiece(fen, ["d2d4", "e4d3", "e1d2", "a1a8", "d3c2"], "white")).toBeUndefined();
    expect(lostPiece(fen, ["d2d4", "e4d3", "e1d2", "d3c2", "d2c2"], "white")).toEqual({
      square: "c2",
      piece: "queen",
      color: "white",
    });
  });
});
