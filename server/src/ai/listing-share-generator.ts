import { unifiedLlmJson } from "./llm-provider.js";

export type SocialSharePlatform = "facebook" | "instagram" | "both";

export interface ListingShareCopy {
  facebook: string;
  instagram: string;
  hashtags: string[];
  url: string;
}

function listingUrl(slug: string, listingId: string): string {
  const origin = (process.env.APP_ORIGIN ?? "https://vauto.lt").replace(/\/$/, "");
  const path = slug ? `/listing/${slug}/` : `/listing/${listingId}/`;
  return `${origin}${path}`;
}

function fallbackShareCopy(input: {
  title: string;
  price: number;
  city: string;
  category: string;
  slug?: string;
  listingId: string;
  attributes?: Record<string, unknown>;
}): ListingShareCopy {
  const url = listingUrl(input.slug ?? "", input.listingId);
  const price = input.price > 0 ? `${input.price.toFixed(0)} €` : "Kaina derinama";
  const city = input.city.trim() || "Lietuva";
  const brand = String(input.attributes?.brand ?? input.attributes?.make ?? "").trim();
  const size = String(input.attributes?.size ?? input.attributes?.clothingSize ?? "").trim();
  const detail = [brand, size].filter(Boolean).join(" · ");
  const hook = detail ? `${input.title} (${detail})` : input.title;

  const facebook = `🔥 ${hook} — ${price}, ${city}! Peržiūrėkite VAUTO: ${url}`;
  const instagram = `✨ ${hook}\n💶 ${price} · 📍 ${city}\n👉 Nuoroda bio / Stories: ${url}\n#vauto #spinta #${input.category}`;

  return {
    facebook,
    instagram,
    hashtags: ["vauto", "spinta", input.category, city.toLowerCase().replace(/\s+/g, "")].filter(Boolean),
    url,
  };
}

/**
 * AI Social Share — parduodantis tekstas Facebook / Instagram pagal Vision atributus.
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
}): Promise<ListingShareCopy> {
  const fallback = fallbackShareCopy(input);
  const attrs = input.attributes ?? {};
  const attrLines = Object.entries(attrs)
    .slice(0, 12)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n");

  try {
    const raw = await unifiedLlmJson({
      systemInstruction: `Tu esi VAUTO socialinių tinklų copywriter Lietuvoje.
Grąžink JSON: {"facebook":"string","instagram":"string","hashtags":["string"]}
facebook — iki 280 simbolių, parduodantis tonas, su emoji, lietuviškai, su nuoroda.
instagram — iki 400 simbolių, stilingas, su eilučių lūžiais, hashtag'ai pabaigoje.
Naudok Vision atributus (prekės ženklas, dydis, spalva, būklė) natūraliai.
Būk konkretus — ne generic „puiki prekė".`,
      prompt: `Skelbimas: ${input.title}
Kaina: ${input.price} EUR
Miestas: ${input.city}
Kategorija: ${input.category}
Aprašymas: ${input.description ?? ""}
Vision / atributai:
${attrLines || "—"}
Alt tekstas: ${input.imageAlt ?? "—"}
Nuoroda (PRIVALOMA abiejuose tekstuose): ${fallback.url}`,
    });

    const facebook =
      typeof raw.facebook === "string" && raw.facebook.trim()
        ? raw.facebook.trim()
        : fallback.facebook;
    const instagram =
      typeof raw.instagram === "string" && raw.instagram.trim()
        ? raw.instagram.trim()
        : fallback.instagram;
    const hashtags = Array.isArray(raw.hashtags)
      ? raw.hashtags.map(String).slice(0, 8)
      : fallback.hashtags;

    return { facebook, instagram, hashtags, url: fallback.url };
  } catch {
    return fallback;
  }
}

export function pickShareText(
  copy: ListingShareCopy,
  platform: SocialSharePlatform
): string {
  if (platform === "facebook") return copy.facebook;
  if (platform === "instagram") return copy.instagram;
  return `${copy.facebook}\n\n---\n\n${copy.instagram}`;
}
