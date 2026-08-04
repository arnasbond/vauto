import type { UserProfile } from "@/lib/types";
import { isBusinessProfile } from "@/lib/profile-type";

/**
 * Access to the dedicated Business Portal (/verslui).
 * Pro role or explicit business profileType — independent of Admin Control Center.
 */
export function hasBusinessPortalAccess(
  user: Pick<UserProfile, "role" | "profileType"> | null | undefined
): boolean {
  if (!user) return false;
  if (user.role === "pro") return true;
  return isBusinessProfile(user);
}

export const BUSINESS_PORTAL_PATH = "/verslui/";
export const BUSINESS_REGISTRATION_PATH = "/pro-registration/";
