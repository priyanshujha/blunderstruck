/** `pnpm web <platform> <user>`: serve the latest report on this machine only. */
async function main(): Promise<void> {
  throw new Error("not implemented");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
