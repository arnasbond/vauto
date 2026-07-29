import type { UserProfile } from "@/lib/types";

export type ProfileType = "private" | "business";

export function isPrivateProfile(user: Pick<UserProfile, "profileType">): boolean {
  return user.profileType === "private";
}

export function isBusinessProfile(user: Pick<UserProfile, "profileType">): boolean {
  return user.profileType === "business";
}

export function needsProfileTypeSelection(
  user: Pick<UserProfile, "profileType" | "role">
): boolean {
  if (user.role === "admin" || user.role === "super_admin") return false;
  return user.profileType !== "private" && user.profileType !== "business";
}

export function cabinetNavLabel(profileType?: ProfileType | null): string {
  void profileType;
  return "Mano skelbimai";
}

export function cabinetSectionTitle(profileType?: ProfileType | null): string {
  void profileType;
  return "Mano skelbimai";
}

export function defaultCabinetPath(profileType?: ProfileType | null): string {
  if (profileType === "business" || profileType === "private") {
    return "/mano-skelbimai/";
  }
  return "/auth-gate/";
}
