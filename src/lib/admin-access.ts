import { ADMIN_EMAIL } from "@/lib/reports";
import type { UserProfile } from "@/lib/types";

/** Canonical VAUTO Control Center operator account. */
export const SUPER_ADMIN_ID = "admin-1";

/**
 * Extra operators identified by public nickname (and display name).
 * Keep in sync with server `ADMIN_NAMES` default (server/src/lib/admin-allowlist.ts).
 */
export const SUPER_ADMIN_NICKNAMES = ["arnas"] as const;

type AdminUserLike = Pick<UserProfile, "id" | "role" | "email" | "name" | "nickname">;

export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
}

function normalizeHandle(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isAllowlistedAdminHandle(
  user: Pick<UserProfile, "name" | "nickname"> | null | undefined
): boolean {
  if (!user) return false;
  const nick = normalizeHandle(user.nickname);
  const name = normalizeHandle(user.name);
  return SUPER_ADMIN_NICKNAMES.some((allowed) => allowed === nick || allowed === name);
}

/**
 * True for Control Center operators.
 * - `role === "super_admin"` (elevated in API/DB)
 * - Canonical admin-1 / ADMIN_EMAIL
 * - Allowlisted nickname (arnas) so owner unlocks CC even before JWT role refresh
 */
export function isSuperAdminUser(user: AdminUserLike | null | undefined): boolean {
  if (!user?.id) return false;
  if (user.role === "super_admin") return true;
  if (isAllowlistedAdminHandle(user)) return true;
  const roleOk = user.role === "admin" || user.role === "super_admin";
  if (user.id === SUPER_ADMIN_ID && roleOk) return true;
  if (roleOk && isAdminEmail(user.email)) return true;
  return false;
}
