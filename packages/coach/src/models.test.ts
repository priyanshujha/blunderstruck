import { describe, expect, it } from "vitest";
import { COACH_ROUTES, pickModel } from "./models";

describe("pickModel", () => {
  it("sends judgment to the smart tier and mechanical text to the fast tier", () => {
    expect(pickModel("weekly-plan", "anthropic", {})).toMatchObject({
      model: "claude-opus-5-5",
      effort: "medium",
      maxOutputTokens: 4000,
    });
    expect(pickModel("position-explainer", "anthropic", {}).model).toBe("claude-haiku-5-5");
    expect(pickModel("progress-note", "anthropic", {}).model).toBe("claude-haiku-5-5");
  });

  it("lets a per-task env var override either provider", () => {
    const env = { BLUNDERSTRUCK_MODEL_WEEKLY_PLAN: "my-model" };
    expect(pickModel("weekly-plan", "anthropic", env).model).toBe("my-model");
    expect(pickModel("weekly-plan", "gemini", env).model).toBe("my-model");
  });

  it("defaults the Gemini smart tier, lets its variable override it, and requires the fast tier id", () => {
    expect(pickModel("weekly-plan", "gemini", {}).model).toBe("gemini-3.8-flash");
    expect(pickModel("weekly-plan", "gemini", { BLUNDERSTRUCK_GEMINI_SMART_MODEL: "g-smart" }).model).toBe("g-smart");
    expect(() => pickModel("progress-note", "gemini", {})).toThrow(/BLUNDERSTRUCK_GEMINI_FAST_MODEL/);
    expect(
      pickModel("progress-note", "gemini", { BLUNDERSTRUCK_GEMINI_FAST_MODEL: "g-fast" }).model,
    ).toBe("g-fast");
  });

  it("lists both providers in COACH_ROUTES", () => {
    expect(COACH_ROUTES["weekly-plan"]).toMatchObject({ anthropic: "claude-opus-5-5", gemini: "gemini-3.8-flash" });
    expect(COACH_ROUTES["progress-note"].gemini).toBe("BLUNDERSTRUCK_GEMINI_FAST_MODEL");
  });
});
