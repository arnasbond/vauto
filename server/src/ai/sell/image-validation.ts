/**
 * Image validation + safety — FAIL-CLOSED.
 * Timeout / error / missing provider => safe:false, requiresReview:true.
 * SSRF hardening via shared url-ssrf (Etapas 10I).
 */

import { hardenOutboundUrl } from "../../shared/url-ssrf.js";

export type ImageSafetyResult = {
  safe: boolean;
  requiresReview: boolean;
  reasons: string[];
  acceptedUrls: string[];
};

export type ImageValidationLimits = {
  maxCount: number;
  maxBytes: number;
  maxWidth: number;
  maxHeight: number;
  allowedMime: Set<string>;
};

export const DEFAULT_IMAGE_LIMITS: ImageValidationLimits = {
  maxCount: 12,
  maxBytes: 12 * 1024 * 1024,
  maxWidth: 8000,
  maxHeight: 8000,
  allowedMime: new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]),
};

/** Reject SSRF-prone URLs (private/link-local/metadata). Data URLs inspected separately. */
export function assertSafeImageUrl(url: string): string | null {
  const r = hardenOutboundUrl(url);
  return r.ok ? null : r.reason ?? "ssrf_blocked_host";
}

function sniffMimeFromMagic(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38
  ) {
    return "image/gif";
  }
  if (
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export type ImageSafetyProvider = (
  urls: string[]
) => Promise<{ safe: boolean; reasons?: string[]; requiresReview?: boolean }>;

/**
 * Default fail-closed checker.
 * - SSRF / bad URL → unsafe
 * - Missing provider → unsafe (provider_missing)
 * - Provider timeout/error → unsafe
 */
export async function validateImagesFailClosed(
  urls: string[],
  opts?: {
    limits?: ImageValidationLimits;
    bytesByUrl?: Record<string, Buffer>;
    provider?: ImageSafetyProvider | null;
    timeoutMs?: number;
  }
): Promise<ImageSafetyResult> {
  const limits = opts?.limits ?? DEFAULT_IMAGE_LIMITS;
  const reasons: string[] = [];
  const list = Array.isArray(urls) ? urls : [];

  if (list.length === 0) {
    return {
      safe: false,
      requiresReview: true,
      reasons: ["no_images"],
      acceptedUrls: [],
    };
  }
  if (list.length > limits.maxCount) {
    return {
      safe: false,
      requiresReview: true,
      reasons: ["too_many_images"],
      acceptedUrls: [],
    };
  }

  const acceptedUrls: string[] = [];
  for (const url of list) {
    const bad = assertSafeImageUrl(url);
    if (bad) {
      reasons.push(bad);
      continue;
    }
    const bytes = opts?.bytesByUrl?.[url];
    if (bytes) {
      if (bytes.length > limits.maxBytes) {
        reasons.push("bytes_too_large");
        continue;
      }
      const mime = sniffMimeFromMagic(bytes);
      if (!mime || !limits.allowedMime.has(mime)) {
        reasons.push("mime_not_allowed");
        continue;
      }
    }
    acceptedUrls.push(url);
  }

  if (acceptedUrls.length === 0) {
    return {
      safe: false,
      requiresReview: true,
      reasons: reasons.length ? reasons : ["no_accepted_urls"],
      acceptedUrls: [],
    };
  }

  if (!opts?.provider) {
    return {
      safe: false,
      requiresReview: true,
      reasons: [...reasons, "provider_missing"],
      acceptedUrls: [],
    };
  }

  const timeoutMs = opts.timeoutMs ?? 8000;
  try {
    const result = await Promise.race([
      opts.provider(acceptedUrls),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("image_safety_timeout")), timeoutMs)
      ),
    ]);
    if (!result.safe) {
      return {
        safe: false,
        requiresReview: true,
        reasons: [...reasons, ...(result.reasons ?? ["safety_rejected"])],
        acceptedUrls: [],
      };
    }
    return {
      safe: true,
      requiresReview: Boolean(result.requiresReview),
      reasons,
      acceptedUrls,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "safety_provider_failed";
    return {
      safe: false,
      requiresReview: true,
      reasons: [
        ...reasons,
        msg === "image_safety_timeout" ? "image_safety_timeout" : "safety_provider_failed",
      ],
      acceptedUrls: [],
    };
  }
}
