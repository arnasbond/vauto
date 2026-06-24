import type { Listing } from "@/lib/types";

export const SERVICE_SPECIALTIES = [
  "Elektrikas",
  "Santechnikas",
  "Statybos darbai",
  "Plytelių klojimas",
  "Valymas",
  "Baldų surinkimas",
  "Apdaila",
  "Stogdengiai",
  "Santechnika / šildymas",
  "Langų montavimas",
  "Transportas / pervežimai",
  "Grožio paslaugos",
  "Kita",
] as const;

export const SERVICE_CITIES = [
  "Vilnius",
  "Kaunas",
  "Klaipėda",
  "Šiauliai",
  "Panevėžys",
  "Alytus",
  "Marijampolė",
  "Visoje Lietuvoje",
  "Kita",
] as const;

export const SERVICE_RADIUS_OPTIONS = ["10 km", "25 km", "50 km", "Visoje Lietuvoje"] as const;

export const SERVICE_URGENCY_OPTIONS = ["Skubu šiandien", "Šią savaitę", "Lankstus laikas"] as const;

export function looksLikeServiceListing(text: string, category?: string): boolean {
  if (category === "services") return true;
  return /\b(meistr|paslaug|elektrik|santechn|valym|remont|statyb|plytel|gro[žz]|kirp|transport)/i.test(
    text
  );
}

export function detectServiceSpecialty(text: string): string | null {
  const t = text.toLowerCase();
  if (/elektrik|rozet|laid/i.test(t)) return "Elektrikas";
  if (/santechn|čiaup|vamzd|kanaliz/i.test(t)) return "Santechnikas";
  if (/plytel|vonios|von/i.test(t)) return "Plytelių klojimas";
  if (/valym|tvark/i.test(t)) return "Valymas";
  if (/statyb|remont|meistr/i.test(t)) return "Statybos darbai";
  if (/bald|surink/i.test(t)) return "Baldų surinkimas";
  if (/stog/i.test(t)) return "Stogdengiai";
  if (/lang|stikl/i.test(t)) return "Langų montavimas";
  if (/gro[žz]|kirp/i.test(t)) return "Grožio paslaugos";
  if (/transport|pervež/i.test(t)) return "Transportas / pervežimai";
  return null;
}

export function formatServiceDisplayTitle(listing: Listing): string {
  const specialty = listing.attributes?.serviceSpecialty;
  const s = Array.isArray(specialty) ? specialty[0] : specialty;
  if (s && String(s).trim()) return String(s);
  return listing.title.split("—")[0]?.split("-")[0]?.trim() || listing.title;
}

export function formatServiceMetaLine(listing: Listing): string {
  const parts = [
    listing.location,
    listing.attributes?.experience
      ? `${listing.attributes.experience} patirtis`
      : null,
    listing.priceLabel || (listing.price > 0 ? `${listing.price}€/val` : null),
  ]
    .flatMap((v) => (Array.isArray(v) ? v : v ? [v] : []))
    .filter(Boolean);
  return parts.join(" · ") || listing.location;
}
