import { describe, expect, it } from "vitest";
import { pickModel } from "./models";

describe("pickModel", () => {
  it("sends judgment to the smart tier and mechanical text to the fast tier", () => {
    expect(pickModel("weekly-plan", "anthropic", {})).toMatchObject({
      model: "claude-sonnet-5-5",
      effort: "medium",
    });
    expect(pickModel("position-explainer", "anthropic", {}).model).toBe("claude-haiku-5-5");
    expect(pickModel("progress-note", "anthropic", {}).model).toBe("claude-haiku-5-5");
  });

  it("lets a per-task env var override either provider", () => {
    const env = { BLUNDERSTRUCK_MODEL_WEEKLY_PLAN: "my-model" };
    expect(pickModel("weekly-plan", "anthropic", env).model).toBe("my-model");
    expect(pickModel("weekly-plan", "gemini", env).model).toBe("my-model");
  });

  it("requires Gemini tier ids from the environment", () => {
    expect(() => pickModel("weekly-plan", "gemini", {})).toThrow(/BLUNDERSTRUCK_GEMINI_SMART_MODEL/);
    expect(
      pickModel("progress-note", "gemini", { BLUNDERSTRUCK_GEMINI_FAST_MODEL: "g-fast" }).model,
    ).toBe("g-fast");
  });
});
