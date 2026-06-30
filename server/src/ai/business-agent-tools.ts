import { getServiceLeadsForProvider } from "../repository.js";
import type { MyListingForAgent } from "./user-agent-context.js";

export interface SellerMetricsPayload {
  views: number;
  callClicks: number;
  chatStarts: number;
  saves: number;
  interestScore: number;
  buyerIntentCount?: number;
}

export interface BusinessInsightsResult {
  message: string;
  quickReplies: string[];
  highlights: string[];
  activeListings: number;
  serviceLeadCount: number;
  unopenedLeadCount: number;
}

export function buildBusinessInsightsSummary(params: {
  userName?: string;
  myListings: MyListingForAgent[];
  metrics: SellerMetricsPayload;
  serviceLeadCount: number;
  unopenedLeadCount: number;
}): BusinessInsightsResult {
  const firstName = (params.userName ?? "drauge").split(/\s+/)[0] || "drauge";
  const active = params.myListings.filter((l) => l.status !== "sold");
  const metrics = params.metrics;
  const highlights: string[] = [];

  if (active.length) {
    highlights.push(`${active.length} aktyvūs skelbimai`);
  }
  if (metrics.views > 0) {
    highlights.push(`${metrics.views} peržiūrų`);
  }
  if (metrics.callClicks + metrics.chatStarts > 0) {
    highlights.push(`${metrics.callClicks + metrics.chatStarts} kontaktų`);
  }
  if ((metrics.buyerIntentCount ?? 0) > 0) {
    highlights.push(`${metrics.buyerIntentCount} pirkėjų norų rinkoje`);
  }
  if (params.unopenedLeadCount > 0) {
    highlights.push(`${params.unopenedLeadCount} nauji paslaugų leadai`);
  }

  const parts: string[] = [];
  if (!active.length) {
    parts.push(`${firstName}, dar neturi aktyvių skelbimų — rekomenduoju pradėti nuo vieno aiškaus skelbimo su nuotrauka.`);
  } else {
    parts.push(
      `${firstName}, tavo verslo apžvalga: ${highlights.join(", ") || "duomenys renkami"}.`
    );
  }

  if (metrics.views > 20 && metrics.interestScore < 25) {
    parts.push(
      "Peržiūrų daug, bet mažai kontaktų — siūlau atnaujinti pirmą nuotrauką ir patikrinti kainą."
    );
  } else if (metrics.views < 5 && active.length > 0) {
    parts.push("Matomumas žemas — verta pakelti Smart Boost arba atnaujinti antraštes.");
  }

  if ((metrics.buyerIntentCount ?? 0) > 0) {
    parts.push(
      `Rinkoje ${metrics.buyerIntentCount} pirkėjų ieško panašių prekių — geras laikas išryškinti skelbimus.`
    );
  }

  if (params.unopenedLeadCount > 0) {
    parts.push(
      `Turi ${params.unopenedLeadCount} neatidarytų paslaugų užklausų — rekomenduoju peržiūrėti leadų dėžutę.`
    );
  }

  const quickReplies = [
    "Atidaryti verslo skydelį",
    ...(params.unopenedLeadCount > 0 ? ["Peržiūrėti leadus"] : []),
    ...(active.length > 0 ? ["Pakelti matomumą"] : ["Įkelti skelbimą"]),
  ].slice(0, 4);

  return {
    message: parts.join(" "),
    quickReplies,
    highlights,
    activeListings: active.length,
    serviceLeadCount: params.serviceLeadCount,
    unopenedLeadCount: params.unopenedLeadCount,
  };
}

export async function fetchServiceLeadStats(authUserId?: string): Promise<{
  leads: Awaited<ReturnType<typeof getServiceLeadsForProvider>>;
  unopened: number;
}> {
  if (!authUserId) {
    return { leads: [], unopened: 0 };
  }
  try {
    const leads = await getServiceLeadsForProvider(authUserId);
    const unopened = leads.filter((l) => !l.opened).length;
    return { leads, unopened };
  } catch {
    return { leads: [], unopened: 0 };
  }
}

export function formatServiceLeadsMessage(
  userName: string | undefined,
  leads: Awaited<ReturnType<typeof getServiceLeadsForProvider>>
): { message: string; quickReplies: string[] } {
  const firstName = (userName ?? "drauge").split(/\s+/)[0] || "drauge";
  if (!leads.length) {
    return {
      message: `${firstName}, šiuo metu naujų paslaugų leadų nėra — stebėsiu rinką ir pranešiu.`,
      quickReplies: ["Atidaryti verslo skydelį", "Įkelti paslaugų skelbimą"],
    };
  }
  const preview = leads
    .slice(0, 4)
    .map((l) => `„${l.query}" (${l.city})`)
    .join("; ");
  const unopened = leads.filter((l) => !l.opened).length;
  return {
    message: `${firstName}, radau ${leads.length} paslaugų užklausų${unopened ? `, ${unopened} dar neatidarytos` : ""}: ${preview}.`,
    quickReplies: ["Atidaryti verslo skydelį", "Peržiūrėti leadus", "Atsakyti klientui"],
  };
}
