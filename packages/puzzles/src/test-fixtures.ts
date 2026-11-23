import type { AnalyzedGame, AnalyzedMove, PatternFinding, Score } from "@blunderstruck/contracts";
import type { EvalResult, Evaluator } from "@blunderstruck/engine";
import { Chess } from "chessops/chess";
import { makeFen, parseFen } from "chessops/fen";
import { makeSan, parseSan } from "chessops/san";
import type { Move } from "chessops/types";
import { makeSquare, squareFile, squareRank } from "chessops/util";
import { positionKey } from "./rules";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Standard UCI, castling as the king's two-square move. */
function uciOf(pos: Chess, move: Move): string {
  if (!("from" in move)) throw new Error("drops are not used here");
  let to = move.to;
  if (pos.board.getRole(move.from) === "king" && Math.abs(squareFile(move.to) - squareFile(move.from)) > 1) {
    to = move.from + (move.to > move.from ? 2 : -2);
  }
  const promo = move.promotion ? { queen: "q", rook: "r", bishop: "b", knight: "n" }[move.promotion as string] : "";
  return `${makeSquare(move.from)}${makeSquare(to)}${promo ?? ""}`;
}

const score: Score = { cp: 0 };

function analyzed(pos: Chess, move: Move, ply: number): AnalyzedMove {
  const fenBefore = makeFen(pos.toSetup());
  const san = makeSan(pos, move);
  const uci = uciOf(pos, move);
  const color = pos.turn;
  pos.play(move);
  return {
    ply,
    color,
    san,
    uci,
    fenBefore,
    fenAfter: makeFen(pos.toSetup()),
    scoreBefore: score,
    scoreAfter: score,
    winPctBefore: 50,
    winPctAfter: 50,
    winPctLoss: 0,
    judgment: "ok",
  };
}

function game(gameId: string, moves: AnalyzedMove[]): AnalyzedGame {
  return { gameId, analysisVersion: 3, engine: { name: "stub", depth: 12 }, moves };
}

/** A game from SAN moves, with real positions and UCI. */
export function gameFromSans(gameId: string, sans: readonly string[]): AnalyzedGame {
  const pos = Chess.default();
  const moves = sans.map((san, i) => {
    const move = parseSan(pos, san);
    if (!move) throw new Error(`illegal move ${san} at ply ${i + 1} in ${gameId}`);
    return analyzed(pos, move, i + 1);
  });
  return game(gameId, moves);
}

function legalMoves(pos: Chess): Move[] {
  const out: Move[] = [];
  for (const [from, dests] of pos.allDests()) for (const to of dests) out.push({ from, to });
  return out.sort((a, b) => ("from" in a && "from" in b ? a.from - b.from || a.to - b.to : 0));
}

/** A made-up game that never promotes or ends early: the move at each ply is picked from `seed`. */
export function seededGame(gameId: string, seed: number, plies: number): AnalyzedGame {
  const pos = Chess.default();
  const moves: AnalyzedMove[] = [];
  for (let k = 0; k < plies; k++) {
    const legal = legalMoves(pos).filter((m) => {
      const after = pos.clone();
      after.play(m);
      const promotes = "from" in m && pos.board.getRole(m.from) === "pawn" && [0, 7].includes(squareRank(m.to));
      return !after.isEnd() && !promotes;
    });
    const move = legal[(seed * 31 + k * 17 + seed * k) % legal.length];
    if (!move) throw new Error(`no move at ply ${k + 1} in ${gameId}`);
    moves.push(analyzed(pos, move, k + 1));
  }
  return game(gameId, moves);
}

export function finding(gameId: string, ply: number, patternId: string, winPctLoss = 20): PatternFinding {
  return { patternId, gameId, ply, winPctLoss };
}

const line = (move: string, s: Score, rest: string[] = []): EvalResult => ({
  score: s,
  depth: 18,
  bestMove: move,
  pv: [move, ...rest],
});

/** Lines for the four checked positions, as Stockfish gave them at depth 18 (scores rounded). */
export const KNOWN_LINES: Record<string, EvalResult[]> = {
  // Punish: Qxf7 is mate; the next line is far behind.
  [positionKey("r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4")]: [
    line("h5f7", { mate: 1 }),
    line("h5e2", { cp: -254 }),
    line("h5f3", { cp: -270 }),
    line("h5d1", { cp: -290 }),
    line("h5h4", { cp: -330 }),
  ],
  // Punish: Nxe5 wins (+236, 70.5%) against +112 (60.2%).
  [positionKey("rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5")]: [
    line("f3e5", { cp: 236 }, ["d6e5", "d1g4"]),
    line("h2h3", { cp: 112 }),
    line("d2d4", { cp: 95 }),
    line("e1g1", { cp: 80 }),
    line("d2d3", { cp: 70 }),
  ],
  // Do-over for Black: four moves stop the mate; Nh6 is 7.6% worse than the best.
  [positionKey("r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 3")]: [
    line("g8f6", { cp: 30 }),
    line("d8f6", { cp: 20 }),
    line("f7f5", { cp: -10 }),
    line("d8e7", { cp: -20 }),
    line("g8h6", { cp: -53 }),
  ],
  // The start position: every line within 1%, so the set is open.
  [positionKey(START_FEN)]: [
    line("e2e4", { cp: 30 }),
    line("d2d4", { cp: 28 }),
    line("g1f3", { cp: 26 }),
    line("c2c4", { cp: 25 }),
    line("e2e3", { cp: 22 }),
  ],
};

/** Any other position: the first legal move wins clearly (+300), the rest lose a little. */
function defaultLines(fen: string, lines: number): EvalResult[] {
  const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
  return legalMoves(pos)
    .slice(0, lines)
    .map((m, i) => line(uciOf(pos, m), { cp: i === 0 ? 300 : -200 - i }));
}

export interface StubEvaluator extends Evaluator {
  calls: string[];
  maxInFlight: number;
}

/** An evaluator that answers from `KNOWN_LINES` (or `defaultLines`) after a short wait. */
export function stubEvaluator(name = "stub-fish"): StubEvaluator {
  let inFlight = 0;
  const stub: StubEvaluator = {
    name,
    calls: [],
    maxInFlight: 0,
    async evaluate() {
      throw new Error("not used");
    },
    async evaluateMulti(fen, _depth, lines) {
      stub.calls.push(fen);
      inFlight++;
      stub.maxInFlight = Math.max(stub.maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1 + (fen.length % 3)));
      inFlight--;
      return (KNOWN_LINES[positionKey(fen)] ?? defaultLines(fen, lines)).slice(0, lines);
    },
  };
  return stub;
}
