/** Safe HTTP error helpers — never leak stacks / DB internals to clients. */

import type { Response } from "express";
import { logProductionError } from "./production-log.js";

export function sendInternalError(
  res: Response,
  err: unknown,
  scope = "api"
): void {
  logProductionError(scope, err);
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Return a short client-safe message for expected 4xx domain errors.
 * Rejects stack traces, SQL/pg noise, and overly long SDK dumps.
 */
export function safeDomainMessage(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined;
  const msg = err.message?.trim() ?? "";
  if (!msg) return undefined;
  if (msg.length > 240) return undefined;
  if (/at\s+\S+\s+\(|node_modules|\\n\s*at\s+/i.test(msg)) return undefined;
  if (/password|secret|api[_-]?key|token|stack/i.test(msg)) return undefined;
  if (
    /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|postgres|sqlstate|relation\s+".+"\s+does not exist|syntax error/i.test(
      msg
    )
  ) {
    return undefined;
  }
  return msg;
}

export const PAYMENTS_UNAVAILABLE =
  "Payments temporarily unavailable";
