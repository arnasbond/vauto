import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../auth/tokens.js";
import { getUser } from "../repository.js";

export interface AuthedRequest extends Request {
  authUserId?: string;
  authRole?: string;
  authSource?: "bearer" | "legacy-header";
}

function adminEmail(): string {
  return (process.env.ADMIN_EMAIL ?? "admin@vauto.com").toLowerCase();
}

function allowLegacyUserHeader(): boolean {
  return (
    process.env.ALLOW_LEGACY_USER_HEADER === "true" ||
    process.env.NODE_ENV !== "production"
  );
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
      req.authSource = "bearer";
    }
  }
  if (!req.authUserId && req.headers["x-user-id"] && allowLegacyUserHeader()) {
    req.authUserId = String(req.headers["x-user-id"]);
    req.authSource = "legacy-header";
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

export async function userIsAdmin(req: AuthedRequest): Promise<boolean> {
  if (req.authRole === "admin") return true;
  if (!req.authUserId) return false;
  const user = await getUser(req.authUserId);
  return user?.email?.toLowerCase() === adminEmail();
}

export function requireAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): void {
  requireAuth(req, res, () => {
    void (async () => {
      if (await userIsAdmin(req)) {
        req.authRole = "admin";
        next();
        return;
      }
      res.status(403).json({ error: "Admin access required" });
    })();
  });
}

export function assertUserMatch(
  req: AuthedRequest,
  userId: string
): boolean {
  return Boolean(req.authUserId && req.authUserId === userId);
}
