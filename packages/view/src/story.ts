import {
  type BetterReason,
  type Color,
  type ExampleStory,
  type MoveDetail,
  type PieceRole,
  type StoryPiece,
  blindSpotFamilyOf,
} from "@blunderstruck/contracts";

/**
 * One piece of a story sentence: plain text, or a piece that a page can draw inline and a
 * terminal prints by name. A piece segment stands for the piece's name ("knight").
 */
export type StorySegment = { text: string } | { piece: PieceRole; color: Color };

/** Who a story line is about: the player's move, the reply, what followed, the better move. */
export type StoryTag = "you" | "they" | "then" | "better";

export interface StoryLine {
  tag: StoryTag;
  segments: StorySegment[];
  /** The line as plain text, piece names in place of the pieces. */
  text: string;
}

/** A sentence built from segments, with its plain text. */
export interface StorySentence {
  segments: StorySegment[];
  text: string;
}

/** What a mistake cost: material first when a piece went, winning chances as the detail. */
export interface StoryCost extends StorySentence {
  /** "Your winning chances went from 94% to 26%." */
  detail: string;
}

const PIECE_VALUE: Record<PieceRole, number> = { king: 100, queen: 9, rook: 5, bishop: 3, knight: 3, pawn: 1 };
const SIDE: Record<"king" | "queen", string> = { king: "kingside", queen: "queenside" };

const other = (c: Color): Color => (c === "white" ? "black" : "white");

