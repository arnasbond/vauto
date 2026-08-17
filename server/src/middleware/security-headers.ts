import type { Request, Response, NextFunction } from "express";

const NO_STORE_PREFIXES = [
  "/api/auth",
  "/api/users",
  "/api/admin",
  "/api/ops",
  "/api/payment-methods",
  "/api/chats",
  "/api/transactions",
  "/api/reports",
];

/**
 * Browser/API hardening headers. CSP is frame-ancestors only so we do not
 * break Google OAuth, Cloudinary, or the static Vercel frontend.
 */
export function securityHeaders(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }
  const path = req.path || "";
  if (NO_STORE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
  }
  next();
}
