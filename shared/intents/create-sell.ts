/**
 * Create / sell listing intents — thin canonical wrappers over chaotic-input.
 */

export {
  hasChaoticSellIntent as isCreateListingSellIntent,
  hasChaoticJobSeekerCreateIntent as isJobSeekerCreateIntent,
  normalizeChaoticUserText,
  isUltraShortConfirmation,
} from "../chaotic-input";
