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

/**
 * Legacy X-User-Id auth bypass — OFF by default.
 * Stage 0: must be explicitly enabled (local QA only). Never auto-on for
 * "not production" (staging hosts often omit NODE_ENV=production).
 * Production + ALLOW_LEGACY_USER_HEADER=true is FATAL in env-check.
 */
function allowLegacyUserHeader(): boolean {
  return process.env.ALLOW_LEGACY_USER_HEADER === "true";
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

/** Opaque body — same shape as ops 404 mask (do not reveal admin routes). */
export const ADMIN_ROUTE_NOT_FOUND = { error: "Not found" } as const;

/** 404 mask for /api/admin/* and other admin-gated routes. */
export function sendAdminNotFound(res: Response): void {
  res.status(404).json(ADMIN_ROUTE_NOT_FOUND);
}

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

/** Canonical admin roles (VAUTO uses admin | super_admin, not ROLE_ADMIN). */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

/**
 * Server RBAC: admin / super_admin role, or allowlisted operator
 * (elevated to super_admin on session — same Control Center owners).
 */
export async function userIsAdmin(req: AuthedRequest): Promise<boolean> {
  try {
    if (!req.authUserId) return false;
    if (isAdminRole(req.authRole)) {
      if (req.authRole === "super_admin") return true;
      if (req.authUserId === "admin-1") return true;
    }
    const user = await getUser(req.authUserId);
    if (!user) return false;
    if (isAdminRole(user.role)) {
      if (user.role === "super_admin") return true;
      if (user.id === "admin-1") return true;
      if (isAllowlistedAdminEmail(user.email)) return true;
    }
    if (
      shouldElevateToSuperAdmin({
        email: user.email,
        phone: user.phone,
        name: user.name,
        nickname: user.nickname,
        firstName: user.firstName,
      })
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Admin gate with 404 masking.
 * Unauthenticated and non-admin callers get the same opaque 404 —
 * never 401/403 that would confirm the route exists.
 */
export function requireAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): void {
  optionalAuth(req, res, () => {
    void (async () => {
      if (!req.authUserId) {
        sendAdminNotFound(res);
        return;
      }
      if (!(await userIsAdmin(req))) {
        sendAdminNotFound(res);
        return;
      }
      req.authRole = "super_admin";
      next();
    })().catch(() => {
      sendAdminNotFound(res);
    });
  });
}

export function assertUserMatch(
  req: AuthedRequest,
  userId: string
): boolean {
  return Boolean(req.authUserId && req.authUserId === userId);
}
