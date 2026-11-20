import { describe, expect, it } from "vitest";
import { UsageError, parsePort } from "./args";

describe("parsePort", () => {
  it("accepts decimal digits from 0 to 65535", () => {
    expect(parsePort("0")).toBe(0);
    expect(parsePort("4321")).toBe(4321);
    expect(parsePort("65535")).toBe(65535);
  });

  it("refuses anything else", () => {
    for (const bad of ["", "65536", "-1", "1e3", "0x10", " 80", "80 ", "4321.0", "+80", "abc", "123456"]) {
      expect(() => parsePort(bad), bad).toThrow(UsageError);
    }
  });
});
