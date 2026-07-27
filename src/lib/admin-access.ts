import { ADMIN_EMAIL } from "@/lib/reports";
import type { UserProfile } from "@/lib/types";

/** Canonical VAUTO Control Center operator account. */
export const SUPER_ADMIN_ID = "admin-1";

type AdminUserLike = Pick<UserProfile, "id" | "role" | "email">;

export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
}

/**
 * True for Control Center operators.
 * Prefer `role === "super_admin"` (elevated operator accounts keep their own id/name).
 * Legacy: canonical admin-1 / ADMIN_EMAIL with admin roles.
 */
export function isSuperAdminUser(user: AdminUserLike | null | undefined): boolean {
  if (!user?.id) return false;
  if (user.role === "super_admin") return true;
  const roleOk = user.role === "admin" || user.role === "super_admin";
  if (user.id === SUPER_ADMIN_ID && roleOk) return true;
  if (roleOk && isAdminEmail(user.email)) return true;
  return false;
}
