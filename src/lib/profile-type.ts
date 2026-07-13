import type { UserProfile } from "@/lib/types";
import {
  WARDROBE_PORTALS,
  type WardrobePortalDef,
} from "@/lib/spinta-portal";

export type ProfileType = "private" | "business";

const PRIVATE_PORTAL_KEYS = [
  "vinted",
  "marktplaats",
  "depop",
  "poshmark",
  "ebay",
  "olx",
] as const;

const BUSINESS_PORTAL_KEYS = [
  "skelbiu",
  "autoplius",
  "aruodas",
  "paslaugos",
  "olx",
  "vinted",
] as const;

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

function orderPortals(keys: readonly string[]): WardrobePortalDef[] {
  const byKey = new Map(WARDROBE_PORTALS.map((p) => [p.key, p]));
  const ordered: WardrobePortalDef[] = [];
  for (const key of keys) {
    const portal = byKey.get(key);
    if (portal) ordered.push(portal);
  }
  for (const portal of WARDROBE_PORTALS) {
    if (!ordered.some((p) => p.key === portal.key)) ordered.push(portal);
  }
  return ordered;
}

export function portalsForProfileType(
  profileType?: ProfileType | null
): WardrobePortalDef[] {
  if (profileType === "business") return orderPortals(BUSINESS_PORTAL_KEYS);
  if (profileType === "private") return orderPortals(PRIVATE_PORTAL_KEYS);
  return WARDROBE_PORTALS;
}
