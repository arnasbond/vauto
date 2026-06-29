import rateLimit from "express-rate-limit";
import type { AuthedRequest } from "./auth.js";

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = Number(process.env.API_RATE_LIMIT_PER_MIN ?? 10);

function rateLimitKey(req: AuthedRequest): string {
  if (req.authUserId) return `user:${req.authUserId}`;
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return `ip:${forwarded.split(",")[0]!.trim()}`;
  }
  return `ip:${req.ip ?? "unknown"}`;
}

function shouldSkipRateLimit(path: string): boolean {
  if (path === "/api/health" || path === "/api/ai/health") return true;
  if (path.startsWith("/api/billing/webhook")) return true;
  return false;
}

/** Per-user (or IP) cap — protects Render free tier from AI/search bursts. */
export const apiRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_REQUESTS_PER_WINDOW,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKey(req as AuthedRequest),
  skip: (req) => shouldSkipRateLimit(req.path),
  handler: (_req, res) => {
    res.status(429).json({
      ok: false,
      code: "rate_limit_exceeded",
      error: "Per daug užklausų per minutę. Palaukite ir bandykite dar kartą.",
    });
  },
});

/** Stricter cap for Gemini-heavy routes (vision, auto-fill, agent). */
export const aiRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: Math.max(3, Math.floor(MAX_REQUESTS_PER_WINDOW * 0.6)),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKey(req as AuthedRequest),
  handler: (_req, res) => {
    res.status(429).json({
      ok: false,
      code: "ai_rate_limit_exceeded",
      error: "AI užklausų limitas pasiektas. Bandykite po minutės.",
    });
  },
});
