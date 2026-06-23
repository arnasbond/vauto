import type { Listing } from "@/lib/types";
import { generateListingMetadata, listingPath } from "@/lib/seo";

export const SITE_URL = "https://vauto-chi.vercel.app";

export type SocialPlatformId =
  | "facebook"
  | "instagram"
  | "linkedin"
  | "whatsapp"
  | "telegram"
  | "viber";

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
  telegram: false,
  viber: false,
};

export const DEFAULT_SOCIAL_SYNC_PREFS: SocialSyncPrefs = {
  enabled: true,
  autoShareOnPublish: false,
  networks: DEFAULT_SOCIAL_NETWORKS,
};

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  {
    id: "facebook",
    label: "Facebook",
    shareViaLink: true,
  },
  {
    id: "instagram",
    label: "Instagram",
    shareViaLink: false,
    hint: "Nukopijuokite nuorodą ir įklijuokite į Instagram Stories arba bio.",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    shareViaLink: true,
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    shareViaLink: true,
  },
  {
    id: "telegram",
    label: "Telegram",
    shareViaLink: true,
  },
  {
    id: "viber",
    label: "Viber",
    shareViaLink: true,
  },
];

export function buildListingSharePayload(listing: Listing): ListingSharePayload {
  const meta = generateListingMetadata(listing);
  const path = listingPath(listing);
  const url = `${SITE_URL}${path}`;
  const priceText = listing.priceLabel ?? `${listing.price} €`;
  const text = `${meta.og.title} — ${priceText}. Peržiūrėkite Vauto: ${url}`;
  return {
    url,
    title: meta.og.title,
    text,
    hashtags: ["vauto", "lietuva", listing.category],
  };
}

export function canUseNativeShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export async function shareListingNative(listing: Listing): Promise<boolean> {
  if (!canUseNativeShare()) return false;
  const payload = buildListingSharePayload(listing);
  try {
    await navigator.share({
      title: payload.title,
      text: payload.text,
      url: payload.url,
    });
    return true;
  } catch {
    return false;
  }
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

function encode(text: string): string {
  return encodeURIComponent(text);
}

export function getPlatformShareUrl(
  platform: SocialPlatformId,
  listing: Listing
): string | null {
  const payload = buildListingSharePayload(listing);
  const { url, title, text } = payload;

  switch (platform) {
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${encode(url)}&quote=${encode(text)}`;
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${encode(url)}`;
    case "whatsapp":
      return `https://wa.me/?text=${encode(text)}`;
    case "telegram":
      return `https://t.me/share/url?url=${encode(url)}&text=${encode(title)}`;
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
  listing: Listing
): "opened" | "copied" | "unavailable" {
  const shareUrl = getPlatformShareUrl(platform, listing);
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
  if (platform === "linkedin") {
    return `${payload.title}\n\n${payload.text}\n\n#vauto #prekės #paslaugos`;
  }
  if (platform === "instagram") {
    return `${payload.title} ✨\n${payload.url}\n\n#vauto #lietuva`;
  }
  return payload.text;
}
