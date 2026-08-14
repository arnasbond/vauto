/**
 * Structured Offers 1.0 — engine façade (no LLM write authority).
 */

import { OfferRepository, type OfferMutationResult } from "./repository.js";
import type { TxQueryable } from "../repository.js";
import type { VautoOffer } from "./types.js";

export class OfferEngine {
  private readonly repo: OfferRepository;

  constructor(db: TxQueryable) {
    this.repo = new OfferRepository(db);
  }

  create(
    input: Parameters<OfferRepository["createOffer"]>[0]
  ): Promise<OfferMutationResult> {
    return this.repo.createOffer(input);
  }

  counter(
    input: Parameters<OfferRepository["counterOffer"]>[0]
  ): Promise<OfferMutationResult> {
    return this.repo.counterOffer(input);
  }

  accept(
    input: Parameters<OfferRepository["acceptOffer"]>[0]
  ): Promise<OfferMutationResult> {
    return this.repo.acceptOffer(input);
  }

  reject(
    input: Parameters<OfferRepository["rejectOffer"]>[0]
  ): Promise<OfferMutationResult> {
    return this.repo.rejectOffer(input);
  }

  withdraw(
    input: Parameters<OfferRepository["withdrawOffer"]>[0]
  ): Promise<OfferMutationResult> {
    return this.repo.withdrawOffer(input);
  }

  expire(
    input: Parameters<OfferRepository["expireOffer"]>[0]
  ): Promise<OfferMutationResult> {
    return this.repo.expireOffer(input);
  }

  list(transactionId: string, userId: string): Promise<VautoOffer[]> {
    return this.repo.listOffersForTransaction(transactionId, userId);
  }

  get(offerId: string): Promise<VautoOffer | null> {
    return this.repo.getOffer(offerId);
  }
}

export function createOfferEngine(db: TxQueryable): OfferEngine {
  return new OfferEngine(db);
}
