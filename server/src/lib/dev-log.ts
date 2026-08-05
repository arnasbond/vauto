/**
 * Development-only console helpers for the API server.
 * Production: log/info/debug are no-ops (PII / prompt / OTP leak prevention).
 * Use logProductionError / logProductionWarn for structured ops alerts.
 */

type LogArgs = Parameters<typeof console.log>;

function isNodeProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function isDevRuntime(): boolean {
  return !isNodeProduction();
}

export function devLog(...args: LogArgs): void {
  if (!isNodeProduction()) console.log(...args);
}

export function devInfo(...args: LogArgs): void {
  if (!isNodeProduction()) console.info(...args);
}

export function devDebug(...args: LogArgs): void {
  if (!isNodeProduction()) console.debug(...args);
}

/** Mute console.log/info/debug when NODE_ENV=production (keeps warn/error). */
export function silenceProductionConsole(): void {
  if (!isNodeProduction()) return;
  const noop = () => undefined;
  console.log = noop;
  console.info = noop;
  console.debug = noop;
}
