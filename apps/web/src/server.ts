import type { IncomingMessage, ServerResponse } from "node:http";
import type { Track } from "@blunderstruck/contracts";
import type { Store } from "@blunderstruck/store";

/** The request handler for one track: the latest report, an earlier one, or its JSON. */
export function handler(store: Store, track: Track): (req: IncomingMessage, res: ServerResponse) => void {
  throw new Error("not implemented");
}
