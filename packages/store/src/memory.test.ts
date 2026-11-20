import { describe } from "vitest";
import { storeConformance } from "./conformance";
import { memoryStore } from "./memory";

describe("memoryStore", () => {
  storeConformance(async () => memoryStore());
});
