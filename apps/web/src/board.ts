import {
  type Color,
  type ExampleStory,
  type MoveDetail,
  type PieceRole,
  type StoryPiece,
  blindSpotFamilyOf,
} from "@blunderstruck/contracts";
import { type StoryLine, type StoryMove, type StoryTag, keyMove, storyLines } from "@blunderstruck/view";
import { esc } from "./html";
import { PIECE_LETTER, colorClass, symbolId } from "./pieces";

/*
 * Boards are 80-unit SVGs, squares of 10, seen from the player's side. The resting picture is in
 * the markup, so a page without scripts is complete. Every later picture is in the markup too,
 * as hidden overlay groups (arrows, tints, rings), and the script only moves pieces and shows or
 * hides those groups; it computes no geometry.
 */

const SQUARE = /^[a-h][1-8]$/;
const ROLE_OF: Readonly<Record<string, PieceRole>> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

export interface BoardPiece {
  square: string;
  role: PieceRole;
  color: Color;
}

/** The pieces of a FEN's board field, or undefined when it is not a well-formed board. */
export function piecesOf(fen: string): BoardPiece[] | undefined {
  const rows = fen.trim().split(/\s+/, 1)[0]?.split("/") ?? [];
  if (rows.length !== 8) return undefined;
  const out: BoardPiece[] = [];
  for (let i = 0; i < 8; i++) {
    let file = 0;
    for (const ch of rows[i]!) {
      if (/[1-8]/.test(ch)) {
        file += Number(ch);
        continue;
      }
      const role = ROLE_OF[ch.toLowerCase()];
      if (!role || file > 7) return undefined;
      out.push({ square: `${"abcdefgh"[file]}${8 - i}`, role, color: ch === ch.toLowerCase() ? "black" : "white" });
      file++;
    }
    if (file !== 8) return undefined;
  }
  return out;
}

/** Top-left corner of a square in board units, from White's side or flipped for Black. */
export function xy(square: string, flip: boolean): [number, number] {
  const f = square.charCodeAt(0) - 97;
  const r = Number(square.charAt(1));
  return flip ? [(7 - f) * 10, (r - 1) * 10] : [f * 10, (8 - r) * 10];
}

/** Arrow kinds: the move played, the other side's move, a move the game did not play, the better move. */
export type ArrowKind = "bad" | "them" | "ghost" | "good";

const n2 = (x: number): string => {
  const s = x.toFixed(2).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
};
const P = (x: number, y: number): string => `${n2(x)} ${n2(y)}`;

/** An arrow between two points as path data, with the light line down a better move's middle. */
export function arrowShape(x1: number, y1: number, x2: number, y2: number, kind: ArrowKind): { cls: string; d: string }[] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const sw = kind === "good" ? 1 : 0.8;
  const hw = 2.2;
  const hl = 3.4;
  const bx = x2 - ux * hl;
  const by = y2 - uy * hl;
  const head = `M${P(bx + px * hw, by + py * hw)}L${P(x2, y2)}L${P(bx - px * hw, by - py * hw)}Z`;
  const box = (a: number, b: number): string =>
    `M${P(x1 + ux * a + px * sw, y1 + uy * a + py * sw)}L${P(x1 + ux * b + px * sw, y1 + uy * b + py * sw)}` +
    `L${P(x1 + ux * b - px * sw, y1 + uy * b - py * sw)}L${P(x1 + ux * a - px * sw, y1 + uy * a - py * sw)}Z`;
  const shaft = len - hl;
  let d: string;
  if (kind === "ghost") {
    d = head;
    for (let a = 0; a < shaft - 0.4; a += 2.9) d += box(a, Math.min(a + 1.8, shaft));
  } else {
    d =
      `M${P(x1 + px * sw, y1 + py * sw)}L${P(bx + px * sw, by + py * sw)}L${P(bx + px * hw, by + py * hw)}L${P(x2, y2)}` +
      `L${P(bx - px * hw, by - py * hw)}L${P(bx - px * sw, by - py * sw)}L${P(x1 - px * sw, y1 - py * sw)}Z`;
    if (kind === "bad") d += `M${P(x1 - 1.5, y1)}a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0z`;
  }
  const out = [{ cls: `ar ${kind}`, d }];
  if (kind === "good" && shaft > 1.2) out.push({ cls: "arc", d: `M${P(x1 + ux * 0.7, y1 + uy * 0.7)}L${P(bx - ux * 0.1, by - uy * 0.1)}` });
  return out;
}

