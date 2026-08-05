import type { Request, Response, NextFunction } from "express";
import type { AuthedRequest } from "./auth.js";
import { optionalAuth, userIsAdmin } from "./auth.js";

/**
 * Protect ops/QA routes (bootstrap, e2e-simulation, purge, …).
 *
 * Stage 0 gate:
 * - NODE_ENV === "development" → open (local only)
 * - otherwise → require X-Vauto-Ops-Secret when VAUTO_OPS_SECRET is set,
 *   OR an authenticated admin JWT
 * - production without VAUTO_OPS_SECRET and without admin → opaque 404
 */
export function requireOpsSecret(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (process.env.NODE_ENV === "development") {
    next();
    return;
  }

  const secret = process.env.VAUTO_OPS_SECRET?.trim();
  const header = req.headers["x-vauto-ops-secret"];
  if (secret && typeof header === "string" && header === secret) {
    next();
    return;
  }

  optionalAuth(req as AuthedRequest, res, () => {
    void (async () => {
      const authed = req as AuthedRequest;
      if (authed.authUserId && (await userIsAdmin(authed))) {
        next();
        return;
      }
      if (!secret) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.status(403).json({ error: "Forbidden" });
    })().catch(() => {
      res.status(404).json({ error: "Not found" });
    });
  });
}
