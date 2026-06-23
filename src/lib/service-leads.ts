export type ServiceUrgency = "today" | "this_week" | "flexible";

export interface ServiceLead {
  id: string;
  title: string;
  city: string;
  category: string;
  summary: string;
  urgency: ServiceUrgency;
  budgetHint: string;
  leadPrice: number;
  createdAt: string;
  hiddenContact: string;
  /** Revealed after pay-per-lead open */
  contactPhone?: string;
  requiredSpecialties: string[];
  /** Live lead from buyer search (not demo seed) */
  source?: "demo" | "buyer";
  sourceUserId?: string;
  query?: string;
}

const CITY_PATTERNS: Array<[RegExp, string]> = [
  [/vilniuje|vilnius/i, "Vilnius"],
  [/kaune|kaunas/i, "Kaunas"],
  [/klaip[eė]doje|klaip[eė]da/i, "Klaipėda"],
  [/[šs]iauliuose|[šs]iauliai/i, "Šiauliai"],
  [/panev[eė][žz]yje|panev[eė][žz]ys/i, "Panevėžys"],
  [/alytuje|alytus/i, "Alytus"],
  [/marijampol[eė]je|marijampol[eė]/i, "Marijampolė"],
  [/utenoje|utena/i, "Utena"],
  [/palangoje|palanga/i, "Palanga"],
];

export function detectCityFromServiceQuery(query: string): string {
  for (const [pattern, city] of CITY_PATTERNS) {
    if (pattern.test(query)) return city;
  }
  return "Vilnius";
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return "+370 6•• •••••";
  return `+370 6•• •••••`;
}

function detectUrgency(query: string): ServiceUrgency {
  if (/skub|šiandien|greit|nedelsiant/i.test(query)) return "today";
  if (/savait/i.test(query)) return "this_week";
  return "flexible";
}

function leadTitleFromQuery(query: string): string {
  const q = query.trim();
  if (q.length <= 60) return q;
  return `${q.slice(0, 57)}…`;
}

