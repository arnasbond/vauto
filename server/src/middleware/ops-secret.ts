import type { Request, Response, NextFunction } from "express";

/** Protect ops/QA routes in production — requires X-Vauto-Ops-Secret header. */
export function requireOpsSecret(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (process.env.NODE_ENV !== "production") {
    next();
    return;
  }

  const secret = process.env.VAUTO_OPS_SECRET?.trim();
  if (!secret) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const header = req.headers["x-vauto-ops-secret"];
  if (typeof header !== "string" || header !== secret) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  next();
}
