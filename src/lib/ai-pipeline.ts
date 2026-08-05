/**
 * VAUTO client AI pipeline (P6c).
 *
 * Production order:
 *   1. Render /api/vauto-server + /api/vauto-agent (isAiProxyAvailable)
 *   2. Dev-only browser Gemini (NEXT_PUBLIC_DEV_GEMINI=1 + API key) — NEVER in production builds
 *   3. Offline mocks (local dev without backend only)
 */
import { isAiProxyAvailable } from "@/lib/api/config";

/**
 * Local offline dev escape hatch.
 * Production Next builds inline NODE_ENV=production — browser Gemini stays off
 * even if NEXT_PUBLIC_DEV_GEMINI / NEXT_PUBLIC_GEMINI_API_KEY were mis-set on Vercel.
 */
export function isDevClientGeminiEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.NEXT_PUBLIC_DEV_GEMINI === "1";
}

/** True when neither server proxy nor dev Gemini is configured. */
export function shouldUseOfflineAiMocks(): boolean {
  return !isAiProxyAvailable() && !isDevClientGeminiEnabled();
}
