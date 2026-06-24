import { resolveLtCityNominative } from "../ai/lithuanian-location-normalize.js";
import {
  applySessionUtterance,
  type AgentSearchFilters,
} from "../ai/agent-session-memory.js";
import { buildProactiveSearchResetMessage } from "../ai/proactive-agent.js";
import { scheduleDeferredListingMarketAnalysis } from "../ai/background-market-analysis.js";
import type { BackgroundListingSummary } from "../ai/background-market-analysis.js";

export interface E2eSimulationStep {
  phase: string;
  utterance: string;
  normalizedCity?: string;
  filters: AgentSearchFilters;
  sessionReset: boolean;
  refinement: string | null;
  proactiveTts?: string;
}

export interface E2eSimulationResult {
  ok: true;
  scenario: "buyer_search_refinement";
  steps: E2eSimulationStep[];
  finalFilters: AgentSearchFilters;
  proactiveTts: string;
  backgroundAnalysis?: {
    medianPrice: number | null;
    proactivePricingMessage: string | null;
    durationMs: number;
  };
}

const DEMO_LISTINGS: BackgroundListingSummary[] = [
  {
    id: "sim-1",
    title: "Volvo V70 dalys — bamperis",
    price: 120,
    category: "vehicles",
    location: "Pasvalys, Lietuva",
    description: "Pilkos spalvos priekinis bamperis",
  },
  {
    id: "sim-2",
    title: "BMW 520 dyzelinas",
    price: 8900,
    category: "vehicles",
    location: "Kaunas",
    description: "2018 m. pilka",
  },
  {
    id: "sim-3",
    title: "iPhone 14 Pro",
    price: 720,
    category: "electronics",
    location: "Panevėžys",
  },
];

function buildSearchProactiveTts(filters: AgentSearchFilters, count = 3): string {
  const city = filters.city ?? "Lietuva";
  const query = filters.query ?? "paieška";
  return `Radau ${count} skelbimus ${city} regione pagal „${query}". ${buildProactiveSearchResetMessage(undefined, query)}`;
}

export async function runVautoE2eSimulation(): Promise<E2eSimulationResult> {
  const initialUtterance = "ieškau dalių Pasvalyje";
  const followUpUtterance = "o dabar tik pilkos spalvos";

  const normalizedCity = resolveLtCityNominative("Pasvalyje");
  const step1 = applySessionUtterance(initialUtterance, null);
  const step2 = applySessionUtterance(followUpUtterance, step1.filters);

  const proactiveTtsStep1 = buildSearchProactiveTts(step1.filters, 2);
  const proactiveTtsFinal = `Senus paieškos kriterijus sujungiau. ${buildSearchProactiveTts(step2.filters, 1)}`;

  const steps: E2eSimulationStep[] = [
    {
      phase: "initial_search",
      utterance: initialUtterance,
      normalizedCity,
      filters: step1.filters,
      sessionReset: step1.sessionReset,
      refinement: step1.refinement,
      proactiveTts: proactiveTtsStep1,
    },
    {
      phase: "session_refinement",
      utterance: followUpUtterance,
      normalizedCity: step2.filters.city,
      filters: step2.filters,
      sessionReset: step2.sessionReset,
      refinement: step2.refinement,
      proactiveTts: proactiveTtsFinal,
    },
  ];

  const background = await scheduleDeferredListingMarketAnalysis({
    listings: DEMO_LISTINGS,
    title: "iPhone 14 Pro",
    category: "electronics",
    city: "Kaunas",
    make: "iphone",
    model: "14 pro",
    year: "",
    price: 800,
    userRole: "seller",
  });

  const result: E2eSimulationResult = {
    ok: true,
    scenario: "buyer_search_refinement",
    steps,
    finalFilters: step2.filters,
    proactiveTts: proactiveTtsFinal,
    backgroundAnalysis: {
      medianPrice: background.marketAnalysis.medianPrice,
      proactivePricingMessage: background.proactivePricingMessage,
      durationMs: background.durationMs,
    },
  };

  console.info("[VAUTO E2E Simulation]", JSON.stringify(result, null, 2));
  return result;
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  process.argv[1].replace(/\\/g, "/").includes("vauto-e2e-simulation");

if (isDirectRun) {
  runVautoE2eSimulation()
    .then((r) => {
      process.stdout.write(`${JSON.stringify(r)}\n`);
      process.exit(0);
    })
    .catch((e) => {
      console.error("[VAUTO E2E Simulation] failed", e);
      process.exit(1);
    });
}
