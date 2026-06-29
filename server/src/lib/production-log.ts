/** Structured production error lines for beta triage (Render logs). */
export function logProductionError(
  scope: string,
  err: unknown,
  context?: Record<string, unknown>
): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(`[VAUTO:${scope}]`, {
    message,
    ...context,
    ...(stack ? { stack } : {}),
  });
}

export function logProductionWarn(
  scope: string,
  message: string,
  context?: Record<string, unknown>
): void {
  console.warn(`[VAUTO:${scope}]`, { message, ...context });
}
