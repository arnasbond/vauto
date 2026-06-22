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
  requiredSpecialties: string[];
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
