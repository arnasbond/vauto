/** CVbankas.lt-style job listing catalog and helpers. */

import type { Listing } from "@/lib/types";
import { JOB_TYPE_OFFER, JOB_TYPE_SEEK } from "@/lib/jobs";

export const JOB_LOCATION_TYPES = ["Lietuva", "Užsienis", "Darbas namuose"] as const;
export const JOB_GROUPS = ["Vadovai", "Specialistai", "Darbininkai"] as const;
export const EXPERIENCE_AREAS = [
  "IT",
  "Pardavimai",
  "Transportas",
  "Finansai",
  "Gamyba",
  "Klientų aptarnavimas",
  "IT / inžinerija",
  "Logistika / sandėliavimas",
  "Prekyba",
  "Administravimas / apskaita",
  "Sveikatos apsauga",
  "Statyba",
  "Maisto gamyba / restoranai",
  "Kita",
] as const;

export const EDUCATION_LEVELS = [
  "Vidurinis",
  "Profesinis",
  "Aukštasis koleginis",
  "Aukštasis universitetinis",
] as const;

export const LANGUAGE_OPTIONS = ["Lietuvių", "Anglų", "Rusų", "Vokiečių", "Lenkų"] as const;

export const LANGUAGE_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

export const EMPLOYMENT_TYPES_FULL = [
  "Pilnas etatas",
  "Pusė etato",
  "Projektinis",
  "Praktika",
  "Pamaininis darbas",
] as const;

export const EXPERIENCE_YEARS = ["Nereikia", "1-2 metai", "3-5 metai", "5+ metų"] as const;

export const SALARY_GROSS_NET = ["Bruto", "Neto"] as const;

export const WORK_LOCATION_MODES = ["Nuotolinis", "Ofise", "Hibridinis"] as const;

export const JOB_CITIES = [
  "Vilnius",
  "Kaunas",
  "Klaipėda",
  "Šiauliai",
  "Panevėžys",
  "Alytus",
  "Utena",
  "Visa Lietuva",
  "Kita",
] as const;

export const SALARY_DISPLAY_TYPES = ["Į rankas", "Neatskaičius mokesčių"] as const;
export const SALARY_PERIODS = ["€/mėn.", "€/d.", "€/val."] as const;
export const AD_LANGUAGES = ["LT", "EN", "UA", "RU"] as const;
export const AD_VALIDITY_OPTIONS = ["7 dienų", "14 dienų", "30 dienų", "60 dienų"] as const;
export const CV_PERIODS = ["Visi CV", "Paskutinės 7 dienos", "Paskutinis mėnuo"] as const;

export const BENEFIT_CATEGORIES: Record<string, string[]> = {
  "Darbo ir laisvalaikio balansas": [
    "Lankstus darbo grafikas",
    "Galimybė dirbti nuotoliniu būdu",
    "Papildomos apmokamos atostogos",
  ],
  Sveikatingumas: ["Sveikatos draudimas", "Sporto klubo abonementas"],
  Biuras: [
    "Stalo futbolas",
    "Stalo tenisas",
    "Žaidimų konsolės",
    "Nemokami užkandžiai",
    "Dviračių saugykla",
    "Dušas",
  ],
  Transportas: [
    "Kelionės į/iš darbo kompensavimas",
    "Nemokamas automobilio parkingas",
    "Darbo automobilis asmeniniam naudojimui",
  ],
  "Kiti privalumai": [
    "Telefonas asmeniniam naudojimui",
    "Kompiuteris asmeniniam naudojimui",
    "Nuolaidos įmonės produkcijai/paslaugoms",
    "Reguliarūs mokymai",
  ],
};

export function attrString(
  attrs: Record<string, string | string[] | undefined> | undefined,
  key: string
): string {
  const v = attrs?.[key];
  if (Array.isArray(v)) return v.join(", ");
  return String(v ?? "");
}

export function formatJobDisplayTitle(listing: Listing): string {
  const attrs = listing.attributes ?? {};
  const position = attrString(attrs, "jobTitle") || listing.title;
  const employer = attrString(attrs, "employerName");
  const locType = attrString(attrs, "locationType");
  const city = listing.location.split(",")[0]?.trim();
  const locExtra =
    locType === "Darbas namuose"
      ? "nuotolinis"
      : city && !position.toLowerCase().includes(city.toLowerCase())
        ? city
        : "";
  const base = [position, locExtra].filter(Boolean).join(" ");
  if (employer) return `${base} (darbdavys - ${employer})`;
  return base;
}

export function formatJobMetaLine(listing: Listing): string {
  const city = listing.location.split(",")[0]?.trim() || listing.location;
  const days = daysSince(listing.createdAt);
  if (days <= 1) return `${city} · šiandien`;
  if (days < 7) return `${city} · prieš ${days} d.`;
  const expires = listing.expiresAt;
  if (expires) {
    const left = Math.ceil((new Date(expires).getTime() - Date.now()) / 86_400_000);
    if (left > 0 && left <= 3) return `${city} · Liko ${left} d.`;
  }
  return city;
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export function looksLikeJobListing(text: string, category?: string): boolean {
  if (category === "jobs") return true;
  return /\b(darbas|atlygin|etat|cv\b|kandidat|vairuotoj|sand[eė]l|kurjer|ie[šs]kau darbo|si[uū]lau darb|pareig|buhalter)/i.test(
    text
  );
}

export function detectExperienceArea(text: string): string | null {
  const t = text.toLowerCase();
  if (/it|program|frontend|developer|inžinier/i.test(t)) return "IT / inžinerija";
  if (/sand[eė]l|logistik/i.test(t)) return "Logistika / sandėliavimas";
  if (/vairuotoj|kurjer|transport/i.test(t)) return "Transportas";
  if (/barista|kavin|restoran|maisto/i.test(t)) return "Maisto gamyba / restoranai";
  if (/buhalter|apskait|administr/i.test(t)) return "Administravimas / apskaita";
  return null;
}

export function detectJobGroup(text: string): string {
  if (/vadov|direktor|manager|team lead/i.test(text)) return "Vadovai";
  if (/specialist|inžinier|buhalter|programuotoj/i.test(text)) return "Specialistai";
  return "Darbininkai";
}

export function detectLocationType(text: string): string {
  if (/nuotolin|namuose|remote/i.test(text)) return "Darbas namuose";
  if (/latvij|lenk|užsien|vokiet/i.test(text)) return "Užsienis";
  return "Lietuva";
}

export function defaultJobType(text: string): string {
  return /ieškau darbo|ieškau darbą/i.test(text) ? JOB_TYPE_SEEK : JOB_TYPE_OFFER;
}

export function buildSalaryLabel(
  attrs: Record<string, string | string[] | undefined>
): string {
  const from = attrString(attrs, "salaryFrom");
  const to = attrString(attrs, "salaryTo");
  const fixed = attrString(attrs, "salaryFixed");
  const period = attrString(attrs, "salaryPeriod") || "€/mėn.";
  if (fixed) return `${fixed}${period}`;
  if (from && to) return `${from}–${to}${period}`;
  if (from) return `nuo ${from}${period}`;
  return "";
}
