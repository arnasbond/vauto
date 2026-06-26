import type { Listing } from "@/lib/types";
import { shareCaptionForPlatform } from "@/lib/social-share";
import {
  anySocialPublishEnabled,
  type ListingSocialPublishOptions,
} from "@/lib/listing-social-publish";
import { runAutoShareOnPublish, getSocialSyncPrefs } from "@/lib/social-sync";

export interface ListingSocialPublishResult {
  facebook?: "opened" | "skipped";
  anonser?: "queued" | "skipped";
  aiCaption?: string;
}

/** Background Anonser.lt queue — never blocks publish UI. */
export function queueAnonserListingSync(listing: Listing): void {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    try {
      const key = "vauto_anonser_queue";
      const raw = window.localStorage.getItem(key);
      const queue: string[] = raw ? (JSON.parse(raw) as string[]) : [];
      if (!queue.includes(listing.id)) {
        queue.push(listing.id);
        window.localStorage.setItem(key, JSON.stringify(queue.slice(-50)));
      }
    } catch {
      /* ignore storage errors */
    }
  }, 0);
}

/** Execute per-listing social publish choices after successful listing save (non-blocking). */
export async function runListingSocialPublish(
  listing: Listing,
  opts: ListingSocialPublishOptions
): Promise<ListingSocialPublishResult> {
  const result: ListingSocialPublishResult = {};

  if (!anySocialPublishEnabled(opts)) {
    return result;
  }

  if (opts.aiSocialAdaptation) {
    result.aiCaption = shareCaptionForPlatform("facebook", listing);
  }

  if (opts.facebookGroups) {
    const prefs = getSocialSyncPrefs();
    const share = await runAutoShareOnPublish(listing, {
      ...prefs,
      enabled: true,
      autoShareOnPublish: true,
      networks: { ...prefs.networks, facebook: true },
    });
    result.facebook = share.method === "skipped" ? "skipped" : "opened";
  }

  if (opts.anonserLt) {
    queueAnonserListingSync(listing);
    result.anonser = "queued";
  }

  return result;
}

/** Fire-and-forget wrapper for post-publish integrations. */
export function scheduleListingSocialPublish(
  listing: Listing,
  opts: ListingSocialPublishOptions,
  onResult?: (result: ListingSocialPublishResult) => void
): void {
  void runListingSocialPublish(listing, opts)
    .then((result) => onResult?.(result))
    .catch(() => {
      /* social sync must never surface as publish failure */
    });
}
