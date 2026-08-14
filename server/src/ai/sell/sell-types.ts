/**
 * VAUTO Sell 10C — input contracts.
 * Output is always a draft requiring user confirmation (never auto-publish).
 */

export type SellInput = {
  /** Explicit typed user text. */
  text?: string;
  /** STT transcript (voice). Kept separate from normalized text in the engine. */
  transcript?: string;
  /** Image URLs or data URLs for vision / OCR (untrusted). */
  imageUrls?: string[];
};

export type SellFieldSource =
  | "VISION"
  | "TEXT"
  | "VOICE"
  | "COMBINED"
  | "USER_PROVIDED"
  | "OCR_UNTRUSTED";

/** Hard guarantee for auditors / tests. */
export const SELL_AUTO_PUBLISH = false as const;
