import { runMarketPriceAnalysis, type MarketPriceAnalysisResult } from "./market-price-analysis.js";
import { buildProactivePricingMessage } from "./proactive-agent.js";
import {
  buildSmartBoostProactiveMessage,
  resolveMonetizationState,
  shouldOfferSmartBoost,
  type MonetizationState,
} from "./monetization-engine.js";

export interface BackgroundListingSummary {
  id: string;
  title: string;
  price: number;
  category: string;
  location: string;
  description?: string;
}

export interface DeferredListingAnalysisInput {
  listings: BackgroundListingSummary[];
  title: string;
  category: string;
  city: string;
  make: string;
  model: string;
  year: string;
  price: number;
  userRole?: string;
  monetization?: MonetizationState;
}

export interface DeferredListingAnalysisResult {
  marketAnalysis: MarketPriceAnalysisResult;
  proactivePricingMessage: string | null;
  completedAt: string;
  durationMs: number;
}

const pendingJobs = new Map<string, Promise<DeferredListingAnalysisResult>>();

function jobKey(input: DeferredListingAnalysisInput): string {
  return `${input.title}|${input.price}|${input.city}`.slice(0, 120);
}

/**
 * Runs market analysis off the hot path so postNewListing can return immediately.
 */
export function scheduleDeferredListingMarketAnalysis(
  input: DeferredListingAnalysisInput
): Promise<DeferredListingAnalysisResult> {
  const key = jobKey(input);
  const existing = pendingJobs.get(key);
  if (existing) return existing;

  const started = Date.now();
  const job = new Promise<DeferredListingAnalysisResult>((resolve) => {
    setImmediate(() => {
      const monState =
        input.monetization ??
        resolveMonetizationState({ userRole: input.userRole ?? "buyer" });

      const marketAnalysis = runMarketPriceAnalysis(input.listings, {
        title: input.title,
        category: input.category,
        city: input.city,
        make: input.make,
        model: input.model,
        year: input.year,
      });

      let proactivePricingMessage: string | null = null;
      if (input.price > 0) {
        if (shouldOfferSmartBoost(monState, input.price, marketAnalysis.medianPrice)) {
          proactivePricingMessage = buildSmartBoostProactiveMessage(
            input.price,
            marketAnalysis.medianPrice!,
            monState,
            input.title
          );
        } else {
          proactivePricingMessage = buildProactivePricingMessage(
            input.price,
            marketAnalysis,
            input.title
          );
        }
      }

      const result: DeferredListingAnalysisResult = {
        marketAnalysis,
        proactivePricingMessage,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
      };

      console.info(
        "[VAUTO Background]",
        JSON.stringify({
          type: "deferred_market_analysis",
          title: input.title,
          price: input.price,
          durationMs: result.durationMs,
          medianPrice: marketAnalysis.medianPrice,
          proactivePricingMessage,
        })
      );

      resolve(result);
      pendingJobs.delete(key);
    });
  });

  pendingJobs.set(key, job);
  return job;
}

export function getPendingBackgroundAnalysisCount(): number {
  return pendingJobs.size;
}
