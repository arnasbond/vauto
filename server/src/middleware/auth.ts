import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../auth/tokens.js";

export interface AuthedRequest extends Request {
  authUserId?: string;
  authRole?: string;
}

export function optionalAuth(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const payload = verifyAccessToken(header.slice(7));
    if (payload) {
      req.authUserId = payload.sub;
      req.authRole = payload.role;
    }
  }
  if (!req.authUserId && req.headers["x-user-id"]) {
    req.authUserId = String(req.headers["x-user-id"]);
  }
  next();
}

export function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): void {
  optionalAuth(req, res, () => {
    if (!req.authUserId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    next();
  });
}

export function assertUserMatch(
  req: AuthedRequest,
  userId: string
): boolean {
  return Boolean(req.authUserId && req.authUserId === userId);
}
