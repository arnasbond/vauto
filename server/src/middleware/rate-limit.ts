import rateLimit from "express-rate-limit";
import type { AuthedRequest } from "./auth.js";

const WINDOW_MS = 60 * 1000;
const DEFAULT_API_LIMIT = 30;
const DEFAULT_AUTH_LIMIT = 30;
const DEFAULT_AI_LIMIT = 8;

const MAX_REQUESTS_PER_WINDOW = Number(
  process.env.API_RATE_LIMIT_PER_MIN ?? DEFAULT_API_LIMIT
);
const AUTH_REQUESTS_PER_WINDOW = Number(
  process.env.AUTH_RATE_LIMIT_PER_MIN ?? DEFAULT_AUTH_LIMIT
);
const AI_REQUESTS_PER_WINDOW = Number(
  process.env.AI_RATE_LIMIT_PER_MIN ?? DEFAULT_AI_LIMIT
);

function rateLimitKey(req: AuthedRequest): string {
  if (req.authUserId) return `user:${req.authUserId}`;
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return `ip:${forwarded.split(",")[0]!.trim()}`;
  }
  return `ip:${req.ip ?? "unknown"}`;
}

/** General API limiter skips auth + heavy AI — those have dedicated limiters. */
function shouldSkipGeneralRateLimit(path: string): boolean {
  if (path === "/api/health" || path === "/api/ai/health") return true;
  if (path.startsWith("/api/proxy")) return true;
  if (path.startsWith("/api/billing/webhook")) return true;
  if (path.startsWith("/api/auth")) return true;
  if (path.startsWith("/api/ai")) return true;
  if (path.startsWith("/api/vauto-server")) return true;
  if (path.startsWith("/api/vauto-agent")) return true;
  return false;
}

function rateLimitHandler(code: string, message: string) {
  return (_req: unknown, res: { status: (n: number) => { json: (b: object) => void } }) => {
    res.status(429).json({ ok: false, code, error: message });
  };
}

/** Normal browsing: listings, profile, chats — 30/min default. */
export const apiRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_REQUESTS_PER_WINDOW,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKey(req as AuthedRequest),
  skip: (req) => shouldSkipGeneralRateLimit(req.path),
  handler: rateLimitHandler(
    "rate_limit_exceeded",
    "Per daug užklausų per minutę. Palaukite ir bandykite dar kartą."
  ),
});

/** Login, OTP, social auth — generous cap so startup burst does not block sign-in. */
export const authRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: AUTH_REQUESTS_PER_WINDOW,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKey(req as AuthedRequest),
  handler: rateLimitHandler(
    "auth_rate_limit_exceeded",
    "Per daug prisijungimo bandymų. Palaukite minutę ir bandykite dar kartą."
  ),
});

/** Gemini-heavy routes only — strict cap (8/min default). */
export const aiRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: AI_REQUESTS_PER_WINDOW,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKey(req as AuthedRequest),
  handler: rateLimitHandler(
    "ai_rate_limit_exceeded",
    "AI užklausų limitas pasiektas. Bandykite po minutės."
  ),
});
