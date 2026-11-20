import { type ChildProcessByStdio, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import type { Score } from "@blunderstruck/contracts";

export interface EngineOptions {
  /** Stockfish binary. Defaults to $STOCKFISH_PATH, then `stockfish` on PATH. */
  path?: string;
  threads?: number;
  hashMb?: number;
}

export interface EvalResult {
  /**
   * From the side to move's point of view, as UCI reports it. `{ mate: 0 }` means the side
   * to move is already checkmated; `{ cp: 0 }` at depth 0 is stalemate.
   */
  score: Score;
  depth: number;
  bestMove?: string;
  /** Main line (UCI) from the same info line that set `score`. May disagree with `bestMove`. */
  pv?: string[];
}

export interface InfoLine {
  depth: number;
  score: Score;
  pv?: string[];
}

/**
 * Reads one UCI "info" line. Returns undefined for anything that does not carry an exact score:
 * other output, "info string ..." and lines marked upperbound or lowerbound (aspiration-window
 * fail-highs and fail-lows, whose score and pv are provisional).
 */
export function parseInfoLine(line: string): InfoLine | undefined {
  if (!line.startsWith("info ") || / (upper|lower)bound\b/.test(line)) return undefined;
  // "info depth 0 score mate 0" (checkmated) has nothing between depth and score.
  const m = /\bdepth (\d+)\b.*?\bscore (cp|mate) (-?\d+)/.exec(line);
  if (!m) return undefined;
  const info: InfoLine = {
    depth: Number(m[1]),
    score: m[2] === "cp" ? { cp: Number(m[3]) } : { mate: Number(m[3]) },
  };
  const pv = / pv (.+)$/.exec(line)?.[1]?.trim().split(/\s+/);
  if (pv && pv.length > 0) info.pv = pv;
  return info;
}

/** Every engine process still running, so none outlives this process. */
const live = new Set<ChildProcessByStdio<Writable, Readable, null>>();
let exitHookInstalled = false;

function killAll(): void {
  for (const proc of live) proc.kill("SIGKILL");
  live.clear();
}

/**
 * One Stockfish process, driven over UCI. Calls must not overlap: await each one.
 *
 * On POSIX the process runs in its own process group, so a Ctrl-C in the terminal reaches only
 * this program, which can then stop between games and `quit()` the engine itself. It is never
 * left behind: it is killed when this process exits, and Stockfish quits on end of input if
 * this process dies without exiting cleanly.
 */
export class UciEngine {
  name = "stockfish";
  private onLine: ((line: string) => void) | undefined;
  private exited = false;

  private constructor(private readonly proc: ChildProcessByStdio<Writable, Readable, null>) {
    createInterface({ input: proc.stdout }).on("line", (line) => this.onLine?.(line.trim()));
    proc.on("exit", () => {
      this.exited = true;
      live.delete(proc);
    });
    // A write to a dead engine must surface as the pending call's rejection, not crash the process.
    proc.stdin.on("error", () => {});
  }

  static async start(opts: EngineOptions = {}): Promise<UciEngine> {
    const path = opts.path ?? process.env.STOCKFISH_PATH ?? "stockfish";
    const proc = spawn(path, [], { stdio: ["pipe", "pipe", "ignore"], detached: process.platform !== "win32" });
    await new Promise<void>((resolve, reject) => {
      proc.once("spawn", () => {
        live.add(proc);
        if (!exitHookInstalled) {
          process.once("exit", killAll);
          exitHookInstalled = true;
        }
        resolve();
      });
      proc.once("error", (err) =>
        reject(new Error(`could not start Stockfish at "${path}" (set STOCKFISH_PATH): ${err.message}`)),
      );
    });
    const engine = new UciEngine(proc);
    await engine.until("uci", (l) => {
      if (l.startsWith("id name ")) engine.name = l.slice("id name ".length);
      return l === "uciok";
    });
    engine.send(`setoption name Threads value ${opts.threads ?? 1}`);
    engine.send(`setoption name Hash value ${opts.hashMb ?? 64}`);
    await engine.until("isready", (l) => l === "readyok");
    return engine;
  }

  /**
   * Clears the hash table. Search results depend on what the engine has already searched, so
   * call this before each game: then one thread at a fixed depth gives the same answers for
   * the same game every time.
   */
  async newGame(): Promise<void> {
    this.send("ucinewgame");
    await this.until("isready", (l) => l === "readyok");
  }

  async evaluate(fen: string, depth: number): Promise<EvalResult> {
    let score: Score = { cp: 0 };
    let seenDepth = 0;
    let bestMove: string | undefined;
    let pv: string[] | undefined;
    this.send(`position fen ${fen}`);
    await this.until(`go depth ${depth}`, (l) => {
      if (l.startsWith("info ")) {
        const info = parseInfoLine(l);
        if (info) {
          seenDepth = info.depth;
          score = info.score;
          pv = info.pv;
        }
        return false;
      }
      if (l.startsWith("bestmove")) {
        const mv = l.split(" ")[1];
        bestMove = mv && mv !== "(none)" ? mv : undefined;
        return true;
      }
      return false;
    });
    return { score, depth: seenDepth, bestMove, pv };
  }

  async quit(): Promise<void> {
    if (this.exited) return;
    this.send("quit");
    await new Promise<void>((resolve) => this.proc.once("exit", () => resolve()));
  }

  /** Stop the engine at once, without waiting for it; for a forced exit. */
  kill(): void {
    if (this.exited) return;
    this.proc.kill("SIGKILL");
    live.delete(this.proc);
  }

  private send(cmd: string): void {
    this.proc.stdin.write(`${cmd}\n`);
  }

  private until(cmd: string, done: (line: string) => boolean): Promise<void> {
    if (this.exited) return Promise.reject(new Error("Stockfish has exited"));
    return new Promise<void>((resolve, reject) => {
      const onExit = () => reject(new Error(`Stockfish exited during "${cmd}"`));
      this.proc.once("exit", onExit);
      this.onLine = (line) => {
        if (!done(line)) return;
        this.onLine = undefined;
        this.proc.off("exit", onExit);
        resolve();
      };
      this.send(cmd);
    });
  }
}
