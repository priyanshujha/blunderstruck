import { describe, expect, it } from "vitest";
import { lineLoss, lostPiece } from "./lost";

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

  describe("trades are set aside", () => {
    const NE4 = "3q1rk1/ppp2ppp/5n2/8/8/2N5/PPP2PPP/3Q1RK1 w - - 0 1";
    const KNIGHT = { square: "e4", piece: "knight", color: "white" };

    it("1.Ne4? Nxe4 Qxd8 Rxd8 (the engine's line): the queens are traded, the knight is lost", () => {
      expect(lineLoss(NE4, ["c3e4", "f6e4", "d1d8", "f8d8"], "white")).toEqual({ net: 3, piece: KNIGHT, exchange: false });
    });

    it("the same knight when the queens or rooks are traded first", () => {
      expect(lostPiece(NE4, ["c3e4", "d8d1", "f1d1", "f6e4"], "white")).toEqual(KNIGHT);
      const rooks = "3r2k1/ppp2ppp/5n2/8/8/2N5/PPP2PPP/3R1RK1 w - - 0 1";
      expect(lostPiece(rooks, ["c3e4", "d8d1", "f1d1", "f6e4"], "white")).toEqual(KNIGHT);
    });
  });

  // Constructed lines, for the counting rule only.
  describe("value against net loss", () => {
    it("a queen for a rook and a knight names no piece", () => {
      const fen = "3r2k1/5ppp/8/8/3n4/5N2/5PPP/3Q2K1 w - - 0 1";
      expect(lineLoss(fen, ["d1d4", "d8d4", "f3d4"], "white")).toEqual({ net: 1, exchange: false });
    });

    it("the exchange (a rook for a knight) names the rook for the knight and sets the flag", () => {
      const fen = "2r3k1/5ppp/8/8/8/2N5/1P3PPP/6K1 b - - 0 1";
      expect(lineLoss(fen, ["c8c3", "b2c3"], "black")).toEqual({
        net: 2,
        piece: { square: "c3", piece: "rook", color: "black" },
        for: "knight",
        exchange: true,
      });
    });
  });

  describe("pairs and recaptures", () => {
    it("queen for a knight names the knight it went for", () => {
      const fen = "r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2Q3R w - - 0 1";
      expect(lineLoss(fen, ["d1d2", "f6e4", "f2e1", "e4d2", "e1d2"], "white")).toMatchObject({ net: 6, for: "knight", exchange: false });
    });

    it("cancels the bishop against the recapture on its own square, so the knight is lost", () => {
      // Constructed line (the engine prefers Nd1 here): ...bxc3, ...Nxf3, gxf3.
      const fen = "4k3/8/8/8/1p5n/2N2B2/6P1/4K3 w - - 0 1";
      expect(lineLoss(fen, ["e1e2", "b4c3", "e2d3", "h4f3", "g2f3"], "white")).toEqual({
        net: 3,
        piece: { square: "c3", piece: "knight", color: "white" },
        exchange: false,
      });
    });

    it("Rd4? Nxd4 exd4 gxf3: the rook for a knight (and a pawn)", () => {
      const fen = "6k1/8/2n5/8/6p1/4PP2/8/3R2K1 w - - 0 1";
      expect(lineLoss(fen, ["d1d4", "c6d4", "e3d4", "g4f3"], "white")).toEqual({
        net: 3,
        piece: { square: "d4", piece: "rook", color: "white" },
        for: "knight",
        exchange: true,
      });
    });

    it("...d5? exd6 e.p. Qxe1+ Qxe1: the queen for a rook (and a pawn)", () => {
      const fen = "6k1/pprpqppp/8/4P3/8/8/PP3PPP/3QR1K1 b - - 0 1";
      expect(lineLoss(fen, ["d7d5", "e5d6", "e7e1", "d1e1"], "black")).toEqual({
        net: 5,
        piece: { square: "e1", piece: "queen", color: "black" },
        for: "rook",
        exchange: false,
      });
    });
  });

  describe("messier cases name no piece", () => {
    it("a queen and a knight for a rook: net 7, no piece", () => {
      // Constructed line (the engine plays Nxd5 here).
      const fen = "4k3/8/4p3/3r4/1p6/2N5/8/3QK3 w - - 0 1";
      expect(lineLoss(fen, ["e1f1", "b4c3", "d1d5", "e6d5"], "white")).toEqual({ net: 7, exchange: false });
    });
  });

  it("a rook for a bishop with a pawn won back is a pawn count, not the exchange", () => {
    // Constructed line: ...Rxc3 bxc3 Bxa3.
    const fen = "2r2bk1/5ppp/8/8/8/P1B5/1P3PPP/6K1 b - - 0 1";
    expect(lineLoss(fen, ["c8c3", "b2c3", "f8a3"], "black")).toEqual({ net: 1, exchange: false });
  });
});
