import { logProductionError } from "../lib/production-log.js";
import {
  getPortalLinksDueForSync,
  type UserPortalLink,
} from "../repository-portal-links.js";
import { portalSyncIntervalMs } from "./portal-listing-mapper.js";
import { runPortalSyncViaAdapter } from "./adapters/wardrobe-profile-adapter.js";

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
  link: UserPortalLink,
  options: { force?: boolean } = {}
): Promise<{ status: "updated" | "skipped" | "error"; itemCount: number }> {
  try {
    const outcome = await runPortalSyncViaAdapter(link, options);
    return {
      status: outcome.status,
      itemCount: outcome.itemCount,
    };
  } catch (e) {
    logProductionError("portal-sync", e, {
      userId: link.userId,
      portalKey: link.portalKey,
      profileUrl: link.profileUrl.slice(0, 120),
    });
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
