import { describe, expect, it } from "vitest";
import { NO_KEY_MESSAGE, resolveProvider } from "./keys";
import { ConfigError } from "./provider";

const A_KEY = "sk-test-anthropic-0123456789";
const G_KEY = "gm-test-gemini-0123456789";
const G_MODEL = { BLUNDERSTRUCK_GEMINI_SMART_MODEL: "gemini-test-smart" };

function thrown(fn: () => unknown): Error {
  try {
    fn();
  } catch (err) {
    return err as Error;
  }
  throw new Error("expected a throw");
}

describe("resolveProvider", () => {
  it("prefers the flag over the variable and over detected keys", () => {
    const env = { ANTHROPIC_API_KEY: A_KEY, GEMINI_API_KEY: G_KEY, BLUNDERSTRUCK_PROVIDER: "anthropic", ...G_MODEL };
    const r = resolveProvider({ env, flag: "gemini" });
    expect(r).toMatchObject({ kind: "gemini", apiKey: G_KEY, choice: { model: "gemini-test-smart" } });
  });

  it("uses BLUNDERSTRUCK_PROVIDER when there is no flag", () => {
    const env = { ANTHROPIC_API_KEY: A_KEY, GEMINI_API_KEY: G_KEY, BLUNDERSTRUCK_PROVIDER: "gemini", ...G_MODEL };
    expect(resolveProvider({ env }).kind).toBe("gemini");
  });

  it("picks Anthropic when its key is set and nothing is named", () => {
    const r = resolveProvider({ env: { ANTHROPIC_API_KEY: A_KEY, GEMINI_API_KEY: G_KEY, ...G_MODEL } });
    expect(r).toMatchObject({
      kind: "anthropic",
      apiKey: A_KEY,
      choice: { model: "claude-sonnet-5-5", effort: "medium", maxOutputTokens: 2000 },
    });
  });

  it("falls back to Gemini, and to GOOGLE_API_KEY for its key", () => {
    expect(resolveProvider({ env: { GEMINI_API_KEY: G_KEY, ...G_MODEL } })).toMatchObject({
      kind: "gemini",
      apiKey: G_KEY,
    });
    expect(resolveProvider({ env: { GOOGLE_API_KEY: G_KEY, ...G_MODEL } })).toMatchObject({
      kind: "gemini",
      apiKey: G_KEY,
    });
  });

  it("returns none with the no-key message when no key is set", () => {
    expect(resolveProvider({ env: {} })).toEqual({ kind: "none", message: NO_KEY_MESSAGE });
    expect(resolveProvider({ env: { ANTHROPIC_API_KEY: "  " } }).kind).toBe("none");
  });

  it("returns none when turned off by flag or variable, even with keys set", () => {
    expect(resolveProvider({ env: { ANTHROPIC_API_KEY: A_KEY }, flag: "none" }).kind).toBe("none");
    expect(resolveProvider({ env: { ANTHROPIC_API_KEY: A_KEY, BLUNDERSTRUCK_PROVIDER: "none" } }).kind).toBe("none");
  });

  it("throws ConfigError when an explicitly named provider has no key", () => {
    const byFlag = thrown(() => resolveProvider({ env: { GEMINI_API_KEY: G_KEY }, flag: "anthropic" }));
    expect(byFlag).toBeInstanceOf(ConfigError);
    expect(byFlag.message).toContain("ANTHROPIC_API_KEY");
    expect(byFlag.message).not.toContain(G_KEY);

    const byEnv = thrown(() =>
      resolveProvider({ env: { ANTHROPIC_API_KEY: A_KEY, BLUNDERSTRUCK_PROVIDER: "gemini", ...G_MODEL } }),
    );
    expect(byEnv).toBeInstanceOf(ConfigError);
    expect(byEnv.message).toContain("GEMINI_API_KEY");
    expect(byEnv.message).not.toContain(A_KEY);
  });

  it("throws ConfigError naming BLUNDERSTRUCK_GEMINI_SMART_MODEL when Gemini has no model", () => {
    for (const input of [
      { env: { GEMINI_API_KEY: G_KEY } },
      { env: { GEMINI_API_KEY: G_KEY }, flag: "gemini" as const },
    ]) {
      const err = thrown(() => resolveProvider(input));
      expect(err).toBeInstanceOf(ConfigError);
      expect(err.message).toContain("BLUNDERSTRUCK_GEMINI_SMART_MODEL");
      expect(err.message).not.toContain(G_KEY);
    }
  });

  it("rejects an unknown BLUNDERSTRUCK_PROVIDER value", () => {
    expect(() => resolveProvider({ env: { BLUNDERSTRUCK_PROVIDER: "other" } })).toThrow(ConfigError);
  });
});
