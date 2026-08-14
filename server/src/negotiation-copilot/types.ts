/**
 * Negotiation Copilot 1.0 — types.
 * AI has ZERO write authority. executableAction is always null.
 */

import type { NEGOTIATION_COPILOT_VERSION } from "./version.js";

export const RECOMMENDATION_TYPES = [
  "HOLD",
  "ACCEPT_MAY_BE_REASONABLE",
  "COUNTER_MAY_BE_REASONABLE",
  "REJECT_MAY_BE_REASONABLE",
  "ASK_FOR_MORE_INFO",
  "NO_RECOMMENDATION",
] as const;

export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];

export const SIGNAL_CODES = [
  "OFFER_BELOW_ASKING_BY_PERCENT",
  "OFFER_ABOVE_ASKING_BY_PERCENT",
  "OFFER_NEAR_ASKING",
  "OFFER_WITHIN_MARKET_RANGE",
  "OFFER_BELOW_MARKET_RANGE",
  "OFFER_ABOVE_MARKET_RANGE",
  "MARKET_DATA_LIMITED",
  "MARKET_DATA_MISSING",
  "NO_ACTIVE_OFFER",
  "INJECTION_DETECTED_IN_CHAT",
  "SCORE_AVAILABLE",
  "SCORE_UNAVAILABLE",
] as const;

export type SignalCode = (typeof SIGNAL_CODES)[number];

export type ActorRole = "BUYER" | "SELLER";

export type CopilotGoal =
  | "maximize_price"
  | "close_quickly"
  | "balanced"
  | "explore";

export type NegotiationSignal = {
  code: SignalCode;
  /** Deterministic numeric facts only (never from LLM). */
  value: number | null;
  detail: string;
};

export type DeterministicBounds = {
  suggestedCounterMinCents: number | null;
  suggestedCounterMaxCents: number | null;
  askingCents: number | null;
  activeOfferCents: number | null;
  marketLowCents: number | null;
  marketMedianCents: number | null;
  marketHighCents: number | null;
  deltaPercentVsAsking: number | null;
};

/** Privacy-filtered facts visible to one actor. */
export type CopilotContext = {
  transactionId: string;
  listingId: string;
  actorRole: ActorRole;
  actorUserId: string;
  transactionStatus: string;
  transactionVersion: number;
  activeOfferId: string | null;
  activeOfferVersion: number | null;
  activeOfferCents: number | null;
  askingCents: number | null;
  offerCount: number;
  /** Sanitized chat snippets — never treated as instructions. */
  recentChatSafe: string[];
  injectionDetectedInChat: boolean;
  marketLowCents: number | null;
  marketMedianCents: number | null;
  marketHighCents: number | null;
  vautoScore: number | null;
  /** Soft preference from client — NOT a secret floor/ceiling of the other party. */
  goal: CopilotGoal;
  copilotVersion: typeof NEGOTIATION_COPILOT_VERSION;
};

export type CopilotRecommendation = {
  recommendationType: RecommendationType;
  signals: NegotiationSignal[];
  bounds: DeterministicBounds;
  explanationLt: string;
  draftMessageLt: string | null;
  /** ALWAYS null — AI cannot execute. */
  executableAction: null;
  requiresUserConfirmation: true;
  transactionVersion: number;
  activeOfferVersion: number | null;
  injectionNeutralized: boolean;
  usedFallbackTemplate: boolean;
  copilotVersion: typeof NEGOTIATION_COPILOT_VERSION;
};

export class CopilotAuthError extends Error {
  readonly code = "COPILOT_FORBIDDEN" as const;
  readonly httpStatus = 403;
  constructor(message = "Not a transaction participant") {
    super(message);
    this.name = "CopilotAuthError";
  }
}

export class CopilotNotFoundError extends Error {
  readonly code = "COPILOT_NOT_FOUND" as const;
  readonly httpStatus = 404;
  constructor(public readonly transactionId: string) {
    super(`Transaction not found: ${transactionId}`);
    this.name = "CopilotNotFoundError";
  }
}

export class CopilotVersionConflictError extends Error {
  readonly code = "COPILOT_VERSION_CONFLICT" as const;
  readonly httpStatus = 409;
  constructor(message: string) {
    super(message);
    this.name = "CopilotVersionConflictError";
  }
}

export class CopilotValidationError extends Error {
  readonly code = "COPILOT_VALIDATION" as const;
  readonly httpStatus = 400;
  constructor(message: string) {
    super(message);
    this.name = "CopilotValidationError";
  }
}