/** Plain text of segments: piece names in place of pieces, the first letter capitalised. */
export function segmentsText(segments: readonly StorySegment[]): string {
  const raw = segments.map((s) => ("text" in s ? s.text : s.piece)).join("");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Builds a segment list, merging neighbouring text. */
class Sentence {
  readonly segments: StorySegment[] = [];
  /** Kinds of the player's pieces named so far, for the "the" or "their" choice. */
  private readonly yours = new Set<PieceRole>();

  constructor(private readonly player: Color) {}

  text(t: string): this {
    const last = this.segments.at(-1);
    if (last && "text" in last) last.text += t;
    else if (t) this.segments.push({ text: t });
    return this;
  }

  piece(piece: PieceRole, color: Color): this {
    this.segments.push({ piece, color });
    return this;
  }

  /** "your knight" for the player's piece; "the knight", or "their knight" when a player's knight is also named. */
  named(piece: PieceRole, color: Color, opts: { their?: boolean } = {}): this {
    if (color === this.player) {
      this.yours.add(piece);
      return this.text("your ").piece(piece, color);
    }
    return this.text(opts.their || this.yours.has(piece) ? "their " : "the ").piece(piece, color);
  }

  /** Notes a player's piece the sentence will name, before it is written. */
  willName(piece: PieceRole | undefined, color: Color): this {
    if (piece && color === this.player) this.yours.add(piece);
    return this;
  }

  done(): StorySentence {
    return { segments: this.segments, text: segmentsText(this.segments) };
  }
}

/** ": checkmate", " with check" or nothing. */
const checkWords = (m: MoveDetail): string => (m.mate ? ": checkmate" : m.check ? " with check" : "");

/** The pieces named in a list: "king and queen", "king, queen and rook". */
function pieceList(s: Sentence, pieces: readonly StoryPiece[], owner: string): void {
  pieces.forEach((p, i) => {
    if (i === 0) s.text(`${owner} `);
    else s.text(i === pieces.length - 1 ? " and " : ", ");
    s.piece(p.piece, p.color);
  });
}

/** Targets worth naming for a move: the hit pieces other than the one it takes, most valuable first. */
function namedTargets(m: MoveDetail, targets: readonly StoryPiece[]): StoryPiece[] {
  const hit = targets.filter((t) => t.color !== m.color && !(m.captured && t.square === m.to));
  const sorted = [...hit].sort((a, b) => PIECE_VALUE[b.piece] - PIECE_VALUE[a.piece]);
  // A lone king is already said by "with check".
  if (sorted.length === 1 && sorted[0]!.piece === "king" && m.check) return [];
  return sorted;
}

/** ", hitting your king and queen at once" (or "a rook" alone), when the move hits anything worth saying. */
function hitting(s: Sentence, m: MoveDetail, targets: readonly StoryPiece[], player: Color): void {
  const hit = namedTargets(m, targets);
  if (hit.length === 0 || m.mate) return;
  const owner = hit[0]!.color === player ? "your" : "their";
  s.text(", hitting ");
  pieceList(s, hit, owner);
  if (hit.length > 1) s.text(" at once");
}

/** On one rook or bishop line, with nothing to check in between (the line is the engine's). */
function aligned(from: string, to: string, piece: PieceRole): boolean {
  const df = to.charCodeAt(0) - from.charCodeAt(0);
  const dr = to.charCodeAt(1) - from.charCodeAt(1);
  const straight = (df === 0) !== (dr === 0);
  const diagonal = df !== 0 && Math.abs(df) === Math.abs(dr);
  if (piece === "rook") return straight;
  if (piece === "bishop") return diagonal;
  if (piece === "queen") return straight || diagonal;
  return false;
}

/** " Moving it opened the line behind it: their bishop on b7 was now aimed at your queen." */
function discovered(s: Sentence, m: MoveDetail, rear: StoryPiece, targets: readonly StoryPiece[], player: Color): void {
  const owner = (c: Color): string => (c === player ? "your" : "their");
  s.text(" Moving it opened the line behind it");
  const aim = targets.find((t) => t.color !== rear.color && t.square !== m.to && aligned(rear.square, t.square, rear.piece));
  if (aim) {
    s.text(`: ${owner(rear.color)} `).piece(rear.piece, rear.color).text(` on ${rear.square} was now aimed at ${owner(aim.color)} `);
    s.piece(aim.piece, aim.color).text(".");
  } else {
    s.text(` for ${owner(rear.color)} `).piece(rear.piece, rear.color).text(` on ${rear.square}.`);
  }
}

/** The key move: `punish[index]` or `better[index]`, `punish[0]` when the story names none. */
export function keyMove(story: ExampleStory): { line: "punish" | "better"; index: number; move?: MoveDetail } {
  const key = story.key ?? { line: "punish" as const, index: 0 };
  const list = key.line === "punish" ? story.punish : story.better;
  const move = list[key.index];
  return { ...key, ...(move ? { move } : {}) };
}

/** "Your queen went to d2." and its variants, for the player's own move. */
function youSentence(story: ExampleStory, patternId: string | undefined): StorySentence {
  const m = story.played;
  const s = new Sentence(m.color);
  if (m.castle) {
    s.text(`You castled ${SIDE[m.castle]}${checkWords(m)}.`);
  } else {
    s.named(m.piece, m.color);
    if (m.captured) {
      s.text(" took ").named(m.captured, other(m.color)).text(` on ${m.to}${m.enPassant ? " en passant" : ""}`);
      if (m.promotion) s.text(" and became a ").piece(m.promotion, m.color);
    } else if (m.promotion) {
      s.text(` reached ${m.to} and became a `).piece(m.promotion, m.color);
    } else {
      s.text(` went to ${m.to}`);
    }
    s.text(`${checkWords(m)}.`);
  }
  const reply = story.punish[0];
  if (patternId === "hung-piece" && story.lost && reply?.captured && reply.to === story.lost.square) {
    s.text(" That left ").named(story.lost.piece, story.lost.color).text(` on ${story.lost.square} where it could be taken.`);
  }
  return s.done();
}

/** The opponent's reply that punished the move: "That let the knight jump to e4 with check, …". */
function theySentence(story: ExampleStory, m: MoveDetail, isKey: boolean, patternId: string | undefined): StorySentence {
  const player = story.played.color;
  const s = new Sentence(player);
  s.willName(m.captured, player);
  if (isKey) for (const t of story.targets) s.willName(t.piece, t.color);
  const hungReply = patternId === "hung-piece" && story.lost && m.captured && m.to === story.lost.square;
  if (hungReply) {
    // "Their knight took your knight."
    s.named(m.piece, m.color).text(" took ").named(m.captured!, player).text(`${checkWords(m)}.`);
    return s.done();
  }
  if (m.castle) {
    s.text(`That let them castle ${SIDE[m.castle]}${checkWords(m)}.`);
    return s.done();
  }
  s.text("That let ").named(m.piece, m.color);
  if (m.captured) {
    s.text(" take ").named(m.captured, player).text(` on ${m.to}${m.enPassant ? " en passant" : ""}`);
    if (m.promotion) s.text(" and become a ").piece(m.promotion, m.color);
  } else if (m.promotion) {
    s.text(` reach ${m.to} and become a `).piece(m.promotion, m.color);
  } else {
    s.text(` ${m.piece === "knight" ? "jump" : "come"} to ${m.to}`);
  }
  s.text(checkWords(m));
  if (isKey && !story.rear) hitting(s, m, story.targets, player);
  s.text(".");
  if (isKey && story.rear) discovered(s, m, story.rear, story.targets, player);
  return s.done();
}

/** One clause of the rest of a line: "your king had to step aside", "the knight took your queen". */
function clause(s: Sentence, m: MoveDetail, prev: MoveDetail | undefined, player: Color): void {
  const mine = m.color === player;
  if (m.castle) {
    s.text(`${mine ? "you" : "they"} castled ${SIDE[m.castle]}${checkWords(m)}`);
    return;
  }
  s.named(m.piece, m.color);
  if (m.captured) {
    s.text(" took ").named(m.captured, other(m.color));
    if (m.enPassant) s.text(" en passant");
  } else if (mine && m.piece === "king" && prev?.check) {
    s.text(" had to step aside");
  } else {
    s.text(` went to ${m.to}`);
  }
  if (m.promotion) s.text(" and became a ").piece(m.promotion, m.color);
  s.text(checkWords(m));
}

/** The rest of the punishing line as one sentence, the key move's targets on its clause. */
function thenSentence(story: ExampleStory, from: number, keyIndex: number | undefined): StorySentence | undefined {
  const rest = story.punish.slice(from);
  if (rest.length === 0) return undefined;
  const player = story.played.color;
  const s = new Sentence(player);
  let rearAfter: MoveDetail | undefined;
  rest.forEach((m, i) => {
    if (i > 0) s.text(i === rest.length - 1 ? ", and " : ", ");
    clause(s, m, story.punish[from + i - 1], player);
    if (from + i === keyIndex) {
      if (story.rear) rearAfter = m;
      else hitting(s, m, story.targets, player);
    }
  });
  s.text(".");
  if (rearAfter && story.rear) discovered(s, rearAfter, story.rear, story.targets, player);
  return s.done();
}

/** "They missed it. The game went on with the rook to b8." */
function missedSentence(story: ExampleStory): StorySentence {
  const player = story.played.color;
  const s = new Sentence(player).text("They missed it.");
  const m = story.actualReply;
  if (!m) return s.done();
  s.text(" The game went on with ");
  if (m.castle) {
    s.text(`them castling ${SIDE[m.castle]}`);
  } else {
    s.named(m.piece, m.color);
    if (m.captured) s.text(" taking ").named(m.captured, player).text(` on ${m.to}${m.enPassant ? " en passant" : ""}`);
    else s.text(` to ${m.to}`);
    if (m.promotion) s.text(", becoming a ").piece(m.promotion, m.color);
  }
  s.text(`${m.mate ? ", checkmate" : m.check ? ", with check" : ""}.`);
  return s.done();
}

/** "It wins their queen for your knight.", one fixed sentence per reason kind. */
function reasonText(s: Sentence, r: BetterReason, story: ExampleStory, player: Color): void {
  const key = keyMove(story);
  const reply = key.line === "punish" && key.move ? key.move : story.punish[0];
  const opp = other(player);
  switch (r.kind) {
    case "mates":
      if (r.mateIn !== undefined && r.mateIn > 1) s.text(`It forces mate in ${r.mateIn} moves.`);
      else if (r.mateIn === 1) s.text("It gives mate at once.");
      else s.text("It forces mate.");
      return;
    case "wins":
      if (r.piece) {
        s.text("It wins their ").piece(r.piece, opp);
        if (r.gave) s.text(" for your ").piece(r.gave, player);
        s.text(".");
      } else {
        s.text("It wins material.");
      }
      return;
    case "covers-square": {
      const sq = r.square ?? reply?.to;
      if (!sq) {
        s.text("It covers the square their best reply needed.");
      } else if (reply && reply.to === sq) {
        s.text(`It covers ${sq}, so `).named(reply.piece, reply.color).text(" cannot land there safely.");
      } else {
        s.text(`It covers ${sq}.`);
      }
      return;
    }
    case "stops-key-move":
      if (reply) s.text("It stops ").named(reply.piece, reply.color).text(` from going to ${reply.to}.`);
      else s.text("It stops their best reply.");
      return;
    case "holds":
      s.text("It gives nothing away.");
      return;
  }
}

/** "Knight to e4, with check." then, when the reasons are known, why. */
function betterSentence(story: ExampleStory): StorySentence | undefined {
  const b = story.better[0];
  if (!b) return undefined;
  const player = story.played.color;
  const s = new Sentence(player);
  if (b.castle) {
    s.text(`Castle ${SIDE[b.castle]}`);
  } else {
    s.piece(b.piece, b.color);
    if (b.captured) {
      s.text(" takes ").named(b.captured, other(b.color), { their: b.captured === b.piece }).text(` on ${b.to}`);
      if (b.enPassant) s.text(", en passant");
    } else {
      s.text(` to ${b.to}`);
    }
    if (b.promotion) s.text(", becoming a ").piece(b.promotion, b.color);
  }
  s.text(`${b.mate ? ", checkmate" : b.check ? ", with check" : ""}.`);

  const key = keyMove(story);
  if (key.line === "better" && key.move) {
    const hit = namedTargets(key.move, story.targets);
    if (hit.length > 0 && !key.move.mate) {
      const owner = hit[0]!.color === player ? "your" : "their";
      if (key.index === 0) s.text(" That hits ");
      else s.text(" Later in that line ").named(key.move.piece, key.move.color).text(" hits ");
      pieceList(s, hit, owner);
      s.text(hit.length > 1 ? " at once." : ".");
    }
  }
  if (story.betterReason) {
    s.text(" ");
    reasonText(s, story.betterReason, story, player);
  }
  return s.done();
}

const line = (tag: StoryTag, sentence: StorySentence): StoryLine => ({ tag, ...sentence });

/**
 * An example told move by move: the player's move, the reply that punished it, what followed
 * (or that the opponent missed it), and the better move with its reason. Pure function of the story.
 */
export function storyLines(story: ExampleStory, patternId?: string): StoryLine[] {
  const out: StoryLine[] = [line("you", youSentence(story, patternId))];
  const key = keyMove(story);
  const keyIndex = key.line === "punish" && key.move ? key.index : undefined;
  const reply = story.punish[0];
  if (reply) {
    out.push(line("they", theySentence(story, reply, keyIndex === 0, patternId)));
    if (story.replyFound) {
      const then = thenSentence(story, 1, keyIndex);
      if (then) out.push(line("then", then));
    } else {
      out.push(line("then", missedSentence(story)));
    }
  }
  const better = betterSentence(story);
  if (better) out.push(line("better", better));
  return out;
}

/** "Your winning chances went from 94% to 26%." */
export function winChances(story: Pick<ExampleStory, "winPctBefore" | "winPctAfter">): string {
  return `Your winning chances went from ${Math.round(story.winPctBefore)}% to ${Math.round(story.winPctAfter)}%.`;
}

/**
 * What the move cost, material first: checkmate allowed, the piece lost, the material, or for a
 * missed chance what it would have won. Winning chances before and after are the detail.
 */
export function storyCost(story: ExampleStory, patternId?: string): StoryCost {
  const player = story.played.color;
  const s = new Sentence(player);
  const missed = patternId !== undefined && blindSpotFamilyOf(patternId) === "missed";
  const r = story.betterReason;
  if (story.punish.at(-1)?.mate) {
    s.text("It allowed checkmate.");
  } else if (story.lost) {
    s.text("It cost ").named(story.lost.piece, story.lost.color).text(".");
  } else if (missed && r?.kind === "mates") {
    s.text("It cost a forced mate.");
  } else if (missed && r?.kind === "wins" && r.piece) {
    s.text("It cost the chance to win their ").piece(r.piece, other(player)).text(".");
  } else if (story.gain <= -1) {
    const n = Math.round(-story.gain);
    s.text(n === 1 ? "It cost a pawn." : `It cost material worth ${n} pawns.`);
  } else {
    s.text("It cost winning chances.");
  }
  return { ...s.done(), detail: winChances(story) };
}
