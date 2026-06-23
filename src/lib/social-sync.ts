import type { Listing } from "@/lib/types";
import {
  canUseNativeShare,
  DEFAULT_SOCIAL_SYNC_PREFS,
  openPlatformShare,
  shareListingNative,
  type SocialPlatformId,
  type SocialSyncPrefs,
} from "@/lib/social-share";
import { loadSocialSyncPrefs, saveSocialSyncPrefs } from "@/lib/storage";

export type { SocialSyncPrefs };
export { DEFAULT_SOCIAL_SYNC_PREFS };

export function getSocialSyncPrefs(): SocialSyncPrefs {
  return loadSocialSyncPrefs() ?? DEFAULT_SOCIAL_SYNC_PREFS;
}

export function setSocialSyncPrefs(prefs: SocialSyncPrefs): void {
  saveSocialSyncPrefs(prefs);
}

export function getEnabledNetworks(prefs: SocialSyncPrefs): SocialPlatformId[] {
  return (Object.entries(prefs.networks) as [SocialPlatformId, boolean][])
    .filter(([, on]) => on)
    .map(([id]) => id);
}

/**
 * Papildoma reklama po publikavimo — be OAuth atidarome pasirinktų tinklų dalijimosi langus
 * arba sisteminį „Share“ mobiliajame.
 */
export async function runAutoShareOnPublish(
  listing: Listing,
  prefs: SocialSyncPrefs = getSocialSyncPrefs()
): Promise<{ method: "native" | "platform" | "skipped"; platform?: SocialPlatformId }> {
  if (!prefs.enabled || !prefs.autoShareOnPublish) {
    return { method: "skipped" };
  }

  const enabled = getEnabledNetworks(prefs);
  if (enabled.length === 0) return { method: "skipped" };

  if (canUseNativeShare()) {
    const ok = await shareListingNative(listing);
    if (ok) return { method: "native" };
  }

  const primary = enabled.find((id) => id !== "instagram") ?? enabled[0];
  openPlatformShare(primary, listing);
  return { method: "platform", platform: primary };
}

export function toggleNetwork(
  prefs: SocialSyncPrefs,
  network: SocialPlatformId
): SocialSyncPrefs {
  return {
    ...prefs,
    networks: { ...prefs.networks, [network]: !prefs.networks[network] },
  };
}
