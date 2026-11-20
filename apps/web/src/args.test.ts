import { describe, expect, it } from "vitest";
import { UsageError, parsePort, parseWebArgs } from "./args";

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

describe("parseWebArgs", () => {
  it("reads a player, and --demo on its own", () => {
    expect(parseWebArgs(["lichess", "quiet_rook_test", "--db", "x.db", "--port", "5000"])).toEqual({ demo: false, platform: "lichess", user: "quiet_rook_test", port: 5000, db: "x.db" });
    expect(parseWebArgs(["--demo"])).toEqual({ demo: true, port: 4321 });
    expect(parseWebArgs(["--demo", "--port", "4477"])).toEqual({ demo: true, port: 4477 });
  });

  it("refuses --demo with a database, a player or other settings", () => {
    for (const bad of [["--demo", "--db", "x.db"], ["--demo", "lichess", "someone"], ["--demo", "--time-class", "blitz"], ["--demo", "--env", ".env"]]) {
      expect(() => parseWebArgs(bad), bad.join(" ")).toThrow(UsageError);
    }
    expect(() => parseWebArgs(["--demo", "--db", "x.db"])).toThrow(/--demo .* takes no --db/);
    expect(() => parseWebArgs([])).toThrow(UsageError);
  });
});