/** Create a buyer service lead from search / voice / photo flow */
export function buildServiceLeadFromQuery(
  query: string,
  opts?: { userId?: string; contactPhone?: string; defaultCity?: string }
): ServiceLead | null {
  const q = query.trim();
  if (q.length < 6 || !isServiceDemandQuery(q)) return null;

  const city =
    detectCityFromServiceQuery(q) !== "Vilnius"
      ? detectCityFromServiceQuery(q)
      : opts?.defaultCity ?? "Vilnius";

  let category = "Meistras";
  if (/elektrik/i.test(q)) category = "Elektrikas";
  else if (/santechn|čiaup/i.test(q)) category = "Santechnikas";
  else if (/valym/i.test(q)) category = "Valymas";
  else if (/statyb|plytel|remont/i.test(q)) category = "Statybos";
  else if (/gro[žz]|kirp/i.test(q)) category = "Grožio paslaugos";

  const contact = opts?.contactPhone?.trim() || "+370 612 44550";

  return {
    id: `lead-live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: leadTitleFromQuery(q),
    city,
    category,
    summary: `Kliento užklausa: ${q}`,
    urgency: detectUrgency(q),
    budgetHint: "Sutarti su klientu",
    leadPrice: 1.2,
    createdAt: new Date().toISOString(),
    hiddenContact: maskPhone(contact),
    contactPhone: contact,
    requiredSpecialties: [category],
    source: "buyer",
    sourceUserId: opts?.userId,
    query: q,
  };
}

/** Demo seeds + live buyer leads — live wins on id conflict */
export function mergeServiceLeads(
  live: ServiceLead[],
  opts?: { includeDemo?: boolean }
): ServiceLead[] {
  const includeDemo = opts?.includeDemo ?? true;
  const byId = new Map<string, ServiceLead>();
  if (includeDemo) {
    for (const lead of DEMO_SERVICE_LEADS) {
      byId.set(lead.id, { ...lead, source: "demo" });
    }
  }
  for (const lead of live) {
    byId.set(lead.id, lead);
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export type ServiceCoverageTier = "local" | "regional" | "national";

export const SERVICE_REQUEST_TEMPLATES = [
  {
    label: "Elektrikas",
    query: "reikia elektriko Vilniuje pakeisti 4 rozetes skubiai",
  },
  {
    label: "Santechnikas",
    query: "varva čiaupas Kaune reikia santechniko šiandien",
  },
  {
    label: "Valymas",
    query: "reikia buto valymo Klaipėdoje šią savaitę",
  },
  {
    label: "Statybos",
    query: "reikia plytelių meistro Vilniuje vonios kampui",
  },
] as const;

export const DEMO_SERVICE_LEADS: ServiceLead[] = [
  {
    id: "lead-electric-1",
    title: "Pakeisti 4 rozetes virtuvėje",
    city: "Vilnius",
    category: "Elektrikas",
    summary: "Klientas ieško elektriko šiandien arba rytoj. Reikia pakeisti 4 rozetes virtuvėje.",
    urgency: "today",
    budgetHint: "40–80 €",
    leadPrice: 1.5,
    createdAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    hiddenContact: "+370 6•• •••••",
    requiredSpecialties: ["Elektrika", "Remontas"],
  },
  {
    id: "lead-plumbing-1",
    title: "Varva čiaupas vonioje",
    city: "Kaunas",
    category: "Santechnikas",
    summary: "Nuotraukoje matosi pratekėjimas po kriaukle. Klientas nori greito kontakto.",
    urgency: "today",
    budgetHint: "30–70 €",
    leadPrice: 1.2,
    createdAt: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    hiddenContact: "+370 6•• •••••",
    requiredSpecialties: ["Santechnika", "Remontas"],
  },
  {
    id: "lead-cleaning-1",
    title: "Buto valymas po nuomos",
    city: "Klaipėda",
    category: "Valymas",
    summary: "2 kambarių butas, reikia generalinio valymo šią savaitę.",
    urgency: "this_week",
    budgetHint: "60–120 €",
    leadPrice: 0.8,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    hiddenContact: "+370 6•• •••••",
    requiredSpecialties: ["Valymas"],
  },
];

export function urgencyLabel(urgency: ServiceUrgency): string {
  switch (urgency) {
    case "today":
      return "Skubu šiandien";
    case "this_week":
      return "Šią savaitę";
    default:
      return "Lankstus laikas";
  }
}

export function isServiceDemandQuery(query: string): boolean {
  return /reikia|ieškau|surask|meistr|elektrik|santechn|valym|statyb|plytel|remont|gro[žz]/i.test(
    query
  );
}

export function coverageTier(radiusKm?: number, nationwide?: boolean): ServiceCoverageTier {
  if (nationwide || (radiusKm ?? 0) >= 999) return "national";
  if ((radiusKm ?? 25) > 25) return "regional";
  return "local";
}

export function leadPriceForCoverage(basePrice: number, params: {
  radiusKm?: number;
  nationwide?: boolean;
  topRatedPlus?: boolean;
}): number {
  const tier = coverageTier(params.radiusKm, params.nationwide);
  const multiplier = tier === "national" ? 2 : tier === "regional" ? 1.5 : 1;
  const discount = params.topRatedPlus ? 0.85 : 1;
  return Math.round(basePrice * multiplier * discount * 100) / 100;
}

export function serviceLeadMatchesProvider(
  lead: ServiceLead,
  provider: {
    serviceBaseCity?: string;
    serviceNationwide?: boolean;
    serviceSpecialties?: string[];
  }
): boolean {
  if (!provider.serviceNationwide && provider.serviceBaseCity) {
    if (provider.serviceBaseCity.toLowerCase() !== lead.city.toLowerCase()) {
      return false;
    }
  }
  const specialties = provider.serviceSpecialties ?? [];
  if (specialties.length === 0) return true;
  return lead.requiredSpecialties.some((required) =>
    specialties.some((specialty) =>
      specialty.toLowerCase().includes(required.toLowerCase()) ||
      required.toLowerCase().includes(specialty.toLowerCase())
    )
  );
}

export function isTopRatedPlus(params: {
  rating: number;
  averageResponseMinutes?: number;
}): boolean {
  return params.rating >= 4.8 && (params.averageResponseMinutes ?? 999) <= 15;
}
