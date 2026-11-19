import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { Score } from "@blunderstruck/contracts";

export interface EngineOptions {
  /** Stockfish binary. Defaults to $STOCKFISH_PATH, then `stockfish` on PATH. */
  path?: string;
  threads?: number;
  hashMb?: number;
}

export interface EvalResult {
  /** From the side to move's point of view, as UCI reports it. */
  score: Score;
  depth: number;
  bestMove?: string;
}

/** One Stockfish process, driven over UCI. Calls must not overlap: await each one. */
export class UciEngine {
  name = "stockfish";
  private onLine: ((line: string) => void) | undefined;
  private exited = false;

  private constructor(private readonly proc: ChildProcessWithoutNullStreams) {
    createInterface({ input: proc.stdout }).on("line", (line) => this.onLine?.(line.trim()));
    proc.on("exit", () => {
      this.exited = true;
    });
  }

  static async start(opts: EngineOptions = {}): Promise<UciEngine> {
    const path = opts.path ?? process.env.STOCKFISH_PATH ?? "stockfish";
    const proc = spawn(path, [], { stdio: ["pipe", "pipe", "pipe"] });
    await new Promise<void>((resolve, reject) => {
      proc.once("spawn", resolve);
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

  /** Fixed depth, so the same position always gets the same answer on one thread. */
  async evaluate(fen: string, depth: number): Promise<EvalResult> {
    let score: Score = { cp: 0 };
    let seenDepth = 0;
    let bestMove: string | undefined;
    this.send(`position fen ${fen}`);
    await this.until(`go depth ${depth}`, (l) => {
      if (l.startsWith("info ") && !l.includes(" upperbound") && !l.includes(" lowerbound")) {
        const m = / depth (\d+) .*? score (cp|mate) (-?\d+)/.exec(l);
        if (m) {
          seenDepth = Number(m[1]);
          score = m[2] === "cp" ? { cp: Number(m[3]) } : { mate: Number(m[3]) };
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
    return { score, depth: seenDepth, bestMove };
  }

  async quit(): Promise<void> {
    if (this.exited) return;
    this.send("quit");
    await new Promise<void>((resolve) => this.proc.once("exit", () => resolve()));
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
