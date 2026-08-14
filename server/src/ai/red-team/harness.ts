/**
 * Red Team harness helpers — fail-closed provider simulation, schema fuzz corpus.
 * Etapas 10I only — no new product features.
 */

import { z } from "zod";

export type ProviderFailureMode =
  | "down"
  | "timeout"
  | "http_429"
  | "http_500"
  | "malformed_json"
  | "empty";

export async function simulateProviderCall(
  mode: ProviderFailureMode
): Promise<{ ok: false; errorCode: string; fallbackRequired: true }> {
  switch (mode) {
    case "down":
      return { ok: false, errorCode: "provider_down", fallbackRequired: true };
    case "timeout":
      return { ok: false, errorCode: "provider_timeout", fallbackRequired: true };
    case "http_429":
      return { ok: false, errorCode: "provider_429", fallbackRequired: true };
    case "http_500":
      return { ok: false, errorCode: "provider_500", fallbackRequired: true };
    case "malformed_json":
      return { ok: false, errorCode: "provider_malformed", fallbackRequired: true };
    case "empty":
      return { ok: false, errorCode: "provider_empty", fallbackRequired: true };
  }
}

/** Values that must never silently become valid business numbers. */
export const FUZZ_NUMERIC_CORPUS: unknown[] = [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  -1,
  -0.0001,
  1e308,
  "NaN",
  "Infinity",
  null,
  undefined,
  {},
  [],
  true,
  false,
  "1e999",
];

export const FUZZ_PROTOTYPE_POLLUTION_KEYS = [
  "__proto__",
  "constructor",
  "prototype",
] as const;

export function assertZodRejects(schema: z.ZodTypeAny, value: unknown): boolean {
  const r = schema.safeParse(value);
  return !r.success;
}

/**
 * Pipeline fact-lock: every listing id in output must be subset of authorized set.
 */
export function assertNoHallucinatedIds(
  outputIds: string[],
  authorizedIds: ReadonlySet<string> | string[]
): boolean {
  const auth = authorizedIds instanceof Set ? authorizedIds : new Set(authorizedIds);
  return outputIds.every((id) => auth.has(id));
}
