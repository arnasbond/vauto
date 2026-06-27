import type { ChameleonThemeId } from "@/lib/chameleon-themes";
import {
  WARDROBE_FREE_IMPORT_LIMIT,
  isWardrobePowerUser,
  isWardrobeSpintaEconomyActive,
  readWardrobeImportCount,
} from "@/lib/monetization-wardrobe";
import type { UserProfile } from "@/lib/types";

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

/** Atpažįsta Power-User ir atrakina Spintos premium funkcijas — tik wardrobe režime */
export function resolveWardrobeSubscriptionAccess(
  user: UserProfile,
  theme: ChameleonThemeId,
  inSpintaCabinet = false
): WardrobeSubscriptionAccess {
  if (!isWardrobeSpintaEconomyActive(theme, inSpintaCabinet)) return LOCKED;
  const power = isWardrobePowerUser(user);
  const importsUsed = readWardrobeImportCount(user.id);
  const importLimit = WARDROBE_FREE_IMPORT_LIMIT;

  if (power) {
    return {
      active: true,
      isPowerUser: true,
      canImportUnlimited: true,
      showsDeepStats: true,
      importsUsed,
      importsRemaining: "unlimited",
      importLimit,
    };
  }

  const remaining = Math.max(0, importLimit - importsUsed);

  return {
    active: true,
    isPowerUser: false,
    canImportUnlimited: false,
    showsDeepStats: false,
    importsUsed,
    importsRemaining: remaining,
    importLimit,
  };
}

export function canPerformWardrobeProfileImport(
  user: UserProfile,
  theme: ChameleonThemeId,
  inSpintaCabinet = false
): boolean {
  const access = resolveWardrobeSubscriptionAccess(user, theme, inSpintaCabinet);
  if (!access.active) return true;
  if (access.canImportUnlimited) return true;
  return access.importsRemaining !== 0;
}
