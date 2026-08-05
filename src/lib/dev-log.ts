/**
 * Development-only console helpers.
 * In production, log/info/debug are no-ops to avoid leaking PII, prompts, or OTP.
 * Prefer logProductionError / logProductionWarn (server) for operational alerts.
 */

const isProd =
  typeof process !== "undefined" && process.env.NODE_ENV === "production";

type LogArgs = Parameters<typeof console.log>;

export function isDevRuntime(): boolean {
  return !isProd;
}

export function devLog(...args: LogArgs): void {
  if (!isProd) console.log(...args);
}

export function devInfo(...args: LogArgs): void {
  if (!isProd) console.info(...args);
}

export function devDebug(...args: LogArgs): void {
  if (!isProd) console.debug(...args);
}

/** Mute noisy console.log/info/debug in production (keeps warn/error). */
export function silenceProductionConsole(): void {
  if (!isProd) return;
  const noop = () => undefined;
  console.log = noop;
  console.info = noop;
  console.debug = noop;
}
