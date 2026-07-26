/**
 * @vauto/shared intent engine — browse / confirm / publish / photo / create.
 * Import from `@vauto/shared/intents` (Next) or `../shared/intents/index.js` (Express).
 */

export {
  foldLtForBrowseMatch,
  stripBrowseSearchPrefixes,
  resolveBrowseAllIntent,
  isListingConfirmationPhrase,
  isBrowseAllIntent,
  buildBrowseAllReply,
  effectiveMarketplaceSearchQuery,
  BROWSE_ALL_RE,
} from "./browse-all";

export {
  isListingWorkflowCommand,
  isPublishWorkflowCommand,
  isPublishConfirmationPhrase,
} from "./listing-workflow";

export {
  isImageOnlyChatUpload,
  isPhotoSearchIntentText,
  isPhotoSellIntentText,
} from "./photo";

export {
  isCreateListingSellIntent,
  isJobSeekerCreateIntent,
  normalizeChaoticUserText,
  isUltraShortConfirmation,
} from "./create-sell";

export { foldLtIntent } from "./lt-fold";

/** Warm ack while Vision / PDF workers run (P0 async hot path). */
export const VISION_OPTIMISTIC_ACK =
  "Gavau nuotraukas — skenuoju ir pildau juodraštį. Galite tęsti pokalbį.";

export const DOCUMENT_OPTIMISTIC_ACK =
  "Gavau dokumentą — skaitau turinį ir įrašysiu į juodraštį.";
