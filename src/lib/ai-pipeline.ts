/**
 * VAUTO client AI pipeline (P6c).
 *
 * Production order:
 *   1. Render /api/vauto-server + /api/vauto-agent (isAiProxyAvailable)
 *   2. Dev-only browser Gemini (NEXT_PUBLIC_DEV_GEMINI=1 + API key)
 *   3. Offline mocks (local dev without backend only)
 */
import { isAiProxyAvailable } from "@/lib/api/config";

/** Local offline dev — never enable in production builds. */
export function isDevClientGeminiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEV_GEMINI === "1";
}

/** True when neither server proxy nor dev Gemini is configured. */
export function shouldUseOfflineAiMocks(): boolean {
  return !isAiProxyAvailable() && !isDevClientGeminiEnabled();
}
