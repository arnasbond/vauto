import { importWardrobeProfile } from "../ai/wardrobe-profile-importer.js";
import { getUser } from "../repository.js";
import {
  getPortalLinksDueForSync,
  markPortalLinkError,
  markPortalLinkSyncing,
  type UserPortalLink,
  upsertPortalLink,
} from "../repository-portal-links.js";
import { upsertPortalListing } from "../repository.js";
import {
  hashWardrobeItems,
  portalSyncIntervalMs,
  wardrobeItemsToListings,
} from "./portal-listing-mapper.js";

const BATCH_DEFAULT = 6;
const DELAY_BETWEEN_MS = 2500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface PortalSyncBatchResult {
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
  details: Array<{ linkId: string; status: string; itemCount?: number }>;
}

export async function syncSinglePortalLink(
  link: UserPortalLink
): Promise<{ status: "updated" | "skipped" | "error"; itemCount: number }> {
  const user = await getUser(link.userId);
  if (!user) {
    await markPortalLinkError(link.userId, link.portalKey, "Vartotojas nerastas");
    return { status: "error", itemCount: 0 };
  }

  await markPortalLinkSyncing(link.userId, link.portalKey);

  try {
    const result = await importWardrobeProfile({
      profileUrl: link.profileUrl,
      userName: user.name,
      defaultLocation: user.city,
    });

    const itemHash = hashWardrobeItems(result.items);
    if (itemHash === link.lastItemHash && link.itemCount > 0) {
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
      return { status: "skipped", itemCount: link.itemCount };
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

    return { status: "updated", itemCount: result.items.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await markPortalLinkError(link.userId, link.portalKey, message);
    return { status: "error", itemCount: 0 };
  }
}

/** Process due portal links — throttled for free-tier hosting. */
export async function runPortalSyncBatch(
  options: { maxLinks?: number } = {}
): Promise<PortalSyncBatchResult> {
  const maxLinks = options.maxLinks ?? BATCH_DEFAULT;
  const due = await getPortalLinksDueForSync(maxLinks);
  const result: PortalSyncBatchResult = {
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  for (const link of due) {
    const outcome = await syncSinglePortalLink(link);
    result.processed += 1;
    if (outcome.status === "updated") result.updated += 1;
    if (outcome.status === "skipped") result.skipped += 1;
    if (outcome.status === "error") result.errors += 1;
    result.details.push({
      linkId: link.id,
      status: outcome.status,
      itemCount: outcome.itemCount,
    });
    await sleep(DELAY_BETWEEN_MS);
  }

  return result;
}

export function nextSyncLabel(): string {
  const days = Math.round(portalSyncIntervalMs() / (24 * 60 * 60 * 1000));
  return `${days} d.`;
}
