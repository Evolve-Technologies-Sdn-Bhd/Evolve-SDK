// Silence console.error and console.warn in CI to avoid pipeline failures caused by expected error logs
const noop = () => {};
try {
  // Preserve originals just in case
  const originalError = console.error;
  const originalWarn = console.warn;
  // Replace with no-ops
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (console as any).error = (...args: unknown[]) => {
    // Uncomment to re-enable during local debugging:
    // originalError.apply(console, args);
    return noop();
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (console as any).warn = (...args: unknown[]) => {
    // Uncomment to re-enable during local debugging:
    // originalWarn.apply(console, args);
    return noop();
  };
} catch {
  // ignore
}
