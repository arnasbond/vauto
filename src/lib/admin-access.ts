import { ADMIN_EMAIL } from "@/lib/reports";
import type { UserProfile } from "@/lib/types";

/** Canonical VAUTO Control Center operator account. */
export const SUPER_ADMIN_ID = "admin-1";

type AdminUserLike = Pick<UserProfile, "id" | "role" | "email">;

export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
}

/**
 * True for the designated Control Center operator.
 * Canonical id OR (super_admin/admin + ADMIN_EMAIL) — so Google login works.
 */
export function isSuperAdminUser(user: AdminUserLike | null | undefined): boolean {
  if (!user?.id) return false;
  const emailOk = isAdminEmail(user.email);
  const roleOk = user.role === "super_admin" || user.role === "admin";
  if (user.id === SUPER_ADMIN_ID && roleOk && emailOk) return true;
  if (roleOk && emailOk) return true;
  return false;
}
