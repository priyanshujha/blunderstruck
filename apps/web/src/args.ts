/** A bad command-line argument: the process prints one line and exits 2. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

/** `--port`: decimal digits only, 0 to 65535. */
export function parsePort(value: string): number {
  const port = /^\d{1,5}$/.test(value) ? Number(value) : NaN;
  if (!(port >= 0 && port <= 65535)) throw new UsageError(`--port must be a whole number from 0 to 65535, not ${JSON.stringify(value)}`);
  return port;
}
