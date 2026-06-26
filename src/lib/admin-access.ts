import { ADMIN_EMAIL } from "@/lib/reports";
import type { UserProfile } from "@/lib/types";

/** Canonical VAUTO Control Center operator account. */
export const SUPER_ADMIN_ID = "admin-1";

type AdminUserLike = Pick<UserProfile, "id" | "role" | "email">;

/** True only for the designated super-admin operator (not generic test users). */
export function isSuperAdminUser(user: AdminUserLike | null | undefined): boolean {
  if (!user?.id) return false;
  return (
    user.id === SUPER_ADMIN_ID &&
    user.role === "super_admin" &&
    user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  );
}
