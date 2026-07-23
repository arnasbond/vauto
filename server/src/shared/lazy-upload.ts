/**
 * VAUTO Lazy Upload contract (Lead Architect invariant).
 *
 * Chat / Vision / listing-draft inspection MUST keep images in-memory
 * (data URLs / buffers) for Gemini OCR. Permanent Cloudinary/disk writes
 * and DB listing inserts happen ONLY on explicit Publikuoti / Patvirtinti.
 */

/** Architectural switch — always true in production agent Vision path. */
export const LAZY_UPLOAD_VISION = true as const;

/** Server `upload_media` may run only when the client sets this flag. */
export const UPLOAD_MEDIA_PUBLISH_PERSIST = true as const;

export const LAZY_UPLOAD_PHASE = {
  /** In-memory Gemini Vision / draft — no Cloudinary, no insertListing. */
  VISION: "vision",
  /** Explicit publish — optimize, watermark, remote store, then DB row. */
  PUBLISH: "publish",
} as const;

export type LazyUploadPhase =
  (typeof LAZY_UPLOAD_PHASE)[keyof typeof LAZY_UPLOAD_PHASE];

/** Log marker for Render/Vercel observability. */
export const LAZY_UPLOAD_LOG_TAG = "[lazy-upload]";
