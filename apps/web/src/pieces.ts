import type { Color, PieceRole } from "@blunderstruck/contracts";

/**
 * The six piece drawings, original to this project (AGPL-3.0 like the rest of it). Each is drawn
 * on a 40-unit square: one filled outline (`d`) and, for the bishop and the knight, one short
 * stroked detail (`detail`). Colours come from the `w` and `b` classes in the stylesheet.
 */
export const PIECE_PATHS: Readonly<Record<PieceRole, { d: string; detail?: string }>> = {
  pawn: { d: "M14.2 12.8a5.8 5.8 0 1 0 11.6 0a5.8 5.8 0 1 0-11.6 0zM14.5 31c.5-5 3-7 3.5-12h4c.5 5 3 7 3.5 12zM9 31.5h22V36H9z" },
  rook: { d: "M11 7h4v3h3V7h4v3h3V7h4v8l-3 3v10l3 3v1H11v-1l3-3V18l-3-3zM8 31.5h24V36H8z" },
  bishop: {
    d: "M17.7 6.2a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0-4.6 0zM20 8.5c5 3.5 7.5 8 7.5 12 0 3-1.8 5-3.8 6l1.8 5.5h-11l1.8-5.5c-2-1-3.8-3-3.8-6 0-4 2.5-8.5 7.5-12zM9 31.5h22V36H9z",
    detail: "M22.8 13.5 19 19.5",
  },
  knight: {
    d: "M12 32c0-6 2.5-9 5.5-11.5l-4 2.3c-2.2 1.2-5-.6-5-3.3l7.5-10 3.5-6 2.5 4.5c6 2 9 7.5 9 14v10zM9 31.5h24V36H9z",
    detail: "M16.8 12.8h.4",
  },
  queen: {
    d: "M8 12l4 10 2-13 3.5 12L20 8l2.5 13L26 9l2 13 4-10-3 20H11zM6.1 11.5a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0-3.8 0zM12.1 8.5a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0-3.8 0zM18.1 7.5a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0-3.8 0zM24.1 8.5a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0-3.8 0zM30.1 11.5a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0-3.8 0zM9 31.5h22V36H9z",
  },
  king: {
    d: "M18.8 2.5h2.4v2.6h2.6v2.4h-2.6v3.5h-2.4V7.5h-2.6V5.1h2.6zM20 12c-3.5-3.5-10.5-2.5-11 3.5-.4 5 3 8.5 4 16.5h14c1-8 4.4-11.5 4-16.5-.5-6-7.5-7-11-3.5zM9 31.5h22V36H9z",
  },
};

/** FEN letter of each piece. */
export const PIECE_LETTER: Readonly<Record<PieceRole, string>> = { pawn: "p", knight: "n", bishop: "b", rook: "r", queen: "q", king: "k" };

const ROLES = Object.keys(PIECE_PATHS) as PieceRole[];

/** The id of a piece's symbol in the page: "pq" for the queen. */
export const symbolId = (role: PieceRole): string => `p${PIECE_LETTER[role]}`;

/** `w` or `b`, the class that colours a piece. */
export const colorClass = (c: Color): "w" | "b" => (c === "white" ? "w" : "b");

/**
 * One hidden SVG holding every piece as a symbol, referenced by `<use href="#pq">` on boards and
 * in sentences. Same-document references only: nothing is fetched.
 */
export function pieceSprite(): string {
  const symbols = ROLES.map((role) => {
    const p = PIECE_PATHS[role];
    const detail = p.detail ? `<path class="pl" d="${p.detail}"/>` : "";
    return `<symbol id="${symbolId(role)}" viewBox="0 0 40 40"><path class="pf" d="${p.d}"/>${detail}</symbol>`;
  });
  return `<svg class="sprite" aria-hidden="true" focusable="false">${symbols.join("")}</svg>`;
}

/** A piece drawn inline in text, on its small tile. Decorative: the name follows it. */
export function inlinePiece(role: PieceRole, color: Color): string {
  return `<svg class="pi ${colorClass(color)}" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><use href="#${symbolId(role)}"/></svg>`;
}
