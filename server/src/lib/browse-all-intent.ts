/**
 * Server browse-all intent — thin re-export of canonical shared/intents.
 */

export {
  buildBrowseAllReply,
  BROWSE_ALL_RE,
  effectiveMarketplaceSearchQuery,
  foldLtForBrowseMatch,
  isBrowseAllIntent,
  isListingConfirmationPhrase,
  resolveBrowseAllIntent,
  stripBrowseSearchPrefixes,
} from "../shared/intents/browse-all.js";