/** An arrow from square to square: 2.6 units out of the first centre, 1.2 short of the last. */
export function arrowPaths(from: string, to: string, flip: boolean, kind: ArrowKind): string {
  const [ax, ay] = xy(from, flip);
  const [bx, by] = xy(to, flip);
  const x1 = ax + 5;
  const y1 = ay + 5;
  const x2 = bx + 5;
  const y2 = by + 5;
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len === 0) return "";
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  return arrowShape(x1 + ux * 2.6, y1 + uy * 2.6, x2 - ux * 1.2, y2 - uy * 1.2, kind)
    .map((p) => `<path class="${p.cls}" d="${p.d}"/>`)
    .join("");
}

/** One move on a board in the order the story tells it. */
export interface BoardStep {
  /** Absent for the pause that stands for "The game ended there." */
  move?: MoveDetail;
  /** A move of the engine's line the game did not play: drawn lighter. */
  ghost: boolean;
  /** The note under the board while this ghost is shown. */
  note?: "allowed" | "follow";
  /** The story line that tells this move. */
  line: StoryTag;
  /** Its index in `story.punish`, when it is that line's move. */
  punishIndex?: number;
}

export interface BoardPlan {
  player: Color;
  flip: boolean;
  missed: boolean;
  /** Steps 1 to 4: the move played, the reply, what the game played, what could follow. */
  played: BoardStep[];
  better: BoardStep[];
}

/** The move a story line names, from where the story stores it. */
function moveAt(story: ExampleStory, m: StoryMove): MoveDetail | undefined {
  switch (m.source) {
    case "played":
      return story.played;
    case "inGame":
      return story.inGame?.moves[m.index];
    case "actualReply":
      return story.actualReply;
    case "punish":
      return story.punish[m.index];
    case "better":
      return story.better[m.index];
  }
}

/**
 * Which moves a board plays, in the order the view's story lines tell them, and which of them
 * the game really played (`StoryMove.played`). Only the game's own moves are solid; a move of the
 * engine's line the game did not play is a ghost. A line that tells no move ("The game ended
 * there.") still gets a picture of its own.
 */
export function planOf(story: ExampleStory, patternId: string | undefined, lines: readonly StoryLine[] = storyLines(story, patternId)): BoardPlan {
  const player = story.played.color;
  const missed = patternId !== undefined && blindSpotFamilyOf(patternId) === "missed";
  const played: BoardStep[] = [];
  const better: BoardStep[] = [];
  for (const l of lines) {
    const into = l.tag === "better" ? better : played;
    if (l.moves.length === 0) {
      if (l.tag === "then") into.push({ ghost: false, line: "then" });
      continue;
    }
    for (const sm of l.moves) {
      const move = moveAt(story, sm);
      if (!move) continue;
      const ghost = l.tag !== "better" && !sm.played;
      // The engine's index of a game move that is also the engine's, for the key move's marks.
      const pi =
        sm.source === "punish"
          ? sm.index
          : sm.source === "inGame" && story.punish[sm.index]?.uci === move.uci && story.inGame!.moves.slice(0, sm.index).every((x, j) => x.uci === story.punish[j]?.uci)
            ? sm.index
            : undefined;
      into.push({ move, ghost, ...(ghost ? { note: l.tag === "they" ? ("allowed" as const) : ("follow" as const) } : {}), line: l.tag, ...(pi !== undefined ? { punishIndex: pi } : {}) });
    }
  }
  if (!played[0]?.move) played.unshift({ move: story.played, ghost: false, line: "you" });
  return { player, flip: player === "black", missed, played, better };
}

/** The view and last step (1-based) a story line covers, and the notation written after it. */
export interface LineCover {
  view: "p" | "b";
  n: number;
  san: string[];
}

export function coverOf(plan: BoardPlan, tag: StoryTag): LineCover | undefined {
  const view = tag === "better" ? "b" : "p";
  const steps = view === "b" ? plan.better : plan.played;
  let n = 0;
  steps.forEach((s, i) => {
    if (s.line === tag) n = i + 1;
  });
  if (n === 0) return undefined;
  const own = steps.filter((s) => s.line === tag && s.move);
  // The better line names its first move only.
  const san = (tag === "better" ? own.slice(0, 1) : own).map((s) => s.move!.san);
  return { view, n, san };
}

