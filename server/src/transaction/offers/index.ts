/**
 * Structured Offers 1.0 — public API (Stage 11B).
 */

export {
  STRUCTURED_OFFERS_VERSION,
  type StructuredOffersVersion,
} from "./version.js";

export {
  OFFER_STATUSES,
  OfferAuthError,
  OfferNotFoundError,
  OfferStateError,
  OfferVersionConflictError,
  ListingSaleConflictError,
  OfferIdempotencyConflictError,
  type OfferStatus,
  type VautoOffer,
  type CreateOfferClientInput,
  type CounterOfferClientInput,
  type OfferActionClientInput,
} from "./types.js";

export {
  AmountCentsSchema,
  CurrencySchema,
  CreateOfferBodySchema,
  CounterOfferBodySchema,
  OfferActionBodySchema,
  VautoOfferSchema,
  OfferStatusSchema,
} from "./schema.js";

export {
  resolveActorRole,
  assertParticipant,
  assertCounterpartyAction,
  assertBuyerCanCreateInitialOffer,
  assertCanWithdraw,
  assertOfferPending,
  assertNotExpired,
  assertCanListOffers,
  isTerminalOfferStatus,
} from "./offer-validator.js";

export {
  OfferRepository,
  createOfferRepository,
  OFFERS_MIGRATION_SQL,
  OFFERS_MIGRATION_ID,
  type OfferMutationResult,
} from "./repository.js";

export { OfferEngine, createOfferEngine } from "./offer-engine.js";
