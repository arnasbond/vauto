/**
 * Client browse-all intent — thin re-export of canonical @vauto/shared/intents.
 */

import type { VautoAgentAction } from "@/lib/vauto-agent-client";
import {
  buildBrowseAllReply,
  BROWSE_ALL_RE,
  effectiveMarketplaceSearchQuery,
  foldLtForBrowseMatch,
  isBrowseAllIntent,
  isListingConfirmationPhrase,
  resolveBrowseAllIntent,
  stripBrowseSearchPrefixes,
} from "@vauto/shared/intents/browse-all";

export {
  buildBrowseAllReply,
  BROWSE_ALL_RE,
  effectiveMarketplaceSearchQuery,
  foldLtForBrowseMatch,
  isBrowseAllIntent,
  isListingConfirmationPhrase,
  resolveBrowseAllIntent,
  stripBrowseSearchPrefixes,
};

export function createBrowseAllAction(
  listingCount?: number
): Extract<VautoAgentAction, { type: "browse_all" }> {
  return {
    type: "browse_all",
    replyMessage: buildBrowseAllReply(listingCount),
    listingCount,
  };
}
