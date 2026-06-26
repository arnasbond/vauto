import type { Listing } from "@/lib/types";
import { allSettlements } from "@/data/lithuania-locations";

/** Pilnas paslaugų kategorijų medis (statyba, remontas, grožis, IT ir kt.). */
export const SERVICE_CATEGORY_TREE: Record<string, string[]> = {
  Statyba: [
    "Betonavimo darbai",
    "Griovimo darbai",
    "Grunto darbai",
    "Karkaso statyba",
    "Mūro darbai",
    "Stogdengiai",
    "Statybos darbai",
    "Vidaus apdaila",
    "Vonios remontas",
    "Fasado apdaila",
  ],
  Remontas: [
    "Baldų surinkimas",
    "Durų montavimas",
    "Langų montavimas",
    "Plytelių klojimas",
    "Grindų montavimas",
    "Gipso kartono montavimas",
    "Dažymo darbai",
    "Tapetavimas",
    "Smulkus remontas",
  ],
  "Santechnika / šildymas": [
    "Santechnikas",
    "Vamzdynų montavimas",
    "Radiatorių montavimas",
    "Katilų montavimas",
    "Vandentiekio remontas",
    "Kanalizacijos valymas",
    "Kondicionavimas",
    "Vėdinimas",
  ],
  Elektra: [
    "Elektrikas",
    "Elektros instaliacija",
    "Apšvietimo montavimas",
    "Signalizacijos montavimas",
    "Automatikos montavimas",
    "Skaitiklių keitimas",
  ],
  Grožis: [
    "Grožio paslaugos",
    "Kirpimas",
    "Manikiūras",
    "Pedikiūras",
    "Masažas",
    "Kosmetologija",
    "Depiliacija",
    "Blakstienų priauginimas",
  ],
  IT: [
    "Kompiuterių remontas",
    "Programavimas",
    "Svetainių kūrimas",
    "IT konsultacijos",
    "Tinklo instaliacija",
    "Duomenų atkūrimas",
  ],
  Valymas: [
    "Valymas",
    "Generalinis valymas",
    "Langų valymas",
    "Po statybų valymas",
    "Kilimų valymas",
    "Biuro valymas",
  ],
  Transportas: [
    "Transportas / pervežimai",
    "Krovininis transportas",
    "Perkraustymo paslaugos",
    "Evakuatorius",
    "Vairuotojo paslaugos",
  ],
  Automobiliai: [
    "Autoservisas",
    "Padangų montavimas",
    "Automobilio detailing",
    "TA paruošimas",
    "Kėbulo remontas",
    "Variklio remontas",
  ],
  Kita: ["Kita"],
};

const SERVICE_CATEGORY_TREE_FLAT = [
  ...Object.values(SERVICE_CATEGORY_TREE).flat(),
  "Akmens mūro darbai",
  "Architektūros paslaugos",
  "Aukštalipių paslaugos",
  "Buitinės technikos remontas",
  "Dailidės paslaugos",
  "Fotografavimas",
  "Grafikos dizainas",
  "Interjero dizainas",
  "Kambarių valymas",
  "Konsultacijos",
  "Lauko darbai",
  "Medžio apdirbimas",
  "Oro kondicionavimas",
  "Pirties statyba",
  "Santechnika / šildymas",
  "Stoglangių montavimas",
  "Teritorijos tvarkymas",
  "Tvirtinimo darbai",
  "Vandens gręžiniai",
  "Video montavimas",
  "Virtuvės montavimas",
  "Zemės kasimo darbai",
  "Kita",
] as const;

export const SERVICE_SPECIALTIES = [...new Set(SERVICE_CATEGORY_TREE_FLAT)] as readonly string[];

export const SERVICE_CITIES = [
  ...allSettlements(),
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
