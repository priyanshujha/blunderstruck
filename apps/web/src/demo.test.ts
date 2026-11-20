import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEMO_DATA } from "./demo-data";
import { DEMO_NOTE, DEMO_TRACK, demoStore } from "./demo";
import { createHandler } from "./server";
import { demoData } from "./test-report";

describe("the demo", () => {
  it("is exactly what the story builder gives for its fixture games", async () => {
    const built = await demoData();
    if (process.env.UPDATE_DEMO) {
      writeFileSync(
        new URL("./demo-data.ts", import.meta.url),
        "// Written by demo.test.ts from fixture games through the real story builder (UPDATE_DEMO=1 pnpm test apps/web).\n" +
          "// An invented player; do not edit by hand.\n" +
          `export const DEMO_DATA: { reports: unknown[]; weeks: unknown[] } = ${JSON.stringify(built, null, 1)};\n`,
      );
    }
    expect(DEMO_DATA).toEqual(built);
    const latest = built.reports.at(-1)!;
    const paid = latest.focus.flatMap((f) => f.examples).map((e) => e.story?.inGame?.paid === true);
    expect(paid).toContain(true);
    expect(paid).toContain(false);
    expect(latest.progress.length).toBeGreaterThan(0);
    expect(latest.focus.every((f) => f.blindSpots.length > 0 && f.steps.length > 0)).toBe(true);
  });

  it("serves a whole page from memory, said to be made up, with nothing undefined", async () => {
    const store = await demoStore();
    const h = createHandler(store, DEMO_TRACK, { header: DEMO_NOTE });
    const body = await new Promise<string>((resolve) => {
      const res = { headersSent: false, writeHead() { return this; }, end(b?: Buffer) { resolve(b?.toString() ?? ""); return this; } };
      h({ method: "GET", url: "/", headers: { host: "127.0.0.1:4477" } } as never, res as never);
    });
    expect(body).toContain("A made-up example.");
    expect(body).toContain(DEMO_TRACK.username);
    expect(body).toMatch(/<article class="ex" id="ex-1-1"[^>]*data-b=/);
    expect(body).toContain("All reports");
    expect(body).not.toMatch(/undefined|NaN|\[object/);
  });
});
