import { createHash } from "node:crypto";
import { templateWording } from "@blunderstruck/coach";
import {
  type BlindSpot,
  type FocusExample,
  type FocusItem,
  type GameRecord,
  type PatternStat,
  type PeriodStats,
  type ProgressVerdict,
  REPORT_WEEKS,
  type Track,
  type WeeklyReport,
  blindSpotFamilyOf,
  blindSpotInfo,
} from "@blunderstruck/contracts";
import {
  type ExampleView,
  type FocusView,
  REFINEMENT_PHRASES,
  type ReportView,
  type StorySegment,
  type StoryTag,
  type TableView,
  dayMonth,
  gamesPhrase,
  keyMove,
  patternName as patternNameOf,
  reportView,
} from "@blunderstruck/view";
import { coverOf, exampleBoard, miniBoard } from "./board";
import { NumberWord, daySpan, esc, numberWord, safeHref } from "./html";
import { inlinePiece, pieceSprite } from "./pieces";
import { SCRIPT } from "./script";
import { STYLE } from "./styles";

export { esc } from "./html";
export { STYLE } from "./styles";
export { SCRIPT } from "./script";

/** Seconds between reloads while games are still being analysed. */
export const REFRESH_SECONDS = 30;

const sha256 = (s: string): string => `'sha256-${createHash("sha256").update(s, "utf8").digest("base64")}'`;

/** The CSP sources that allow exactly the page's one stylesheet and one script. */
export const STYLE_HASH = sha256(STYLE);
export const SCRIPT_HASH = sha256(SCRIPT);

/**
 * The Content-Security-Policy every page from `renderPage` and `renderMessage` needs: nothing
 * may load from anywhere, and only the page's own inline stylesheet and script may run.
 */
