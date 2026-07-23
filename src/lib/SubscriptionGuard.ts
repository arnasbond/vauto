import type { ChameleonThemeId } from "@/lib/chameleon-themes";
import {
  isWardrobeSpintaEconomyActive,
  readWardrobeImportCount,
} from "@/lib/monetization-wardrobe";
import type { UserProfile } from "@/lib/types";
import { isGuestUserId } from "@/lib/wardrobe-guest-demo";

export interface WardrobeSubscriptionAccess {
  /** Monetizacija / guard aktyvus šiam kontekstui */
  active: boolean;
  isPowerUser: boolean;
  canImportUnlimited: boolean;
  showsDeepStats: boolean;
  importsUsed: number;
  importsRemaining: number | "unlimited";
  importLimit: number;
}

const LOCKED: WardrobeSubscriptionAccess = {
  active: false,
  isPowerUser: false,
  canImportUnlimited: false,
  showsDeepStats: false,
  importsUsed: 0,
  importsRemaining: 0,
  importLimit: 0,
};

/**
 * Spinta Power-User paywall is deprecated — authenticated Spinta users get
 * unlimited import + stats without a subscription checkout.
 */
export function resolveWardrobeSubscriptionAccess(
  user: UserProfile,
  theme: ChameleonThemeId,
  inSpintaCabinet = false
): WardrobeSubscriptionAccess {
  if (isGuestUserId(user.id)) return LOCKED;
  if (!isWardrobeSpintaEconomyActive(theme, inSpintaCabinet)) return LOCKED;
  const importsUsed = readWardrobeImportCount(user.id);

  return {
    active: true,
    isPowerUser: true,
    canImportUnlimited: true,
    showsDeepStats: true,
    importsUsed,
    importsRemaining: "unlimited",
    importLimit: 0,
  };
}

export function canPerformWardrobeProfileImport(
  user: UserProfile,
  theme: ChameleonThemeId,
  inSpintaCabinet = false
): boolean {
  const access = resolveWardrobeSubscriptionAccess(user, theme, inSpintaCabinet);
  if (!access.active) return true;
  return true;
}