/** Square of the piece a move takes: its destination, or beside it for en passant. */
const takenOn = (m: MoveDetail): string | undefined =>
  m.enPassant ? `${m.to.charAt(0)}${m.from.charAt(1)}` : m.captured ? m.to : undefined;

/** The rook's squares when the move castles. */
function rookOf(m: MoveDetail): [string, string] | undefined {
  if (!m.castle) return undefined;
  const rank = m.from.charAt(1);
  return m.castle === "king" ? [`h${rank}`, `f${rank}`] : [`a${rank}`, `d${rank}`];
}

/** One step as the script reads it: from, to and what else happens. */
type ScriptStep = [string, string, Record<string, unknown>?];

function scriptStep(s: BoardStep): ScriptStep {
  if (!s.move) return ["", "", { o: 1 }];
  const m = s.move;
  const o: Record<string, unknown> = {};
  const x = takenOn(m);
  if (x && x !== m.to) o.x = x;
  const r = rookOf(m);
  if (r) o.r = r;
  if (m.promotion) o.q = PIECE_LETTER[m.promotion];
  if (s.ghost) {
    o.g = 1;
    o.w = s.note === "allowed" ? "a" : "f";
  }
  return Object.keys(o).length > 0 ? [m.from, m.to, o] : [m.from, m.to];
}

const validMove = (m: MoveDetail | undefined): boolean => !m || (SQUARE.test(m.from) && SQUARE.test(m.to));

function ring(square: string, flip: boolean, cls: string): string {
  const [x, y] = xy(square, flip);
  return `<circle class="ring halo" cx="${x + 5}" cy="${y + 5}" r="4.4"/><circle class="${cls}" cx="${x + 5}" cy="${y + 5}" r="4.4"/>`;
}

function ray(from: string, to: string, flip: boolean, good: boolean): string {
  const [ax, ay] = xy(from, flip);
  const [bx, by] = xy(to, flip);
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len === 0) return "";
  const c = `x1="${n2(ax + 5 + (dx / len) * 3.6)}" y1="${n2(ay + 5 + (dy / len) * 3.6)}" x2="${n2(bx + 5 - (dx / len) * 4.4)}" y2="${n2(by + 5 - (dy / len) * 4.4)}"`;
  return `<line class="ray halo" ${c}/><line class="ray${good ? " good" : ""}" ${c}/>`;
}

function tint(square: string, flip: boolean, kind: "bad" | "good"): string {
  const [x, y] = xy(square, flip);
  return `<rect class="hl ${kind}" x="${x}" y="${y}" width="10" height="10"/>`;
}

/** On one rook or bishop line (the line is the engine's, so nothing in between is checked). */
function aligned(from: string, to: string, piece: PieceRole): boolean {
  const df = to.charCodeAt(0) - from.charCodeAt(0);
  const dr = to.charCodeAt(1) - from.charCodeAt(1);
  const straight = (df === 0) !== (dr === 0);
  const diagonal = df !== 0 && Math.abs(df) === Math.abs(dr);
  return piece === "rook" ? straight : piece === "bishop" ? diagonal : piece === "queen" ? straight || diagonal : false;
}

/** Rings on what the key move hits, and dashed lines from the attacker (or the piece behind it). */
function keyMarks(story: ExampleStory, m: MoveDetail, flip: boolean, good: boolean): string {
  const hit = story.targets.filter((t: StoryPiece) => t.square !== m.to && SQUARE.test(t.square));
  let out = hit.map((t) => ring(t.square, flip, good ? "ring good" : "ring")).join("");
  const rear = story.rear;
  if (rear && SQUARE.test(rear.square)) {
    const aim = hit.find((t) => t.color !== rear.color && aligned(rear.square, t.square, rear.piece));
    if (aim) out += ray(rear.square, aim.square, flip, good);
  } else {
    out += hit.map((t) => ray(m.to, t.square, flip, good)).join("");
  }
  return out;
}

const D_SQUARES = "M10 5H80M0 15H80M10 25H80M0 35H80M10 45H80M0 55H80M10 65H80M0 75H80";