export function pageSecurity(): { csp: string } {
  return {
    csp: `default-src 'none'; style-src ${STYLE_HASH}; script-src ${SCRIPT_HASH}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  };
}

export interface PageOptions {
  /** The track the page is for; used on the page shown before any report exists. */
  track?: Track;
  /** The exact command that writes the first report. */
  reportCommand?: string;
  /** Every stored report of the track, for the links between them. */
  reports?: readonly Pick<WeeklyReport, "periodEnd" | "kind">[];
  /** Whether `report` is the track's newest; only the newest reloads itself. Default true. */
  latest?: boolean;
  /** The player's other tracks, and the command that serves one of them. */
  otherTracks?: readonly { track: Track; command: string }[];
  /** Records of the example games, for the opening name and the link. */
  games?: ReadonlyMap<string, Pick<GameRecord, "url" | "platform" | "opening">>;
  /** Put before every internal link ("/", "/report/…", "/report.json"), for a page served under a path. No trailing slash. */
  basePath?: string;
  /**
   * Trusted HTML from the program that embeds the page, put at the top of `<body>`. It is
   * inserted as given, never escaped, and must never contain report data. It must also live
   * within `pageSecurity()`: no inline styles, scripts or external resources.
   */
  header?: string;
  /** Trusted HTML put at the end of `<body>`, on the same terms as `header`. */
  footer?: string;
}

const base = (opts: PageOptions): string => (opts.basePath ?? "").replace(/\/+$/, "");

/** The URL path of one stored report. */
export function reportPath(periodEnd: string, basePath = ""): string {
  return `${basePath.replace(/\/+$/, "")}/report/${encodeURIComponent(periodEnd)}`;
}

const day = (iso: string): string => iso.slice(0, 10);
const pct = (x: number): string => `${(Math.max(0, Math.min(1, x)) * 100).toFixed(1)}%`;
const games = (n: number): string => (n === 1 ? "1 game" : `${n.toLocaleString("en-US")} games`);
const SITE: Record<Track["platform"], string> = { lichess: "Lichess", chesscom: "Chess.com" };

function page(title: string, body: string, o: { refresh?: boolean; script?: boolean; auto?: boolean; opts: PageOptions }): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    o.refresh ? `<meta http-equiv="refresh" content="${REFRESH_SECONDS}">` : "",
    `<title>${esc(title)}</title>`,
    `<style>${STYLE}</style>`,
    "</head>",
    `<body data-auto="${o.auto ? 1 : 0}">`,
    o.opts.header ?? "",
    body,
    o.opts.footer ?? "",
    o.script ? `<script>${SCRIPT}</script>` : "",
    "</body>",
    "</html>",
    "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

const join = (parts: readonly (string | undefined | false)[]): string => parts.filter((p): p is string => typeof p === "string" && p !== "").join("\n");

function table(caption: string, t: TableView): string {
  const th = t.head.map((h) => `<th scope="col">${esc(h)}</th>`).join("");
  const rows = t.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("\n");
  return `<p class="tcap">${esc(caption)}</p>\n<div class="tbl"><table><thead><tr>${th}</tr></thead><tbody>\n${rows}\n</tbody></table></div>`;
}

const KNIGHT = inlinePiece("knight", "white");

function masthead(meta: string): string {
  return `<header class="mast"><a class="brand" href="#top">${KNIGHT}Blunderstruck</a><span class="mast-meta">${esc(meta)}</span></header>`;
}

const FOOT = '<footer class="foot">Blunderstruck is open source. This page was made on your own machine from your own games.</footer>';

/** A plain page with a heading, a sentence and an optional command; used before there is a report to show. */
export function renderMessage(title: string, message: string, command?: string, opts: PageOptions = {}): string {
  const body = join([
    pieceSprite(),
    '<div class="wrap">',
    masthead(""),
    '<main id="top"><section class="hero">',
    `<h1>${esc(title)}</h1>`,
    `<p class="lede">${esc(message)}</p>`,
    command ? `<code class="cmd">${esc(command)}</code>` : undefined,
    "</section></main>",
    FOOT,
    "</div>",
  ]);
  return page(title, body, { opts });
}

function otherTracksHtml(others: PageOptions["otherTracks"]): string | undefined {
  if (!others || others.length === 0) return undefined;
  const items = others.map((o) => `<li>${esc(o.track.timeClass)}: <code class="cmd">${esc(o.command)}</code></li>`);
  return `<h3>Your other time classes</h3>\n<p class="note">This page shows one time class. To see another, stop this server and run:</p>\n<ul class="rlist">${items.join("\n")}</ul>`;
}

function emptyPage(opts: PageOptions): string {
  const t = opts.track;
  const command = opts.reportCommand ?? (t ? `pnpm cli report ${t.platform} ${t.username}` : "pnpm cli report <platform> <user>");
  const who = t ? ` for ${t.username}` : "";
  const body = join([
    pieceSprite(),
    '<div class="wrap">',
    masthead(t ? `${t.username} · ${SITE[t.platform]} · ${t.timeClass}` : ""),
    '<main id="top"><section class="hero">',
    `<h1>${esc(`No report yet${who}.`)}</h1>`,
    '<p class="lede">Run the report command first, then reload this page:</p>',
    `<code class="cmd">${esc(command)}</code>`,
    otherTracksHtml(opts.otherTracks),
    "</section></main>",
    FOOT,
    "</div>",
  ]);
  return page("No report yet", body, { opts });
}

/* ---------- small parts ---------- */

const VERDICT: Record<ProgressVerdict, { cls: string; icon: string }> = {
  improved: { cls: "vd up", icon: "M2 6.5l2.6 2.6L10 3.4" },
  flat: { cls: "vd flat", icon: "M2.5 4.3h7M2.5 7.7h7" },
  worse: { cls: "vd down", icon: "M6 10V2.5M2.8 5.6 6 2.4l3.2 3.2" },
  "insufficient-data": { cls: "vd wait", icon: "M2.4 6h.1M6 6h.1M9.6 6h.1" },
};

function verdictChip(verdict: ProgressVerdict, words: string): string {
  const v = VERDICT[verdict];
  return `<span class="${v.cls}"><svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="${v.icon}"/></svg>${esc(words)}</span>`;
}

/** Text and pieces of a story sentence; a piece's name stays with its drawing, capitalised when it starts the sentence. */
function segmentsHtml(segments: readonly StorySegment[]): string {
  return segments
    .map((s, i) => {
      if ("text" in s) return esc(i === 0 ? s.text.charAt(0).toUpperCase() + s.text.slice(1) : s.text);
      const name = i === 0 ? s.piece.charAt(0).toUpperCase() + s.piece.slice(1) : s.piece;
      return `<span class="pw">${inlinePiece(s.piece, s.color)}${esc(name)}</span>`;
    })
    .join("");
}

/** A bar as SVG, so its width needs no style attribute. */
const svgBar = (cls: string, share: number, label?: string): string =>
  `<svg class="${cls}" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'} focusable="false"><rect class="t" width="100%" height="100%" rx="4"/><rect class="f" width="${pct(share)}" height="100%" rx="4"/></svg>`;

function dotsSvg(total: number, affected: number, over: number): string {
  const per = 30;
  const rows = Math.max(1, Math.ceil(total / per));
  const circles: string[] = [];
  for (let i = 0; i < total; i++) {
    const solid = i < affected - over;
    const cut = !solid && i < affected;
    circles.push(`<circle class="${solid ? "d-on" : cut ? "d-cut" : "d-off"}" cx="${4.5 + (i % per) * 9}" cy="${4.5 + Math.floor(i / per) * 9}" r="${cut ? 2.5 : 3.3}"/>`);
  }
  const label = `One dot per game. ${affected} of ${total} are filled in${over ? `; ${over} of those are ringed.` : "."}`;
  return `<svg class="dots" viewBox="0 0 270 ${rows * 9}" role="img" aria-label="${esc(label)}">${circles.join("")}</svg>`;
}

function trackHtml(start: string, goal: string, pos: number, improved: boolean): string {
  const p = pct(pos);
  return (
    `<div class="track" role="img" aria-label="${esc(`Start: ${start}. Goal: ${goal}.`)}"><div class="rail"><svg aria-hidden="true" focusable="false">` +
    `<rect class="t" y="7" width="100%" height="4" rx="2"/><rect class="f${improved ? " good" : ""}" y="7" width="${p}" height="4" rx="2"/>` +
    `<circle class="end" cx="100%" cy="9" r="7.75"/><circle class="nowr" cx="${p}" cy="9" r="9.75"/><circle class="now" cx="${p}" cy="9" r="7.5"/></svg></div>` +
    `<div class="ends"><span><b>Start</b>${esc(start)}</span><span><b>Goal</b>${esc(goal)}</span></div></div>`
  );
}

/* ---------- per item ---------- */

interface Item {
  view: FocusView;
  raw: FocusItem;
  stat: PatternStat | undefined;
  n: number;
  verdict?: { verdict: ProgressVerdict; text: string };
}

const share = (s: Pick<PatternStat, "games" | "gamesAffected">): number => (s.games > 0 ? s.gamesAffected / s.games : 0);

/** Where the marker stands between start and goal, 0 to 1. */
function trackPos(it: Item): number {
  const start = share(it.raw.baseline);
  const now = it.stat ? share(it.stat) : start;
  const goal = it.view.goal.per / it.view.goal.of;
  if (start === now || start === goal) return 0;
  return Math.max(0, Math.min(1, (start - now) / (start - goal)));
}

const kept = (it: Item): boolean => it.raw.reason.kind === "kept";
const exampleId = (it: Item, j: number): string => `ex-${it.n}-${j + 1}`;

function overGoal(it: Item): number {
  if (!it.stat) return 0;
  const g = it.view.goal;
  return Math.max(0, it.stat.gamesAffected - Math.floor((it.stat.games * g.per) / g.of));
}

function routineLink(it: Item): string {
  const k = it.view.steps.length;
  return k === 0 ? "The habit to build" : `The routine: ${numberWord(k)} ${k === 1 ? "step" : "steps"}`;
}

function cardHtml(it: Item): string {
  const v = it.view;
  const ex0 = it.raw.examples[0];
  const mini = ex0?.story ? miniBoard(ex0.fen, ex0.story, ex0.patternId) : undefined;
  const over = overGoal(it);
  const parts = [
    `<article class="card" id="card-${it.n}">`,
    `<div class="top"><span class="num">${it.n}</span><div><p class="tag">${esc(v.patternName)}</p><h2>${esc(v.title)}</h2></div></div>`,
    '<div class="mid"><div>',
    it.stat
      ? `<p class="big"><b>${it.stat.gamesAffected}</b>of your ${it.stat.games} games</p>`
      : `<p class="big">${esc(v.frequency)}</p>`,
    v.frequencyPhrase ? `<p class="about">${esc(v.frequencyPhrase)}</p>` : "",
    it.verdict ? `<p class="vdrow">${verdictChip(it.verdict.verdict, it.verdict.text)}</p>` : "",
    "</div>",
    mini ? `<a class="mini" href="#${exampleId(it, 0)}" aria-label="See this mistake on the board">${mini}</a>` : "",
    "</div>",
    it.stat ? dotsSvg(it.stat.games, it.stat.gamesAffected, over) : "",
    over > 0 ? `<p class="ringkey"><span class="key" aria-hidden="true"></span>Ringed: the ${over === 1 ? "1 game" : `${over} games`} over the goal.</p>` : "",
    kept(it) ? trackHtml(gamesPhrase(it.raw.baseline.gamesAffected, it.raw.baseline.games), v.goalText, trackPos(it), it.verdict?.verdict === "improved") : "",
    `<p class="aim"><b>${esc(v.goalLine)}</b> ${esc(v.standing)}</p>`,
    `<p class="links"><a class="more" href="#habit-${it.n}">${esc(routineLink(it))}</a>${it.raw.examples.length > 0 ? `<a class="more quiet" href="#${exampleId(it, 0)}">See it on the board</a>` : ""}</p>`,
    "</article>",
  ];
  return parts.join("");
}

/** Which example "See one on the board" points at for each step row, the first example that shows its blind spot and no earlier row points at, else the first that shows it. */
function stepTargets(it: Item): (string | undefined)[] {
  const exs = it.raw.examples;
  const taken = new Set<number>();
  return it.view.steps.map((s) => {
    const shows = exs.map((e, j) => ((e.traits ?? []).includes(s.blindSpot) ? j : -1)).filter((j) => j >= 0);
    const j = shows.find((x) => !taken.has(x)) ?? shows[0];
    if (j === undefined) return undefined;
    taken.add(j);
    return exampleId(it, j);
  });
}

function habitHtml(it: Item): string {
  const v = it.view;
  const k = v.steps.length;
  const missed = blindSpotFamilyOf(it.raw.patternId) === "missed";
  const targets = stepTargets(it);
  const rows = v.steps.map((s, i) => {
    const bv = v.blindSpots.find((b) => b.id === s.blindSpot);
    const raw = it.raw.blindSpots.find((b) => b.id === s.blindSpot);
    const spot = [
      `<p class="spot-k">Blind spot ${i + 1}</p>`,
      `<p class="spot-name">${esc(s.label)}</p>`,
      raw ? `<p class="spot-n"><b>${raw.count}</b><span>of your ${raw.of}</span></p>` : "",
      raw && raw.of > 0
        ? `<svg class="cmp" role="img" aria-label="${esc(`${raw.count} of your ${raw.of}${bv?.comparison ? `, ${bv.comparison}` : ""}`)}" focusable="false">` +
          `<rect class="t" y="4" width="100%" height="10" rx="5"/><rect class="f" y="4" width="${pct(raw.count / raw.of)}" height="10" rx="5"/>` +
          (raw.baselineOf > 0 ? `<rect class="k" x="${pct(raw.baselineCount / raw.baselineOf)}" y="0" width="3" height="18" rx="1.5" transform="translate(-1.5 0)"/>` : "") +
          "</svg>"
        : "",
      bv?.comparison ? `<p class="spot-vs"><span class="tk" aria-hidden="true"></span>${esc(bv.comparison)}</p>` : "",
      bv?.refinement ? `<p class="spot-ref">${esc(bv.refinement)}</p>` : "",
      targets[i] ? `<a class="more" href="#${targets[i]}">See one on the board</a>` : "",
    ].join("");
    return (
      `<li class="step" id="focus-${it.n}-step-${i + 1}"><div class="spot">${spot}</div>` +
      '<div class="join" aria-hidden="true"><svg viewBox="0 0 26 26" focusable="false"><path d="M3 13h18M15 7l6 6-6 6"/></svg></div>' +
      `<div class="do"><p class="do-k">Step ${i + 1}</p><p class="do-t">${esc(s.text)}</p></div></li>`
    );
  });
  const title = k === 0 ? "The habit to build" : `Your routine at the board: ${numberWord(k)} ${k === 1 ? "step" : "steps"}`;
  const drillK = k === 0 ? "" : `Then, the drill behind ${k === 1 ? "it" : k === 2 ? "both" : `all ${numberWord(k)}`}`;
  return join([
    `<div class="habit" id="habit-${it.n}">`,
    k > 0 ? '<p class="habit-k">The habit to build</p>' : undefined,
    `<p class="habit-t">${esc(title)}</p>`,
    k > 0
      ? `<p class="habit-s">Each step answers something these ${missed ? "misses" : "mistakes"} had in common.${v.blindSpotsIntro ? ` ${esc(v.blindSpotsIntro)}` : ""}</p>` +
        '<div class="colk" aria-hidden="true"><span>In your games</span><span>At the board</span></div>' +
        `<ol class="steps">${rows.join("")}</ol>`
      : undefined,
    `<div class="drill">${drillK ? `<p class="drill-k">${esc(drillK)}</p>` : ""}<p class="drill-t">${esc(v.drill)}</p></div>`,
    "</div>",
  ]);
}

/* ---------- examples ---------- */

const TITLES: { kind: string; holds: (e: FocusExample) => string | false; titles: (p: string) => [string, string] }[] = [
  { kind: "answer-fork", holds: (e) => ((e.traits ?? []).includes("answer-fork") ? (e.story ? (keyMove(e.story).move?.piece ?? "") : "") : false), titles: (p) => ["A fork, by invitation", `Two targets, one ${p || "piece"}`] },
  { kind: "answer-discovered", holds: (e) => ((e.traits ?? []).includes("answer-discovered") ? "" : false), titles: () => ["A discovered attack, by invitation", "The piece behind the piece"] },
  { kind: "allowed-mate", holds: (e) => (e.patternId === "allowed-mate" ? "" : false), titles: () => ["Mate, by invitation", "The door left open"] },
  { kind: "hung", holds: (e) => (e.patternId === "hung-piece" && e.story?.lost ? e.story.lost.piece : false), titles: (p) => [`One ${p}, free to a good home`, `One ${p}, left on the doorstep`] },
  { kind: "best-fork", holds: (e) => ((e.traits ?? []).includes("best-fork") ? "" : false), titles: () => ["A fork, left in the drawer", "The fork that stayed home"] },
  { kind: "best-discovered", holds: (e) => ((e.traits ?? []).includes("best-discovered") ? "" : false), titles: () => ["A discovered attack, left in the drawer", "The line that stayed shut"] },
  { kind: "missed-capture", holds: (e) => (e.patternId === "missed-capture" && e.story?.betterReason?.piece ? e.story.betterReason.piece : false), titles: (p) => [`One ${p}, left on the shelf`, `A free ${p}, declined`] },
  { kind: "missed-mate", holds: (e) => (e.patternId === "missed-mate" ? "" : false), titles: () => ["Checkmate, left in the drawer", "Mate, politely declined"] },
];

/** A dry title the example's own traits support, never the same twice running; or none. */
function exampleTitles(exs: readonly FocusExample[]): (string | undefined)[] {
  let prev: string | undefined;
  return exs.map((e) => {
    for (const t of TITLES) {
      const p = t.holds(e);
      if (p === false) continue;
      const [a, b] = t.titles(p);
      const title = prev === a ? b : a;
      prev = title;
      return title;
    }
    prev = undefined;
    return undefined;
  });
}

const WHO: Record<StoryTag, { word: string; cls: string }> = {
  you: { word: "You", cls: "you" },
  they: { word: "They", cls: "they" },
  then: { word: "Then", cls: "they" },
  better: { word: "Better", cls: "good" },
};

function gameMeta(ev: ExampleView, games: PageOptions["games"]): string {
  const game = games?.get(ev.gameId);
  const opening = game?.opening?.name ?? game?.opening?.eco;
  let link = "";
  if (game) {
    const href = safeHref(game.platform === "lichess" ? `${game.url}#${ev.ply}` : game.url);
    if (href) link = `<a href="${esc(href)}" rel="noreferrer">Open the game</a>`;
  }
  return [esc(ev.moveLabel), opening ? esc(opening) : "", link].filter(Boolean).join(" · ");
}

function exampleHtml(it: Item, j: number, title: string | undefined, games: PageOptions["games"]): string {
  const ev = it.view.examples[j]!;
  const raw = it.raw.examples[j]!;
  const id = exampleId(it, j);
  const meta = `<p class="exmeta">${gameMeta(ev, games)}</p>`;
  const fold = j >= 1;
  const more = fold ? `<button type="button" class="morebtn" data-open="${id}">Show another example</button>` : "";
  // Blind spots of this item the example shows, numbered as their rows in the routine.
  const chips = it.view.steps
    .map((s, i) => ((raw.traits ?? []).includes(s.blindSpot) ? `<a class="spotchip" href="#focus-${it.n}-step-${i + 1}"><i>${i + 1}</i>${esc(s.label)}</a>` : ""))
    .filter(Boolean);
  const spots = chips.length > 0 ? `<p class="exspots"><span class="lab">${chips.length > 1 ? "Shows blind spots" : "Shows blind spot"}</span>${chips.join("")}</p>` : "";
  const head = `${spots}${title ? `<p class="extitle">${esc(title)}</p>` : ""}${meta}`;
  if (!raw.story || !ev.story) {
    // Stored before stories: the plain line in place of the board and sentences.
    return `${more}<article class="ex plain" id="${id}"${fold ? " data-fold" : ""}><div>${head}<p class="plainex">${esc(ev.line)}</p></div></article>`;
  }
  const story = raw.story;
  const board = exampleBoard(raw.fen, story, raw.patternId, ev.story);
  const plan = board?.plan;
  const key = keyMove(story);
  const motif = raw.motif ? raw.motif.toLowerCase().replace(/-/g, " ") : undefined;
  const motifOn: StoryTag = key.line === "better" ? "better" : "they";
  const items: string[] = [];
  const caps: string[] = ['<p class="c hint on">Press a button, or tap a sentence below, to go through it move by move.</p>'];
  for (const l of ev.story) {
    const cover = plan ? coverOf(plan, l.tag) : undefined;
    const who = WHO[l.tag];
    const code = cover && cover.san.length > 0 ? ` <code>${esc(cover.san.join(" "))}</code>` : "";
    const chip = motif && l.tag === motifOn ? ` <span class="motif">${esc(motif)}</span>` : "";
    if (l.tag === "better") items.push('<li class="bettersep" aria-hidden="true"></li>');
    const data = cover && board ? ` data-v="${cover.view}" data-n="${cover.n}"` : "";
    items.push(
      `<li class="line${l.tag === "better" ? " g" : ""}"${data}><span class="who ${who.cls}">${who.word}</span><span>${segmentsHtml(l.segments)}${code}${chip}</span></li>`,
    );
    if (data) caps.push(`<p class="c"><span class="who ${who.cls}">${who.word}</span>${segmentsHtml(l.segments)}</p>`);
  }
  const cost = ev.cost ? `<p class="swing">${segmentsHtml(ev.cost.segments)}</p>` : "";
  const left = board
    ? `<div class="bwrap">${board.html}<div class="cap" aria-hidden="true">${caps.join("")}</div>${board.keyHtml}` +
      `<div class="ctl"><button type="button" class="bp" data-do="p" aria-pressed="false">What I played</button>` +
      (story.better.length > 0 ? '<button type="button" class="bb" data-do="b" aria-pressed="false">Better move</button>' : "") +
      '<button type="button" class="ba" data-do="all">Replay</button></div></div>'
    : "";
  const attrs = board ? ` data-b="${esc(board.data)}"` : "";
  return `${more}<article class="ex" id="${id}"${fold ? " data-fold" : ""}${attrs}>${left}<div>${head}<ol class="lines">${items.join("")}</ol>${cost}</div></article>`;
}

/* ---------- chart ---------- */

function chartHtml(it: Item, r: WeeklyReport): string {
  const weeks = it.view.weeks;
  if (weeks.length === 0) return "";
  const flags = it.raw.reason.weeks;
  const n = weeks.length;
  const flagOf = (j: number): boolean | null | undefined => flags[n - 1 - j];
  const top = weeks.some((w) => (w.share ?? 0) > 0.5) ? 1 : 0.5;
  const goalShare = it.view.goal.per / it.view.goal.of;
  const bars = weeks
    .map((w, j) => {
      if (!w.share || w.share <= 0) return "";
      const h = Math.min(100, (w.share / top) * 100);
      const cls = flagOf(j) === null ? "few" : "cb";
      return `<svg x="${(((j + 0.5) / n) * 100).toFixed(2)}%" width="1" height="100%" overflow="visible"><rect class="${cls}" x="-17" y="${(100 - h).toFixed(1)}%" width="34" height="${h.toFixed(1)}%" rx="2"/></svg>`;
    })
    .join("");
  const gy = (100 - Math.min(100, (goalShare / top) * 100)).toFixed(1);
  const labels = weeks
    .map((w) => {
      const count = w.affected !== null && !w.noGames ? `${w.affected} of ${w.games}` : w.text;
      return `<span><b>${esc(count)}</b>${esc(dayMonth(w.end))}</span>`;
    })
    .join("");
  const aria = `Games with this mistake, by week: ${weeks.map((w) => (w.affected !== null ? `${w.affected} of ${w.games}` : w.text)).join(", ")}. The goal is ${it.view.goalText}.`;
  const notes = ["Each bar is the share of that week's games where it happened; a week is named by the day it ends."];
  if (r.kind === "first") {
    const w0 = weeks[0]!;
    if (Date.parse(w0.start) < Date.parse(r.periodStart) && flagOf(0) === null) {
      notes.push(`The first bar covers only ${daySpan(r.periodStart, w0.end, false)}, too few games to count, so it is drawn as an outline.`);
    }
    notes.push(`${NumberWord(n)} ${n === 1 ? "week is" : "weeks is"} not a trend. It is a starting line.`);
  }
  return (
    `<div class="chart" role="img" aria-label="${esc(aria)}"><div class="chead"><span>${top === 1 ? "top line: all your games" : "top line: half your games"}</span>` +
    `<span class="gk"><i></i>${esc(`goal: ${it.view.goalText}`)}</span></div>` +
    `<svg class="plot" aria-hidden="true" focusable="false">${bars}<line class="gl" x1="0" x2="100%" y1="${gy}%" y2="${gy}%"/></svg>` +
    `<div class="cx">${labels}</div></div><p class="note">${esc(notes.join(" "))}</p>`
  );
}

function pipsHtml(it: Item): string {
  if (it.raw.reason.weeksCounted < 3) return "";
  const pips = [...it.raw.reason.weeks]
    .reverse()
    .filter((f) => f !== null)
    .map((f) => (f ? "<i></i>" : '<i class="no"></i>'))
    .join("");
  return pips ? `<span class="pips" aria-hidden="true">${pips}</span>` : "";
}

function focusSection(it: Item, r: WeeklyReport, v: ReportView, opts: PageOptions): string {
  const fv = it.view;
  const titles = exampleTitles(it.raw.examples);
  const exCount = it.raw.examples.length;
  const exHead = `${exCount === 1 ? "One" : NumberWord(exCount)} from ${r.kind === "weekly" ? "this week's games" : "your own games"}`;
  const startText = `${games(it.raw.baseline.gamesAffected).replace(/ games?$/, "")} of ${games(it.raw.baseline.games)} (${gamesPhrase(it.raw.baseline.gamesAffected, it.raw.baseline.games)})`;
  return join([
    `<section class="focus" id="focus-${it.n}">`,
    `<div class="top"><span class="num">${it.n}</span><div><p class="tag">${esc(fv.patternName)}</p><h2>${esc(fv.title)}</h2>`,
    `<p class="reason">${pipsHtml(it)}<span>${esc(fv.reason)}</span>${it.verdict ? verdictChip(it.verdict.verdict, it.verdict.text) : ""}</p></div></div>`,
    `<p class="why">${esc(fv.why)}</p>`,
    habitHtml(it),
    exCount > 0 ? `<h3>${esc(exHead)}</h3>` : undefined,
    ...it.raw.examples.map((_, j) => exampleHtml(it, j, titles[j], opts.games)),
    `<h3>${esc(v.weeksInGames)}</h3>`,
    `<div class="two"><div>${chartHtml(it, r)}</div><div>`,
    kept(it) ? trackHtml(startText, fv.goalText, trackPos(it), it.verdict?.verdict === "improved") : undefined,
    `<p class="stand"><b>${esc(fv.goalLine)}</b> ${esc(fv.standing)}</p></div></div>`,
    "</section>",
  ]);
}

/* ---------- the rest ---------- */

function patternRows(r: WeeklyReport, items: readonly Item[]): string {
  const stats = r.current.stats;
  const ranked = r.priorities.filter((p) => p.rank !== null).sort((a, b) => a.rank! - b.rank!);
  const order: PatternStat[] = [];
  for (const p of ranked) {
    const s = stats.find((x) => x.patternId === p.patternId);
    if (s && !order.includes(s)) order.push(s);
  }
  const rest = stats.filter((s) => !order.includes(s)).map((s, i) => ({ s, i }));
  rest.sort((a, b) => b.s.gamesAffected - a.s.gamesAffected || a.i - b.i);
  order.push(...rest.map((x) => x.s));
  const total = r.current.games;
  const row = (name: string, affected: number, mark?: string): string =>
    `<li${mark ? ' class="f"' : ""}><span>${esc(name)}${mark ? `<em>${esc(mark)}</em>` : ""}</span>${svgBar("pbar", total > 0 ? affected / total : 0)}<span class="n">${games(affected)}</span></li>`;
  const zeros = order.filter((s) => s.gamesAffected === 0);
  const fold = items.length === 0 && zeros.length >= 2;
  const rows = order
    .filter((s) => !(fold && s.gamesAffected === 0))
    .map((s) => {
      const it = items.find((x) => x.raw.patternId === s.patternId);
      const name = it?.view.patternName ?? patternNameOf(s.patternId);
      return row(name, s.gamesAffected, it ? `focus ${it.n}` : undefined);
    });
  if (fold) rows.push(row(`${NumberWord(zeros.length)} other patterns`, 0));
  return rows.join("");
}

/** The view's notes, split into those about the wording and the rest (the view writes them in `r.notes` order). */
function splitNotes(r: WeeklyReport, v: ReportView): { wording: string[]; other: string[] } {
  const lines = v.notes.lines;
  const fewSaid = r.focus.length === 0 && r.notes.includes("few-games");
  const wording: string[] = [];
  const other: string[] = [];
  let i = 0;
  for (const n of r.notes) {
    if (n === "few-games" && fewSaid) continue;
    const line = lines[i++];
    if (line === undefined) break;
    (n === "no-key" || n === "model-failed" ? wording : other).push(line);
  }
  wording.push(...lines.slice(i));
  return { wording, other };
}

function aboutHtml(r: WeeklyReport, v: ReportView, items: readonly Item[], opts: PageOptions): string {
  const split = (s: string): [string, string] => {
    const i = s.indexOf(": ");
    return i < 0 ? ["", s] : [s.slice(0, i), s.slice(i + 2)];
  };
  const rows: [string, string][] = [["Player", `${r.track.username} on ${SITE[r.track.platform]}, ${r.track.timeClass}`]];
  for (const h of [v.header.period, v.header.games, v.header.band]) rows.push(split(h));
  const e = r.settings.engine;
  const cd = r.settings.checkDepth ?? 0;
  rows.push(["Engine", cd > 0 ? `${e.name}. A first look at depth ${e.depth}, then every flagged move checked again at depth ${cd}.` : `${e.name}, depth ${e.depth}.`]);
  const win = items.find((it) => it.raw.blindSpots.length > 0 && it.raw.blindSpotWindow)?.raw.blindSpotWindow;
  if (win) {
    const where = r.kind === "weekly" ? `in your last ${numberWord(REPORT_WEEKS)} weeks, ${games(win.games)}` : `in these ${games(win.games)}`;
    rows.push([
      "Blind spots",
      `Looked for across all ${win.mistakes} of your mistakes ${where}. "Looked like" marks one read by a rule of thumb; the rest are read from the engine's own line.`,
    ]);
  }
  const notes = splitNotes(r, v);
  const wording =
    r.wording.source === "model"
      ? `Titles, reasons, steps and drills written by a model${r.wording.model ? ` (${r.wording.model})` : ""} around numbers that code worked out. Move sentences are written by code.`
      : "Built-in templates.";
  rows.push(["Wording", [wording, ...notes.wording].join(" ")]);
  rows.push(["Compared with", r.comparison ? `The 30 days before this period: ${games(r.comparison.games)}.` : (v.trends.empty ?? "No earlier games to compare with yet.")]);
  return join([
    "<div><h3>About this report</h3>",
    `<dl class="facts">${rows.map(([k, val]) => `<dt>${esc(k)}</dt><dd>${esc(val)}</dd>`).join("")}</dl>`,
    ...notes.other.map((n) => `<p class="note">${esc(n)}</p>`),
    `<p class="note"><a class="more quiet" href="${esc(`${base(opts)}/report.json`)}">The latest report as JSON</a></p></div>`,
  ]);
}

function reportsNav(r: WeeklyReport, opts: PageOptions): string | undefined {
  const reports = opts.reports;
  if (!reports || reports.length < 2) return undefined;
  const sorted = [...reports].sort((a, b) => Date.parse(b.periodEnd) - Date.parse(a.periodEnd));
  const items = sorted.map((x, i) => {
    const label = `${x.kind === "first" ? "First report" : "Week"} ending ${day(x.periodEnd)}${i === 0 ? " (latest)" : ""}`;
    if (Date.parse(x.periodEnd) === Date.parse(r.periodEnd)) return `<li><span>${esc(label)} (this one)</span></li>`;
    const href = i === 0 ? `${base(opts)}/` : reportPath(x.periodEnd, base(opts));
    return `<li><a href="${esc(href)}">${esc(label)}</a></li>`;
  });
  return `<h3>All reports</h3>\n<ul class="rlist">${items.join("\n")}</ul>`;
}

function blindSpotTable(items: readonly Item[]): string | undefined {
  const withSpots = items.filter((it) => it.raw.blindSpots.length > 0);
  if (withSpots.length === 0) return undefined;
  const win = withSpots.find((it) => it.raw.blindSpotWindow)?.raw.blindSpotWindow;
  const read = (basis: BlindSpot["basis"] | undefined): string => (basis === "motif" ? "rule of thumb" : "engine line");
  const rows: string[][] = [];
  for (const it of withSpots) {
    for (const b of it.raw.blindSpots) {
      const label = it.view.blindSpots.find((x) => x.id === b.id)?.label ?? b.id;
      rows.push([`${it.n} · ${label}`, String(b.count), String(b.games), String(b.of), `${b.baselineCount}/${b.baselineOf}`, read(b.basis)]);
      const ref = b.refinement;
      const phrase = ref ? REFINEMENT_PHRASES[ref.id] : undefined;
      if (ref && phrase) rows.push([`${it.n} · of them, ${phrase}`, String(ref.count), "", String(b.count), "", read(blindSpotInfo(ref.id)?.basis)]);
    }
  }
  const cap = win ? `Blind spots (${games(win.games)}, ${win.mistakes} mistakes)` : "Blind spots";
  return table(cap, { head: ["Focus and blind spot", "Times", "Games", "Out of", "All mistakes", "Read from"], rows });
}

function positionsTable(items: readonly Item[]): string | undefined {
  const rows: string[][] = [];
  let depth = 0;
  for (const it of items) {
    it.raw.examples.forEach((e, j) => {
      const ev = it.view.examples[j];
      if (!e.story || !ev) return;
      depth = Math.max(depth, e.story.depth);
      rows.push([`${ev.moveLabel}: ${e.story.played.san}`, ev.cost?.detail ?? ""]);
    });
  }
  if (rows.length === 0) return undefined;
  const n = rows.length;
  const cap = `The ${n === 1 ? "position" : `${numberWord(n)} positions`} shown (checked at depth ${depth})`;
  return table(cap, { head: ["Move", "Winning chances"], rows });
}

function detailsHtml(v: ReportView, items: readonly Item[]): string {
  const d = v.details;
  const lines = [...d.focus, ...(d.progress?.lines ?? []), ...(d.retired?.lines ?? [])];
  return join([
    '<details id="figures">',
    `<summary>${esc(d.heading)}</summary>`,
    lines.length > 0 ? `<ul class="dlines">${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : undefined,
    v.body.kind === "numbers" ? table(v.body.heading, v.body.table) : undefined,
    v.body.kind === "focus" ? table(d.weeks.heading, d.weeks.table) : undefined,
    d.trends.table ? table(d.trends.heading, d.trends.table) : `<p class="tcap">${esc(d.trends.heading)}</p><p class="note">${esc(d.trends.empty ?? "")}</p>`,
    blindSpotTable(items),
    positionsTable(items),
    "</details>",
  ]);
}

/* ---------- the first screen ---------- */

interface State {
  complete: boolean;
  sample: boolean;
  deeper: boolean;
  analysing: boolean;
  fewGames: boolean;
}

function headline(r: WeeklyReport, s: State, items: readonly Item[]): string {
  const k = items.length;
  const p = r.player;
  if (!s.complete && !s.sample && k > 0) return `${p}, ${k === 1 ? "one habit stands out" : `${numberWord(k)} habits stand out`} so far.`;
  if (k === 0 && s.fewGames) {
    const g = r.gamesFound;
    return g === 0 ? `${p}, no games to go on yet.` : `${p}, ${numberWord(g)} ${g === 1 ? "game" : "games"} is not enough to go on.`;
  }
  if (k === 0) return `${p}, here are your numbers.`;
  if (r.kind === "first") return `${p}, ${k === 1 ? "one habit is" : `${numberWord(k)} habits are`} costing you the most.`;
  const grad = r.retired.filter((x) => x.why === "graduated").length;
  if (grad > 0) return `${p}, ${numberWord(grad)} ${grad === 1 ? "habit is" : "habits are"} off your list.`;
  const pn = r.progress.length;
  const said = (verdict: ProgressVerdict, what: string): string | undefined => {
    const c = r.progress.filter((x) => x.verdict === verdict).length;
    if (c === 0) return undefined;
    if (pn === 1) return `${p}, your habit is getting ${what}.`;
    if (c === pn && pn === 2) return `${p}, both of your two are getting ${what}.`;
    return `${p}, ${numberWord(c)} of your ${numberWord(pn)} ${c === 1 ? "is" : "are"} getting ${what}.`;
  };
  return said("improved", "rarer") ?? said("worse", "more common") ?? `${p}, ${k === 1 ? "same habit" : `same ${numberWord(k)} habits`}, one week on.`;
}

function eyebrow(r: WeeklyReport, s: State): string {
  const kind = r.kind === "first" ? "First report" : "Weekly report";
  const suffix = s.deeper ? " · first look" : s.analysing ? " · provisional" : "";
  return `${kind} · ${daySpan(r.periodStart, r.periodEnd)}${suffix}`;
}

function lede(r: WeeklyReport, v: ReportView, s: State, items: readonly Item[]): string {
  const tc = esc(r.track.timeClass);
  const c = r.coverage;
  if (items.length === 0) {
    return s.fewGames ? "Play a few more and run the report again. Until then, here are the numbers." : v.body.kind === "numbers" ? esc(v.body.intro) : "";
  }
  if (s.deeper) return `A first look at all <b>${c.total}</b> of your ${tc} games. The deeper check is running.`;
  if (s.analysing) return `From the first <b>${c.analysed}</b> of your ${c.total} ${tc} games. The rest are in the queue.`;
  if (s.sample) return `From the first <b>${c.analysed}</b> of your ${c.total} ${tc} games.`;
  const twice = c.checked !== undefined && c.checked === c.total && (r.settings.checkDepth ?? 0) > 0 ? ", every mistake checked twice" : "";
  if (r.kind === "first") {
    const days = Math.round((Date.parse(r.periodEnd) - Date.parse(r.periodStart)) / 86_400_000);
    const wide = items.length === 1 ? " Work on this one." : ` Work on these ${numberWord(items.length)}. Everything else can wait.`;
    return `All <b>${r.gamesFound}</b> of your ${tc} games from the last ${days} days${twice}.<span class="wide">${wide}</span>`;
  }
  const kinds = [
    [r.retired.filter((x) => x.why === "graduated").length, "is fixed", "are fixed"],
    [r.focus.filter((f) => f.reason.kind === "kept").length, "carries on", "carry on"],
    [r.focus.filter((f) => f.reason.kind !== "kept").length, "joins the list", "join the list"],
  ] as const;
  const bits = kinds
    .filter(([n]) => n > 0)
    .map(([n, one, many], i) => `${i === 0 ? `${NumberWord(n)} ${n === 1 ? "habit" : "habits"}` : numberWord(n)} ${n === 1 ? one : many}`);
  const wide = bits.length === 0 ? "" : bits.length === 1 ? bits[0]! : `${bits.slice(0, -1).join(", ")}, and ${bits.at(-1)}`;
  const gamesWord = r.gamesFound === 1 ? "game" : "games";
  return `<b>${r.gamesFound}</b> ${tc} ${gamesWord} since your last report${twice}.${wide ? `<span class="wide"> ${esc(wide)}.</span>` : ""}`;
}

function bannerHtml(v: ReportView, r: WeeklyReport, s: State): string | undefined {
  if (s.complete || !v.coverage) return undefined;
  const total = r.coverage.total;
  const done = Math.max(0, total - v.pending);
  const lead = s.sample ? "A sample, as you asked:" : s.deeper ? "Deeper check running:" : "Still analysing:";
  const more = s.sample
    ? ""
    : s.deeper
      ? " The two picks and the examples may change a little too. This page updates itself, and the boards wait for a click until then."
      : " This page updates as they finish, and the two picks below may change.";
  const bar =
    !s.sample && total > 0
      ? (() => {
          const label = `${done} of ${total} games ${s.deeper ? "checked" : "done"}`;
          return `<svg class="bar" role="img" aria-label="${esc(label)}" focusable="false"><rect class="t" width="100%" height="6" rx="3"/><rect class="f" width="${pct(done / total)}" height="6" rx="3"/></svg>`;
        })()
      : "";
  return `<div class="banner" role="status"><p><b>${lead}</b> ${esc(v.coverage)}${more ? `<span class="wide">${more}</span>` : ""}</p>${bar}</div>`;
}

function sinceHtml(v: ReportView): string | undefined {
  const prog = v.progressInGames?.items ?? [];
  const ret = v.retiredInGames?.items ?? [];
  if (prog.length === 0 && ret.length === 0) return undefined;
  return join([
    '<section class="since">',
    prog.length > 0 ? `<h3>Last report's ${numberWord(prog.length)}, since then</h3>` : undefined,
    prog.length > 0
      ? `<ul class="verdicts">${prog.map((p) => `<li>${verdictChip(p.verdict, p.verdictText)}<span><b>${esc(p.patternName)}:</b> ${esc(p.counts)}</span></li>`).join("")}</ul>`
      : undefined,
    ret.length > 0 ? "<h3>Off your list</h3>" : undefined,
    ...ret.map(
      (x) =>
        `<div class="done">${x.why === "graduated" ? '<span class="stamp">Fixed</span>' : ""}<p><b>${esc(x.patternName)}:</b> ${esc(`${x.verdictText}. ${x.counts}`)}</p></div>`,
    ),
    "</section>",
  ]);
}

/**
 * The report as one HTML page: one inline stylesheet, one inline script, every value escaped.
 * Complete without the script. `pending` is the number of games not yet fully checked;
 * `history` is the weekly stats of the track.
 */
export function renderPage(report: WeeklyReport | undefined, ctx: { pending: number; history: PeriodStats[] }, opts: PageOptions = {}): string {
  if (!report) return emptyPage(opts);
  const r = report;
  const v = reportView(r, {
    pending: ctx.pending,
    fallback: templateWording(r),
    ...(ctx.history.length > 0 ? { weeks: ctx.history } : {}),
  });
  const c = r.coverage;
  const s: State = {
    complete: c.complete,
    sample: !c.complete && c.sampleOnly,
    deeper: !c.complete && !c.sampleOnly && c.analysed >= c.total,
    analysing: !c.complete && !c.sampleOnly && c.analysed < c.total,
    fewGames: r.focus.length === 0 && r.notes.includes("few-games"),
  };
  const views = v.body.kind === "focus" ? v.body.items : [];
  const items: Item[] = views.map((view, i) => {
    const raw = r.focus[i]!;
    const p = v.progressInGames?.items.find((x) => x.patternId === raw.patternId);
    return {
      view,
      raw,
      stat: r.current.stats.find((x) => x.patternId === raw.patternId),
      n: i + 1,
      ...(raw.reason.kind === "kept" && p ? { verdict: { verdict: p.verdict, text: p.verdictText } } : {}),
    };
  });
  const index =
    items.length > 0
      ? `<ol class="index" aria-label="The habits to work on">${items
          .map(
            (it) =>
              `<li><a href="#card-${it.n}"><span class="ix-n">${it.n}</span><span class="ix-t">${esc(it.view.title)}</span>` +
              `<span class="ix-c">${it.stat ? `${it.stat.gamesAffected} of ${it.stat.games} games` : ""}</span></a></li>`,
          )
          .join("")}</ol>`
      : undefined;
  const cards = items.length > 0 ? `<div class="cards${items.length === 1 ? " one" : ""}">${items.map((it) => cardHtml(it)).join("")}</div>` : undefined;
  const total = r.current.games;
  const patsNote = `Games out of ${total} where each thing happened at least once. One game can appear in more than one row.${
    items.length === 2 ? " The top two cost you the most and kept coming back, which is why they are your two." : ""
  }`;
  const right = join([reportsNav(r, opts), otherTracksHtml(opts.otherTracks)]);
  const body = join([
    pieceSprite(),
    '<div class="wrap">',
    masthead(`${r.track.username} · ${SITE[r.track.platform]} · ${r.track.timeClass}`),
    '<main id="top">',
    bannerHtml(v, r, s),
    '<section class="hero">',
    `<p class="eyebrow">${esc(eyebrow(r, s))}</p>`,
    `<h1>${esc(headline(r, s, items))}</h1>`,
    `<p class="lede">${lede(r, v, s, items)}</p>`,
    index,
    cards,
    items.length > 0 && v.summary ? `<p class="overall">${esc(v.summary)}</p>` : undefined,
    "</section>",
    r.kind === "weekly" ? sinceHtml(v) : undefined,
    ...items.map((it) => focusSection(it, r, v, opts)),
    '<section class="rest" id="rest">',
    '<p class="eyebrow">For the curious</p>',
    "<h2>Everything we counted</h2>",
    `<p class="note">${esc(patsNote)}</p>`,
    `<ul class="pats">${patternRows(r, items)}</ul>`,
    `<div class="cols">${aboutHtml(r, v, items, opts)}${right ? `<div>${right}</div>` : ""}</div>`,
    detailsHtml(v, items),
    "</section>",
    "</main>",
    FOOT,
    "</div>",
  ]);
  return page(v.header.title, body, {
    refresh: v.provisional && (opts.latest ?? true),
    script: true,
    auto: s.complete || s.sample,
    opts,
  });
}
