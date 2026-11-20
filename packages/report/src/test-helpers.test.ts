import { parseWording } from "@blunderstruck/coach";
import type { ReportDraft } from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import { runReport } from "./run";
import { games, harness, opts, wordingProvider } from "./test-helpers";

describe("wordingProvider", () => {
  it("answers with wording the coach's check accepts, for a first plan and a reword", async () => {
    const h = harness(games(20, 0.5, 29));
    const r = (await runReport(h.deps(), opts())).report!;
    expect(r.focus.length).toBeGreaterThan(0);
    const { summary: _s, wording: _w, ...draft } = r;
    const ids = r.focus.map((f) => f.patternId);
    const provider = wordingProvider();
    for (const only of [undefined, ids.slice(-1)]) {
      const ask = `Word these focus items, in this order: ${(only ?? ids).join(", ")}.`;
      const { text } = await provider.complete({ system: "", user: ask } as never);
      const parsed = parseWording(text, draft as unknown as ReportDraft, only);
      expect(parsed.ok ? [] : parsed.errors).toEqual([]);
    }
  });
});