function boardOpen(cls: string, label: string | undefined): string {
  const aria = label ? `role="img" aria-label="${esc(label)}"` : `aria-hidden="true"`;
  return `<svg class="${cls}" viewBox="0 0 80 80" ${aria} focusable="false"><rect class="sl" width="80" height="80"/><path class="sd" d="${D_SQUARES}"/>`;
}

function piecesSvg(pieces: readonly BoardPiece[], flip: boolean): string {
  return pieces
    .map((p) => {
      const [x, y] = xy(p.square, flip);
      return `<use class="pc ${colorClass(p.color)}" href="#${symbolId(p.role)}" width="10" height="10" transform="translate(${x} ${y})" data-sq="${p.square}"/>`;
    })
    .join("");
}

/** Kind of arrow for a step: the player's first move, the better line's own moves, the other side, ghosts. */
function kindOf(step: BoardStep, i: number, view: "p" | "b", player: Color): ArrowKind | undefined {
  const m = step.move;
  if (!m) return undefined;
  if (step.ghost) return "ghost";
  if (view === "b") return m.color === player ? "good" : "them";
  if (i === 0) return "bad";
  return m.color === player ? undefined : "them";
}

/** The resting picture's arrows: the reply (plain or broken), the move played, the better move. */
function restArrows(plan: BoardPlan, mini: boolean): string {
  const p0 = plan.played[0]!.move!;
  const reply = plan.played[1]?.move && plan.played[1].line === "they" ? plan.played[1] : undefined;
  const b0 = plan.better[0]?.move;
  let out = "";
  if (reply?.move) out += arrowPaths(reply.move.from, reply.move.to, plan.flip, reply.ghost ? "ghost" : "them");
  out += arrowPaths(p0.from, p0.to, plan.flip, "bad");
  if (b0 && (!mini || !reply)) out += arrowPaths(b0.from, b0.to, plan.flip, "good");
  return out;
}

/** What the key under a board names, in order: only arrows this example can show. */
export function keysOf(plan: BoardPlan): { kind: ArrowKind; label: string }[] {
  const out: { kind: ArrowKind; label: string }[] = [{ kind: "bad", label: "you played" }];
  const reply = plan.played[1]?.line === "they" ? plan.played[1] : undefined;
  if (reply && !reply.ghost) {
    out.push({ kind: "them", label: "their reply" });
    if (plan.played.some((s) => s.ghost)) out.push({ kind: "ghost", label: "what could follow" });
  } else if (reply) {
    out.push({ kind: "ghost", label: "what it allowed" });
    if (plan.played.slice(2).some((s) => s.move && !s.ghost)) out.push({ kind: "them", label: "their move in the game" });
  }
  if (plan.better.length > 0) out.push({ kind: "good", label: "better" });
  return out;
}

/** The arrow-key glyph: the arrow on its light chip. */
export function keyGlyph(kind: ArrowKind): string {
  const d = arrowShape(2.4, 3.85, 16.4, 3.85, kind)
    .map((p) => `<path class="${p.cls}" d="${p.d}"/>`)
    .join("");
  return `<svg class="ak" viewBox="0 0 18 7.7" aria-hidden="true" focusable="false">${d}</svg>`;
}

/** The overlays of one view's steps: under the pieces (tints) and over them (arrows and marks). */
function stepLayers(plan: BoardPlan, story: ExampleStory, patternId: string | undefined, view: "p" | "b"): { under: string; over: string } {
  const steps = view === "p" ? plan.played : plan.better;
  const flip = plan.flip;
  const key = keyMove(story);
  const lost = view === "p" && patternId === "hung-piece" && story.lost && SQUARE.test(story.lost.square) ? story.lost : undefined;
  // The lost piece is ringed from the move played until a step takes it.
  let takenAt = steps.length;
  if (lost) {
    const i = steps.findIndex((s) => s.move && takenOn(s.move) === lost.square);
    if (i >= 0) takenAt = i;
  }
  let under = "";
  let over = "";
  steps.forEach((s, i) => {
    const k = `${view}${i}`;
    const m = s.move;
    if (!m) return;
    const kind = kindOf(s, i, view, plan.player);
    let last = "";
    let below = "";
    if (kind === "bad" || kind === "good") below = tint(m.from, flip, kind) + tint(m.to, flip, kind);
    if (lost && i < takenAt) last += ring(lost.square, flip, "ring");
    const isKey = view === "p" ? key.line === "punish" && s.punishIndex === key.index : key.line === "better" && i === key.index;
    if (isKey) last += keyMarks(story, m, flip, view === "b");
    if (view === "b" && i === 0 && story.betterReason?.square && SQUARE.test(story.betterReason.square)) {
      last += ring(story.betterReason.square, flip, "ring good dash");
    }
    const taken = takenOn(m);
    const wt = s.ghost && taken ? `<g class="wt">${ring(taken, flip, "ring dash")}</g>` : "";
    if (below) under += `<g class="ov" data-k="${k}"><g class="last">${below}</g></g>`;
    const arrows = kind ? arrowPaths(m.from, m.to, flip, kind) : "";
    if (arrows || last || wt) over += `<g class="ov" data-k="${k}">${arrows}${last ? `<g class="last">${last}</g>` : ""}${wt}</g>`;
  });
  return { under, over };
}

