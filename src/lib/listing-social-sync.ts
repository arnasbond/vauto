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

/** Execute per-listing social publish choices after successful listing save. */
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
    result.anonser = "queued";
  }

  return result;
}
