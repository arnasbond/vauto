import {
  categoryHashtags,
  listingShareUrl,
  mergeSocialShareAttributes,
  readStoredSocialShare,
  type SocialShareTone,
  type StoredSocialShare,
} from "../shared/listing-og.js";
import { unifiedLlmJson } from "./llm-provider.js";

export type SocialSharePlatform = "facebook" | "instagram" | "both";

export interface ListingShareCopy {
  facebook: string;
  instagram: string;
  caption: string;
  hashtags: string[];
  url: string;
  tone: SocialShareTone;
}

const TONE_SYSTEM: Record<SocialShareTone, string> = {
  casual:
    "Toną: draugiškas, energingas, su emoji (saikingai), kabliukai, lietuviškai. Tinka WhatsApp / Facebook.",
  neutral:
    "Toną: aiškus, informatyvus, be perdėto pardavimo spaudimo, 0–2 emoji. Tinka plačiai auditorijai.",
  business:
    "Toną: profesionalus B2B / NT / paslaugų stilius, be slang'o, be emoji spiečiaus (max 1). Trumpas ir patikimas.",
};

function fallbackShareCopy(input: {
  title: string;
  price: number;
  city: string;
  category: string;
  slug?: string;
  listingId: string;
  attributes?: Record<string, unknown>;
  tone: SocialShareTone;
}): ListingShareCopy {
  const url = listingShareUrl({ id: input.listingId, slug: input.slug });
  const price = input.price > 0 ? `${input.price.toFixed(0)} €` : "Kaina derinama";
  const city = input.city.trim() || "Lietuva";
  const brand = String(input.attributes?.brand ?? input.attributes?.make ?? "").trim();
  const size = String(input.attributes?.size ?? input.attributes?.clothingSize ?? "").trim();
  const detail = [brand, size].filter(Boolean).join(" · ");
  const hook = detail ? `${input.title} (${detail})` : input.title;
  const hashtags = categoryHashtags(input.category, city);
  const tagLine = hashtags.map((t) => `#${t}`).join(" ");

  let facebook: string;
  let instagram: string;
  if (input.tone === "business") {
    facebook = `${hook} — ${price}, ${city}. Daugiau: ${url}`;
    instagram = `${hook}\n${price} · ${city}\n${url}\n${tagLine}`;
  } else if (input.tone === "neutral") {
    facebook = `${hook} · ${price} · ${city}. VAUTO: ${url}`;
    instagram = `${hook}\n${price} · ${city}\n${url}\n${tagLine}`;
  } else {
    facebook = `🔥 ${hook} — ${price}, ${city}! Peržiūrėkite VAUTO: ${url}`;
    instagram = `✨ ${hook}\n💶 ${price} · 📍 ${city}\n👉 ${url}\n${tagLine}`;
  }

  return {
    facebook,
    instagram,
    caption: facebook,
    hashtags,
    url,
    tone: input.tone,
  };
}

/**
 * AI Social Share — parduodantis tekstas pagal toną + kategorijos hashtags.
 */
export async function generateListingShareCopy(input: {
  listingId: string;
  slug?: string;
  title: string;
  price: number;
  city: string;
  category: string;
  description?: string;
  attributes?: Record<string, unknown>;
  imageAlt?: string;
  tone?: SocialShareTone;
}): Promise<ListingShareCopy> {
  const tone: SocialShareTone =
    input.tone === "neutral" || input.tone === "business" ? input.tone : "casual";

  const stored = readStoredSocialShare(input.attributes);
  if (stored && stored.tone === tone && stored.caption) {
    const url = listingShareUrl({ id: input.listingId, slug: input.slug });
    return {
      facebook: stored.facebook || stored.caption,
      instagram: stored.instagram || stored.caption,
      caption: stored.caption,
      hashtags: stored.hashtags.length
        ? stored.hashtags
        : categoryHashtags(input.category, input.city),
      url,
      tone,
    };
  }

  const fallback = fallbackShareCopy({ ...input, tone });
  const attrs = input.attributes ?? {};
  // Never send contact/phone into the LLM prompt for social copy.
  const safeAttrEntries = Object.entries(attrs)
    .filter(([k]) => !/phone|contact|email|telegram|whatsapp|_socialShare/i.test(k))
    .slice(0, 12)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n");

  try {
    const raw = await unifiedLlmJson({
      systemInstruction: `Tu esi VAUTO socialinių tinklų copywriter Lietuvoje.
Grąžink JSON: {"facebook":"string","instagram":"string","caption":"string","hashtags":["string"]}
facebook — iki 280 simbolių, ${TONE_SYSTEM[tone]}
instagram — iki 400 simbolių, eilučių lūžiai, hashtag'ai pabaigoje.
caption — universalus tekstas WhatsApp/Telegram/Viber (iki 280).
Nenaudok telefono numerių, el. pašto ar tikslių adresų.
Būk konkretus — ne generic „puiki prekė".`,
      prompt: `Skelbimas: ${input.title}
Kaina: ${input.price} EUR
Miestas: ${input.city}
Kategorija: ${input.category}
Aprašymas: ${input.description ?? ""}
Atributai:
${safeAttrEntries || "—"}
Alt: ${input.imageAlt ?? "—"}
Privaloma nuoroda visuose tekstuose: ${fallback.url}
Siūlomi hashtags: ${fallback.hashtags.map((t) => `#${t}`).join(" ")}`,
    });

    const facebook =
      typeof raw.facebook === "string" && raw.facebook.trim()
        ? raw.facebook.trim()
        : fallback.facebook;
    const instagram =
      typeof raw.instagram === "string" && raw.instagram.trim()
        ? raw.instagram.trim()
        : fallback.instagram;
    const caption =
      typeof raw.caption === "string" && raw.caption.trim()
        ? raw.caption.trim()
        : facebook;
    const hashtags = Array.isArray(raw.hashtags)
      ? raw.hashtags.map((t) => String(t).replace(/^#/, "")).slice(0, 10)
      : fallback.hashtags;

    return { facebook, instagram, caption, hashtags, url: fallback.url, tone };
  } catch {
    return fallback;
  }
}

export function toStoredSocialShare(copy: ListingShareCopy): StoredSocialShare {
  return {
    tone: copy.tone,
    caption: copy.caption,
    facebook: copy.facebook,
    instagram: copy.instagram,
    hashtags: copy.hashtags,
    updatedAt: new Date().toISOString(),
  };
}

export { mergeSocialShareAttributes, readStoredSocialShare };

export function pickShareText(
  copy: ListingShareCopy,
  platform: SocialSharePlatform
): string {
  if (platform === "facebook") return copy.facebook;
  if (platform === "instagram") return copy.instagram;
  return `${copy.facebook}\n\n---\n\n${copy.instagram}`;
}
