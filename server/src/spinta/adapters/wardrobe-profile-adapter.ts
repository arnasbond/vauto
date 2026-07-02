import { importWardrobeProfile } from "../../ai/wardrobe-profile-importer.js";
import { getUser } from "../../repository.js";
import {
  hashWardrobeItems,
  wardrobeItemsToListings,
} from "../portal-listing-mapper.js";
import {
  markPortalLinkError,
  markPortalLinkSyncing,
  upsertPortalLink,
  type UserPortalLink,
} from "../../repository-portal-links.js";
import { upsertPortalListing } from "../../repository.js";
import { notifyPortalSyncNewItems } from "../../services/push-service.js";
import {
  getPortalSyncAdapter,
  registerPortalSyncAdapter,
  type PortalSyncAdapter,
  type PortalSyncContext,
  type PortalSyncOutcome,
} from "../portal-sync-adapter.js";

async function syncWardrobeProfileLink(
  ctx: PortalSyncContext
): Promise<PortalSyncOutcome> {
  const { link, force } = ctx;
  const user = await getUser(link.userId);
  if (!user) {
    await markPortalLinkError(link.userId, link.portalKey, "Vartotojas nerastas");
    return { status: "error", itemCount: 0, phase: "import", error: "user_not_found" };
  }

  await markPortalLinkSyncing(link.userId, link.portalKey);

  try {
    const result = await importWardrobeProfile({
      profileUrl: link.profileUrl,
      userName: user.name,
      defaultLocation: user.city,
    });

    const itemHash = hashWardrobeItems(result.items);
    if (!force && itemHash === link.lastItemHash && link.itemCount > 0) {
      await upsertPortalLink({
        userId: link.userId,
        portalKey: link.portalKey,
        portalLabel: link.portalLabel,
        profileUrl: result.profileUrl || link.profileUrl,
        status: "synced",
        itemCount: link.itemCount,
        lastItemHash: itemHash,
        scheduleNextSync: true,
      });
      return { status: "skipped", itemCount: link.itemCount, phase: "refresh" };
    }

    const listings = wardrobeItemsToListings(
      user,
      result.items,
      link.portalKey,
      result.profileUrl || link.profileUrl
    );
    for (const listing of listings) {
      await upsertPortalListing(listing);
    }

    await upsertPortalLink({
      userId: link.userId,
      portalKey: link.portalKey,
      portalLabel: link.portalLabel,
      profileUrl: result.profileUrl || link.profileUrl,
      status: "synced",
      itemCount: result.items.length,
      lastItemHash: itemHash,
      scheduleNextSync: true,
    });

    if (result.items.length > link.itemCount) {
      void notifyPortalSyncNewItems(link.userId, {
        portalLabel: link.portalLabel,
        newCount: result.items.length - link.itemCount,
        totalCount: result.items.length,
      });
    }

    return { status: "updated", itemCount: result.items.length, phase: "import" };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await markPortalLinkError(link.userId, link.portalKey, message);
    return { status: "error", itemCount: 0, phase: "import", error: message };
  }
}

/** Default wardrobe/profile import adapter used by portal sync cron. */
export const wardrobeProfilePortalAdapter: PortalSyncAdapter = {
  portalKey: "*",
  supportedPhases: ["import", "refresh"],
  sync: syncWardrobeProfileLink,
};

export function ensurePortalSyncAdaptersRegistered(): void {
  registerPortalSyncAdapter(wardrobeProfilePortalAdapter);
}

export async function runPortalSyncViaAdapter(
  link: UserPortalLink,
  options: { force?: boolean } = {}
): Promise<PortalSyncOutcome> {
  ensurePortalSyncAdaptersRegistered();
  const adapter =
    getPortalSyncAdapter(link.portalKey) ?? wardrobeProfilePortalAdapter;
  const user = await getUser(link.userId);
  return adapter.sync({
    userId: link.userId,
    userName: user?.name ?? "VAUTO",
    defaultLocation: user?.city,
    link,
    force: options.force,
  });
}
