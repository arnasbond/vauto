import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../auth/tokens.js";
import { getUser } from "../repository.js";
import {
  isAllowlistedAdminEmail,
  shouldElevateToSuperAdmin,
} from "../lib/admin-allowlist.js";

export interface AuthedRequest extends Request {
  authUserId?: string;
  authRole?: string;
  authSource?: "bearer" | "legacy-header";
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

export const AUTH_SESSION_EXPIRED_MESSAGE =
  "Prisijungimas nebegalioja. Prašome prisijungti iš naujo.";

export function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): void {
  optionalAuth(req, res, () => {
    if (!req.authUserId) {
      res.status(401).json({ error: AUTH_SESSION_EXPIRED_MESSAGE });
      return;
    }
    next();
  });
}

export async function userIsAdmin(req: AuthedRequest): Promise<boolean> {
  if (!req.authUserId) return false;
  const roleOk =
    req.authRole === "super_admin" || req.authRole === "admin";
  if (req.authUserId === "admin-1" && roleOk) return true;
  if (req.authRole === "super_admin") return true;
  const user = await getUser(req.authUserId);
  if (!user) return false;
  if (user.role === "super_admin") return true;
  const emailOk = isAllowlistedAdminEmail(user.email);
  const userRoleOk = user.role === "admin" || user.role === "super_admin";
  if (user.id === "admin-1" && userRoleOk) return true;
  if (userRoleOk && emailOk) return true;
  if (
    shouldElevateToSuperAdmin({
      email: user.email,
      phone: user.phone,
      name: user.name,
      nickname: user.nickname,
    })
  ) {
    return true;
  }
  return false;
}

export function requireAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): void {
  requireAuth(req, res, () => {
    void (async () => {
      if (await userIsAdmin(req)) {
        req.authRole = "super_admin";
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
