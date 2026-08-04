/**
 * Persist-safe listing attributes: drop ephemeral Vision/social dumps and
 * clamp values so PATCH/POST never fail with "attribute … too long".
 */

/** Keys that must not be round-tripped as seller-editable attribute payloads. */
export const EPHEMERAL_LISTING_ATTR_KEYS = new Set([
  "detectedObjects",
  "choiceChips",
  "clarificationPrompt",
  "selectedObject",
  "sceneContext",
  "factNotes",
  "ocrText",
  "preferredSizes",
  "deferredSalesDescription",
  "visionQuotaFallback",
  "_socialShare",
  "socialShare",
  "socialPublish",
  "socialPublishFacebook",
  "socialPublishInstagram",
  "socialPublishAnonserLt",
  "socialPublishAiAdaptation",
  "socialPublishFacebookGroups",
]);

export const ATTR_STRING_MAX = 500;
/** Gallery / document CDN URLs (Cloudinary transforms) often exceed 400. */
export const ATTR_ARRAY_ITEM_MAX = 2_048;
export const ATTR_ARRAY_MAX_ITEMS = 50;
export const ATTR_KEY_MAX = 80;

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function shouldDropKey(key: string): boolean {
  if (!key || key.length > ATTR_KEY_MAX) return true;
  if (EPHEMERAL_LISTING_ATTR_KEYS.has(key)) return true;
  if (key.startsWith("_")) return true;
  return false;
}

function clampString(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max);
}

function clampArrayItem(item: string): string | null {
  const trimmed = item.trim();
  if (!trimmed || trimmed.startsWith("data:image")) return null;
  if (trimmed.length <= ATTR_ARRAY_ITEM_MAX) return trimmed;
  // Never truncate http(s) URLs — truncated CDN links 404; drop instead.
  if (isHttpUrl(trimmed)) return null;
  return trimmed.slice(0, ATTR_ARRAY_ITEM_MAX);
}

/**
 * Cover for API create/update: prefer HTTPS gallery, else keep data:image so
 * server sanitize does not empty `image` into "image is required".
 */
export function resolveListingApiCover(images: readonly string[] | undefined): {
  cover: string;
  httpGallery: string[];
} {
  const gallery = (images ?? []).map((u) => String(u ?? "").trim()).filter(Boolean);
  const httpGallery = gallery.filter((u) => isHttpUrl(u));
  const dataCover = gallery.find((u) => u.startsWith("data:image")) ?? "";
  return {
    cover: httpGallery[0] ?? dataCover ?? gallery[0] ?? "",
    httpGallery,
  };
}

/**
 * Normalize attributes for API persistence.
 * - Drops Vision/social ephemeral keys
 * - Coerces non-string array items / objects via JSON (then clamps)
 * - Never throws — always returns a safe map
 */
export function sanitizeListingAttributesForPersistence(
  raw: unknown
): Record<string, string | string[] | undefined> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: Record<string, string | string[] | undefined> = {};

  for (const [key, attr] of Object.entries(raw as Record<string, unknown>)) {
    if (shouldDropKey(key)) continue;

    if (attr === undefined || attr === null || attr === "") {
      continue;
    }

    if (typeof attr === "string") {
      if (attr.startsWith("data:image")) continue;
      result[key] = clampString(attr, ATTR_STRING_MAX);
      continue;
    }

    if (typeof attr === "number" || typeof attr === "boolean") {
      result[key] = clampString(String(attr), ATTR_STRING_MAX);
      continue;
    }

    if (Array.isArray(attr)) {
      const values: string[] = [];
      for (const item of attr) {
        if (typeof item === "string") {
          const clamped = clampArrayItem(item);
          if (clamped) values.push(clamped);
          continue;
        }
        if (item == null) continue;
        // Objects inside arrays (rare) → compact JSON then clamp.
        try {
          const asJson = clampArrayItem(JSON.stringify(item));
          if (asJson) values.push(asJson);
        } catch {
          /* skip */
        }
      }
      if (values.length) {
        result[key] = values.slice(0, ATTR_ARRAY_MAX_ITEMS);
      }
      continue;
    }

    if (typeof attr === "object") {
      // Nested objects (e.g. legacy _socialShare blob) — persist as compact JSON string.
      try {
        const json = JSON.stringify(attr);
        if (json && json !== "{}" && json !== "[]") {
          result[key] = clampString(json, ATTR_STRING_MAX);
        }
      } catch {
        /* skip */
      }
    }
  }

  return result;
}
