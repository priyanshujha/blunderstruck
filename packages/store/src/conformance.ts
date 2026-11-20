import type { Store } from "./store";

/** Behaviour every `Store` must have; run it against each implementation. */
export function storeConformance(make: () => Promise<Store>): void {
  throw new Error("not implemented");
}
