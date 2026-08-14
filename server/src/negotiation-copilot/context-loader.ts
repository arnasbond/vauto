/**
 * Server-authoritative context loader — privacy filtered per actor role.
 */

import type { TxQueryable } from "../transaction/repository.js";
import { TransactionRepository } from "../transaction/repository.js";
import { OfferRepository } from "../transaction/offers/repository.js";
import {
  sanitizePromptUserInput,
  detectPromptInjection,
} from "../shared/prompt-injection.js";
import {
  CopilotAuthError,
  CopilotNotFoundError,
  CopilotVersionConflictError,
  type ActorRole,
  type CopilotContext,
  type CopilotGoal,
} from "./types.js";
import { NEGOTIATION_COPILOT_VERSION } from "./version.js";

export type MarketScorePorts = {
  /** Asking price already on transaction; market range in euro → converted to cents. */
  loadMarketRangeCents?: (listingId: string) => Promise<{
    lowCents: number | null;
    medianCents: number | null;
    highCents: number | null;
  } | null>;
  loadVautoScore?: (listingId: string) => Promise<number | null>;
};

function eurosToCents(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.max(1, Math.round(n * 100));
}

export class CopilotContextLoader {
  private readonly txRepo: TransactionRepository;
  private readonly offerRepo: OfferRepository;

  constructor(
    private readonly db: TxQueryable,
    private readonly ports: MarketScorePorts = {}
  ) {
    this.txRepo = new TransactionRepository(db);
    this.offerRepo = new OfferRepository(db);
  }

  async load(input: {
    transactionId: string;
    actorUserId: string;
    goal?: CopilotGoal;
    expectedTransactionVersion?: number;
    expectedActiveOfferVersion?: number | null;
  }): Promise<CopilotContext> {
    const tx = await this.txRepo.getById(input.transactionId);
    if (!tx) throw new CopilotNotFoundError(input.transactionId);

    let actorRole: ActorRole;
    if (input.actorUserId === tx.buyerId) actorRole = "BUYER";
    else if (input.actorUserId === tx.sellerId) actorRole = "SELLER";
    else throw new CopilotAuthError();

    if (
      input.expectedTransactionVersion != null &&
      input.expectedTransactionVersion !== tx.version
    ) {
      throw new CopilotVersionConflictError(
        `Stale transactionVersion: expected ${input.expectedTransactionVersion}, got ${tx.version}`
      );
    }

    const offers = await this.offerRepo.listOffersForTransaction(
      tx.id,
      input.actorUserId
    );
    const pending = [...offers].reverse().find((o) => o.status === "PENDING");
    if (
      input.expectedActiveOfferVersion !== undefined &&
      input.expectedActiveOfferVersion !== null &&
      (!pending || pending.version !== input.expectedActiveOfferVersion)
    ) {
      throw new CopilotVersionConflictError(
        `Stale activeOfferVersion: expected ${input.expectedActiveOfferVersion}, got ${pending?.version ?? "none"}`
      );
    }
    if (input.expectedActiveOfferVersion === null && pending != null) {
      throw new CopilotVersionConflictError(
        "Stale activeOfferVersion: expected null (no pending offer)"
      );
    }

    // Chat — untrusted
    const chatRows = await this.db.query<{ text: string; message_type: string }>(
      `SELECT text, message_type FROM vauto_transaction_messages
       WHERE transaction_id = $1 AND deleted_at IS NULL
         AND message_type = 'USER_MESSAGE'
       ORDER BY created_at DESC, id DESC
       LIMIT 20`,
      [tx.id]
    ).catch(() => ({ rows: [] as { text: string; message_type: string }[] }));

    let injectionDetectedInChat = false;
    const recentChatSafe: string[] = [];
    for (const row of chatRows.rows) {
      if (detectPromptInjection(row.text)) injectionDetectedInChat = true;
      const scrubbed = sanitizePromptUserInput(row.text);
      if (scrubbed.hadInjection) injectionDetectedInChat = true;
      if (scrubbed.text) {
        recentChatSafe.push(scrubbed.text.slice(0, 280));
      }
    }

    const market = this.ports.loadMarketRangeCents
      ? await this.ports.loadMarketRangeCents(tx.listingId)
      : null;
    const score = this.ports.loadVautoScore
      ? await this.ports.loadVautoScore(tx.listingId)
      : null;

    const askingCents =
      eurosToCents(tx.currentPrice) ??
      (pending ? pending.amountCents : null);

    // Privacy: never load or expose opposite party's secret floors
    return {
      transactionId: tx.id,
      listingId: tx.listingId,
      actorRole,
      actorUserId: input.actorUserId,
      transactionStatus: tx.status,
      transactionVersion: tx.version,
      activeOfferId: pending?.id ?? null,
      activeOfferVersion: pending?.version ?? null,
      activeOfferCents: pending?.amountCents ?? null,
      askingCents,
      offerCount: offers.length,
      recentChatSafe,
      injectionDetectedInChat,
      marketLowCents: market?.lowCents ?? null,
      marketMedianCents: market?.medianCents ?? null,
      marketHighCents: market?.highCents ?? null,
      vautoScore: score,
      goal: input.goal ?? "balanced",
      copilotVersion: NEGOTIATION_COPILOT_VERSION,
    };
  }
}
