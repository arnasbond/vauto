const { runMarketPriceAnalysis } = require("./market-price-analysis");
const { buildProactivePricingMessage } = require("./proactive-agent");
const {
  buildSmartBoostProactiveMessage,
  resolveMonetizationState,
  shouldOfferSmartBoost,
} = require("./monetization-engine");

const pendingJobs = new Map();

function jobKey(input) {
  return `${input.title}|${input.price}|${input.city}`.slice(0, 120);
}

function scheduleDeferredListingMarketAnalysis(input) {
  const key = jobKey(input);
  const existing = pendingJobs.get(key);
  if (existing) return existing;

  const started = Date.now();
  const job = new Promise((resolve) => {
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

      let proactivePricingMessage = null;
      if (input.price > 0) {
        if (shouldOfferSmartBoost(monState, input.price, marketAnalysis.medianPrice)) {
          proactivePricingMessage = buildSmartBoostProactiveMessage(
            input.price,
            marketAnalysis.medianPrice,
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

      const result = {
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

module.exports = { scheduleDeferredListingMarketAnalysis };
