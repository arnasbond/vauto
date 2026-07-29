import type { Listing } from "@/lib/types";
import { generateListingMetadata, listingPrettyPath } from "@/lib/seo";
import { SITE_URL } from "@/lib/site-url";
import { categoryHashtags } from "@vauto/shared/listing-og";
import {
  canUseCapacitorShare,
  shareViaCapacitor,
} from "@/lib/native-share";

export { SITE_URL } from "@/lib/site-url";

export type SocialPlatformId =
  | "facebook"
  | "instagram"
  | "linkedin"
  | "whatsapp"
  | "telegram"
  | "viber";

/** Primary share row — keep the post-publish modal focused. */
export const PRIMARY_SHARE_PLATFORMS: SocialPlatformId[] = [
  "whatsapp",
  "facebook",
  "telegram",
  "viber",
];

export interface ListingSharePayload {
  url: string;
  title: string;
  text: string;
  hashtags: string[];
}

export interface SocialPlatform {
  id: SocialPlatformId;
  label: string;
  /** Ar galima dalintis per nuorodą be OAuth */
  shareViaLink: boolean;
  hint?: string;
}

export interface SocialSyncPrefs {
  enabled: boolean;
  autoShareOnPublish: boolean;
  networks: Record<SocialPlatformId, boolean>;
}

export const DEFAULT_SOCIAL_NETWORKS: Record<SocialPlatformId, boolean> = {
  facebook: true,
  instagram: true,
  linkedin: false,
  whatsapp: true,
  telegram: true,
  viber: true,
};

export const DEFAULT_SOCIAL_SYNC_PREFS: SocialSyncPrefs = {
  enabled: true,
  autoShareOnPublish: false,
  networks: DEFAULT_SOCIAL_NETWORKS,
};

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  { id: "whatsapp", label: "WhatsApp", shareViaLink: true },
  { id: "facebook", label: "Facebook", shareViaLink: true },
  { id: "telegram", label: "Telegram", shareViaLink: true },
  { id: "viber", label: "Viber", shareViaLink: true },
  {
    id: "instagram",
    label: "Instagram",
    shareViaLink: false,
    hint: "Nukopijuokite tekstą ir įklijuokite į Instagram Stories arba postą.",
  },
  { id: "linkedin", label: "LinkedIn", shareViaLink: true },
];

export function buildListingSharePayload(listing: Listing): ListingSharePayload {
  const meta = generateListingMetadata(listing);
  const path = listingPrettyPath(listing);
  const url = `${SITE_URL}${path}`;
  const priceText = listing.priceLabel ?? `${listing.price} €`;
  const text = `${meta.og.title} — ${priceText}. Peržiūrėkite VAUTO: ${url}`;
  return {
    url,
    title: meta.og.title,
    text,
    hashtags: categoryHashtags(listing.category, listing.location),
  };
}

export function canUseNativeShare(): boolean {
  if (typeof navigator === "undefined") return false;
  if (canUseCapacitorShare()) return true;
  return typeof navigator.share === "function";
}

export async function shareListingNative(
  listing: Listing,
  overrideText?: string
): Promise<boolean> {
  const payload = buildListingSharePayload(listing);
  const sharePayload = {
    title: payload.title,
    text: overrideText?.trim() || payload.text,
    url: payload.url,
    dialogTitle: "Dalintis skelbimu",
  };

  if (canUseCapacitorShare()) {
    const ok = await shareViaCapacitor(sharePayload);
    if (ok) return true;
  }

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(sharePayload);
      return true;
    } catch {
      /* user dismissed or WebView blocked */
    }
  }

  return false;
}

export async function copyListingLink(listing: Listing): Promise<boolean> {
  const payload = buildListingSharePayload(listing);
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(payload.url);
    return true;
  } catch {
    return false;
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function encode(text: string): string {
  return encodeURIComponent(text);
}

export function getPlatformShareUrl(
  platform: SocialPlatformId,
  listing: Listing,
  caption?: string
): string | null {
  const payload = buildListingSharePayload(listing);
  const { url, title } = payload;
  const text = caption?.trim() || payload.text;

  switch (platform) {
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${encode(url)}&quote=${encode(text)}`;
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${encode(url)}`;
    case "whatsapp":
      return `https://wa.me/?text=${encode(text)}`;
    case "telegram":
      return `https://t.me/share/url?url=${encode(url)}&text=${encode(caption?.trim() || title)}`;
    case "viber":
      return `viber://forward?text=${encode(text)}`;
    case "instagram":
      return null;
    default:
      return null;
  }
}

export function openPlatformShare(
  platform: SocialPlatformId,
  listing: Listing,
  caption?: string
): "opened" | "copied" | "unavailable" {
  const shareUrl = getPlatformShareUrl(platform, listing, caption);
  if (shareUrl) {
    window.open(shareUrl, "_blank", "noopener,noreferrer,width=600,height=520");
    return "opened";
  }
  if (platform === "instagram") {
    void copyListingLink(listing);
    return "copied";
  }
  return "unavailable";
}

export function shareCaptionForPlatform(
  platform: SocialPlatformId,
  listing: Listing
): string {
  const payload = buildListingSharePayload(listing);
  const tags = payload.hashtags.map((t) => `#${t}`).join(" ");
  if (platform === "linkedin") {
    return `${payload.title}\n\n${payload.text}\n\n${tags}`;
  }
  if (platform === "instagram") {
    return `${payload.title}\n${payload.url}\n\n${tags}`;
  }
  return payload.text;
}