const BOARD_LABEL = (side: Color): string =>
  `The position before your move, seen from ${side === "white" ? "White" : "Black"}'s side. The arrow that starts from a dot is the move you played. ` +
  "The plain dark arrow is the reply; a broken one is a reply that was not played. The arrow with a line down its middle is the better move.";

export interface ExampleBoard {
  /** The board with its coordinates and the note row. */
  html: string;
  /** The arrow key under it. */
  keyHtml: string;
  /** What the script needs, as JSON (escape it before putting it in an attribute). */
  data: string;
  plan: BoardPlan;
}

/**
 * The full board of an example: coordinates in the margin, the resting picture, every later
 * picture as hidden overlays, and the note row. Undefined when the position or a move is not
 * one a board can be drawn from.
 */
export function exampleBoard(fen: string, story: ExampleStory, patternId: string | undefined, lines?: readonly StoryLine[]): ExampleBoard | undefined {
  const pieces = piecesOf(fen);
  const plan = planOf(story, patternId, lines);
  if (!pieces || ![...plan.played, ...plan.better].every((s) => validMove(s.move))) return undefined;
  const flip = plan.flip;
  const p0 = plan.played[0]!.move!;
  const played = stepLayers(plan, story, patternId, "p");
  const better = stepLayers(plan, story, patternId, "b");
  const rest = `<g class="ov on" data-k="r">${tint(p0.from, flip, "bad")}${tint(p0.to, flip, "bad")}</g>`;
  const svg =
    boardOpen("board snap", BOARD_LABEL(plan.player)) +
    rest +
    played.under +
    better.under +
    piecesSvg(pieces, flip) +
    `<g class="ov on" data-k="r">${restArrows(plan, false)}</g>` +
    played.over +
    better.over +
    "</svg>";
  const ranks = (flip ? "12345678" : "87654321").split("").map((r) => `<span>${r}</span>`).join("");
  const files = (flip ? "hgfedcba" : "abcdefgh").split("").map((f) => `<span>${f}</span>`).join("");
  const notes = `<span class="bnote" data-w="a" hidden>What it allowed</span><span class="bnote" data-w="f" hidden>What could follow</span>`;
  const html =
    `<div class="bd"><div class="rk" aria-hidden="true">${ranks}</div><div class="bsq">${svg}</div>` +
    `<div class="fl" aria-hidden="true">${files}</div><div class="bn">${notes}</div></div>`;
  const keyHtml = `<p class="akey">${keysOf(plan)
    .map((k) => `<span>${keyGlyph(k.kind)}${esc(k.label)}</span>`)
    .join("")}</p>`;
  const data = JSON.stringify({ f: flip ? 1 : 0, p: plan.played.map(scriptStep), b: plan.better.map(scriptStep) });
  return { html, keyHtml, data, plan };
}

/** The small board on a focus card: no coordinates, the move played and the reply, or the better move. */
export function miniBoard(fen: string, story: ExampleStory, patternId: string | undefined): string | undefined {
  const pieces = piecesOf(fen);
  const plan = planOf(story, patternId);
  if (!pieces || ![...plan.played, ...plan.better].every((s) => validMove(s.move))) return undefined;
  return `${boardOpen("board", undefined)}${piecesSvg(pieces, plan.flip)}${restArrows(plan, true)}</svg>`;
}
