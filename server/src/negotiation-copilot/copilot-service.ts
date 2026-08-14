/**
 * Negotiation Copilot service — read-only facade.
 */

import type { TxQueryable } from "../transaction/repository.js";
import {
  CopilotContextLoader,
  type MarketScorePorts,
} from "./context-loader.js";
import {
  buildRecommendation,
  buildRecommendationAsync,
  copilotTelemetry,
  type LlmExplainer,
} from "./recommendation-engine.js";
import { RecommendBodySchema } from "./schema.js";
import {
  CopilotValidationError,
  type CopilotRecommendation,
} from "./types.js";
import { NEGOTIATION_COPILOT_VERSION } from "./version.js";

export class NegotiationCopilotService {
  private readonly loader: CopilotContextLoader;

  constructor(
    db: TxQueryable,
    ports: MarketScorePorts = {},
    private readonly llmExplainer?: LlmExplainer
  ) {
    this.loader = new CopilotContextLoader(db, ports);
  }

  async recommend(input: {
    transactionId: string;
    actorUserId: string;
    body: unknown;
  }): Promise<CopilotRecommendation> {
    let parsed;
    try {
      parsed = RecommendBodySchema.parse(input.body ?? {});
    } catch (e) {
      throw new CopilotValidationError(
        e instanceof Error ? e.message : "invalid_body"
      );
    }
    const ctx = await this.loader.load({
      transactionId: input.transactionId,
      actorUserId: input.actorUserId,
      goal: parsed.goal,
      expectedTransactionVersion: parsed.expectedTransactionVersion,
      expectedActiveOfferVersion: parsed.expectedActiveOfferVersion,
    });
    const rec = await buildRecommendationAsync(ctx, {
      llmExplainer: this.llmExplainer,
    });
    console.info(
      "[negotiation-copilot]",
      JSON.stringify(copilotTelemetry(rec))
    );
    return rec;
  }

  async draftMessage(input: {
    transactionId: string;
    actorUserId: string;
    body: unknown;
  }): Promise<{
    draftMessageLt: string;
    recommendation: CopilotRecommendation;
    executableAction: null;
    requiresUserConfirmation: true;
    copilotVersion: typeof NEGOTIATION_COPILOT_VERSION;
  }> {
    const recommendation = await this.recommend(input);
    return {
      draftMessageLt:
        recommendation.draftMessageLt ??
        "Sveiki, norėčiau aptarti kainą.",
      recommendation,
      executableAction: null,
      requiresUserConfirmation: true,
      copilotVersion: NEGOTIATION_COPILOT_VERSION,
    };
  }

  recommendSyncFromContext = buildRecommendation;
}

export function createNegotiationCopilotService(
  db: TxQueryable,
  ports?: MarketScorePorts,
  llmExplainer?: LlmExplainer
): NegotiationCopilotService {
  return new NegotiationCopilotService(db, ports, llmExplainer);
}
