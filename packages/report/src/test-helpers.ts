import type { GameRecord, ReportTimeClass, WeeklyReport } from "@blunderstruck/contracts";
import { HttpError, type CoachProvider, type CompleteRequest } from "@blunderstruck/coach";
import type { Evaluator } from "@blunderstruck/engine";
import type { fetchGames } from "@blunderstruck/ingest";
import { memoryStore, type Store } from "@blunderstruck/store";
import { vi } from "vitest";
import type { ReportDeps, ReportOptions } from "./run";

// Shared by the report package's tests: invented players, generated games, stub engine and providers.

export const AS_OF = "2026-11-19T12:00:00.000Z";
export const WEEK_LATER = "2026-11-26T12:00:00.000Z";
export const DAY = 24 * 60 * 60 * 1000;
export const PLAYER = "test-knightmare";
export const START_BOARD = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w";

let seq = 0;

/**
 * A short legal game `daysAgo` days before `AS_OF`, the player as White at `rating`. With
 * `thrown` the player draws from the stub engine's winning start (a thrown win); otherwise
 * they win it.
 */
export function game(
  daysAgo: number,
  opts: { timeClass?: ReportTimeClass; rating?: number; thrown?: boolean; asOf?: string } = {},
): GameRecord {
  const n = seq++;
  return {
    id: `lichess:k${String(n).padStart(5, "0")}`,
    platform: "lichess",
    url: `https://lichess.org/k${n}`,
    playedAt: new Date(Date.parse(opts.asOf ?? AS_OF) - daysAgo * DAY).toISOString(),
    rated: true,
    timeClass: opts.timeClass ?? "blitz",
    timeControl: "180+0",
    white: { name: PLAYER, rating: opts.rating ?? 1650 },
    black: { name: "test-opponent", rating: 1650 },
    result: opts.thrown === false ? "white" : "draw",
    pgn: "1. e4 e5 2. Nf3 Nc6 *",
  };
}

/** `count` games evenly between `fromDays` and `toDays` ago, every other one a thrown win. */
export const games = (count: number, fromDays: number, toDays: number, opts: Parameters<typeof game>[1] = {}) =>
  Array.from({ length: count }, (_, i) =>
    game(fromDays + ((toDays - fromDays) * (i + 0.5)) / count, { thrown: i % 2 === 0, ...opts }),
  );

export type StubEvaluator = Evaluator & {
  positions: number;
  /** Positions evaluated at each depth. */
  byDepth: Map<number, number>;
  /** Every `(fen, depth)` evaluated, in order. */
  log: { fen: string; depth: number }[];
  newGames: number;
};

/**
 * Scores the start position as clearly winning for White and everything else as level, so the
 * player's first move (1. e4) of every generated game loses the win and is checked again.
 */
export function stubEvaluator(name = "stub-engine"): StubEvaluator {
  const e: StubEvaluator = {
    name,
    positions: 0,
    byDepth: new Map(),
    log: [],
    newGames: 0,
    async newGame() {
      e.newGames++;
    },
    async evaluate(fen: string, depth: number) {
      e.positions++;
      e.byDepth.set(depth, (e.byDepth.get(depth) ?? 0) + 1);
      e.log.push({ fen, depth });
      return { score: { cp: fen.startsWith(START_BOARD) ? 600 : 0 }, depth };
    },
  };
  return e;
}

/** Forget what the stub engine has counted so far. */
export function resetCounts(e: StubEvaluator): void {
  e.positions = 0;
  e.byDepth.clear();
  e.log.length = 0;
  e.newGames = 0;
}

/** A provider whose every call fails, so the report falls back to template text; calls are counted. */
export function failingProvider(): CoachProvider & { calls: number } {
  const p = {
    name: "anthropic" as const,
    model: "test-model",
    calls: 0,
    async complete(): Promise<never> {
      p.calls++;
      throw new HttpError("rejected request", 400);
    },
  };
  return p;
}

export interface Harness {
  store: Store;
  available: GameRecord[];
  starts: number;
  quits: number;
  evaluator: StubEvaluator;
  fetch: ReturnType<typeof vi.fn>;
  reported: { report: WeeklyReport; pending: number }[];
  deps(over?: Partial<ReportDeps>): ReportDeps;
}

export function harness(available: GameRecord[] = []): Harness {
  const h: Harness = {
    store: memoryStore(),
    available,
    starts: 0,
    quits: 0,
    evaluator: stubEvaluator(),
    reported: [],
    fetch: vi.fn(async (_platform: string, _user: string, opts: { since?: Date } = {}) =>
      h.available.filter((g) => !opts.since || Date.parse(g.playedAt) >= opts.since.getTime()),
    ),
    deps(over = {}) {
      return {
        store: h.store,
        fetchGames: h.fetch as unknown as typeof fetchGames,
        startEngine: async () => {
          h.starts++;
          return { evaluator: h.evaluator, name: h.evaluator.name, quit: async () => void h.quits++ };
        },
        now: () => new Date(AS_OF),
        onReport: (report, info) => h.reported.push({ report, pending: info.pending }),
        ...over,
      };
    },
  };
  return h;
}

export const opts = (over: Partial<ReportOptions> = {}): ReportOptions => ({
  platform: "lichess",
  username: PLAYER,
  depth: 12,
  // The deeper check is off unless a test turns it on, so these runs are those of unchecked reports.
  checkDepth: 0,
  force: false,
  sampleOnly: false,
  asOf: AS_OF,
  ...over,
});

/**
 * A provider that answers every request with valid wording for the pattern ids it is asked
 * for (read from the prompt), or fails from call `failFrom` on; requests are recorded. Its
 * answers pass the coach's wording check (`test-helpers.test.ts`).
 */
export function wordingProvider(failFrom = Infinity): CoachProvider & { calls: number; requests: CompleteRequest[] } {
  const p = {
    name: "anthropic" as const,
    model: "test-model",
    calls: 0,
    requests: [] as CompleteRequest[],
    async complete(req: CompleteRequest) {
      p.calls++;
      p.requests.push(req);
      if (p.calls >= failFrom) throw new HttpError("rejected request", 400);
      const tag = "abcdefghij"[p.calls - 1] ?? "z";
      const asked = /Word these focus items, in this order: ([^.]+)\./.exec(req.user)?.[1];
      const ids = asked ? asked.split(", ") : [];
      const text = JSON.stringify({
        summary: `Over {games} games, about {mistakesPerGame} mistakes a game (answer ${tag}).`,
        focus: ids.map((patternId) => ({
          patternId,
          title: `Model title ${patternId}`,
          why: `In {gamesAffected} of your {games} games (answer ${tag}).`,
          drill: "One model drill.",
        })),
      });
      return { text, usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0 } };
    },
  };
  return p;
}
