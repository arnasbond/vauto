/**
 * Stage 11F.3 — Signed webhook processor.
 * Signature first → durable inbox → atomic reconciliation + ledger + 11A SM.
 * No payout / release / refund execution.
 */

import type Stripe from "stripe";
import {
  TransactionRepository,
  runQueryableTransaction,
  type TxQueryable,
} from "../../../transaction/index.js";
import {
  PaymentRepository,
  appendLedgerEntry,
  listLedgerForIntent,
} from "../../../payment/index.js";
import { StripePaymentIntentObjectSchema } from "./schema.js";
import {
  WebhookInboxRepository,
  hashWebhookPayload,
} from "./inbox-repository.js";
import {
  verifyStripeWebhookSignature,
  type VerifiedStripeEvent,
} from "./signature-verifier.js";
import {
  STRIPE_WEBHOOK_ALLOWLIST,
  StripeWebhookConfigError,
  StripeWebhookSignatureError,
  type StripeWebhookAllowlistedType,
  type WebhookHandleResult,
} from "./types.js";
import { STRIPE_WEBHOOKS_VERSION } from "./version.js";
import {
  applyTrustedProviderProvenanceInTx,
  mintTrustedProviderProvenanceFromVerifiedStripeEvent,
} from "./trusted-provider-provenance.js";

const ALLOWED = new Set<string>(STRIPE_WEBHOOK_ALLOWLIST);

const TERMINAL_PAYMENT = new Set([
  "HELD_IN_ESCROW",
  "RELEASED_TO_SELLER",
  "REFUND_PENDING",
  "REFUNDED",
  "FAILED",
]);

function isAllowlisted(t: string): t is StripeWebhookAllowlistedType {
  return ALLOWED.has(t);
}

function currencyOk(stripeCurrency: string, snapshotCurrency: string): boolean {
  return (
    stripeCurrency.toLowerCase() === "eur" &&
    snapshotCurrency.toUpperCase() === "EUR"
  );
}

export type WebhookProcessorDeps = {
  db: TxQueryable;
  webhookSecret: string | undefined;
  /** When true (default in production), reject livemode=false. */
  requireLivemode?: boolean;
};

export class StripeWebhookProcessor {
  private readonly inbox: WebhookInboxRepository;

  constructor(private readonly deps: WebhookProcessorDeps) {
    this.inbox = new WebhookInboxRepository(deps.db);
  }

  /**
   * Full handle path: verify signature (no DB) → inbox → process atomically.
   */
  async handleRawWebhook(input: {
    rawBody: Buffer;
    signatureHeader: string | string[] | undefined;
  }): Promise<WebhookHandleResult> {
    const event = verifyStripeWebhookSignature({
      rawBody: input.rawBody,
      signatureHeader: input.signatureHeader,
      webhookSecret: this.deps.webhookSecret,
    });

    return this.handleVerifiedEvent(event, input.rawBody);
  }

  /** After constructEvent. Not part of the public HTTP/application API. */
  private async handleVerifiedEvent(
    event: VerifiedStripeEvent,
    rawBody: Buffer
  ): Promise<WebhookHandleResult> {
    const payloadHash = hashWebhookPayload(rawBody);
    const objectId =
      typeof event.data?.object === "object" &&
      event.data.object &&
      "id" in event.data.object
        ? String((event.data.object as { id: string }).id)
        : "unknown";

    // Livemode policy (environment tests)
    const requireLive =
      this.deps.requireLivemode ??
      process.env.NODE_ENV === "production";
    if (requireLive && event.livemode === false) {
      const inserted = await this.inbox.insertPending({
        stripeEventId: event.id,
        eventType: event.type,
        stripeObjectId: objectId,
        payloadHash,
        livemode: false,
      });
      await runQueryableTransaction(this.deps.db, async (tx) => {
        await new WebhookInboxRepository(tx).markFailed(
          tx,
          inserted.row.id,
          "livemode_mismatch"
        );
      });
      return {
        ok: true,
        outcome: "failed_reconciliation",
        stripeEventId: event.id,
        stripeWebhooksVersion: STRIPE_WEBHOOKS_VERSION,
      };
    }

    const { row, inserted } = await this.inbox.insertPending({
      stripeEventId: event.id,
      eventType: event.type,
      stripeObjectId: objectId,
      payloadHash,
      livemode: Boolean(event.livemode),
    });

    if (!inserted && row.status === "PROCESSED") {
      return {
        ok: true,
        outcome: "duplicate",
        stripeEventId: event.id,
        stripeWebhooksVersion: STRIPE_WEBHOOKS_VERSION,
      };
    }

    if (!isAllowlisted(event.type)) {
      await runQueryableTransaction(this.deps.db, async (tx) => {
        const claimed = await new WebhookInboxRepository(tx).claimForProcessing(
          tx,
          event.id
        );
        if (claimed) {
          await new WebhookInboxRepository(tx).markProcessed(tx, claimed.id);
        }
      });
      return {
        ok: true,
        outcome: "ignored_unknown_type",
        stripeEventId: event.id,
        stripeWebhooksVersion: STRIPE_WEBHOOKS_VERSION,
      };
    }

    return runQueryableTransaction(this.deps.db, async (tx) => {
      const inbox = new WebhookInboxRepository(tx);
      const claimed = await inbox.claimForProcessing(tx, event.id);
      if (!claimed) {
        const again = await inbox.getByStripeEventId(event.id);
        if (again?.status === "PROCESSED") {
          return {
            ok: true as const,
            outcome: "duplicate" as const,
            stripeEventId: event.id,
            stripeWebhooksVersion: STRIPE_WEBHOOKS_VERSION,
          };
        }
        // Locked by peer — treat as in-flight duplicate ack
        return {
          ok: true as const,
          outcome: "duplicate" as const,
          stripeEventId: event.id,
          stripeWebhooksVersion: STRIPE_WEBHOOKS_VERSION,
        };
      }

      try {
        const outcome = await this.applyAllowlistedEvent(tx, event);
        await inbox.markProcessed(tx, claimed.id);
        return {
          ok: true as const,
          outcome,
          stripeEventId: event.id,
          stripeWebhooksVersion: STRIPE_WEBHOOKS_VERSION,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.startsWith("RECONCILIATION_FAILED")) {
          await inbox.markFailed(tx, claimed.id, msg);
          return {
            ok: true as const,
            outcome: "failed_reconciliation" as const,
            stripeEventId: event.id,
            stripeWebhooksVersion: STRIPE_WEBHOOKS_VERSION,
          };
        }
        await inbox.markFailed(tx, claimed.id, msg);
        throw e;
      }
    });
  }

  private async applyAllowlistedEvent(
    tx: TxQueryable,
    event: Stripe.Event
  ): Promise<
    "processed" | "noop_monotonic" | "failed_reconciliation"
  > {
    const type = event.type as StripeWebhookAllowlistedType;

    // Stage 11F.6 H-01 — finalize REFUND_PENDING when Stripe confirms succeeded
    if (type === "charge.refunded" || type === "refund.updated") {
      return this.applyRefundFinalityEvent(tx, event);
    }

    const parsed = StripePaymentIntentObjectSchema.parse(event.data.object);
    const intents = new PaymentRepository(tx);
    const txRepo = new TransactionRepository(tx);

    const intent = await intents.getByStripePaymentIntentId(parsed.id);
    if (!intent) {
      // Unknown PI — durable processed no-op (not a VAUTO deal PI)
      return "noop_monotonic";
    }

    const snap = await tx.query<{
      amount_cents: number;
      currency: string;
    }>(
      `SELECT amount_cents, currency FROM vauto_deal_snapshots
       WHERE id = $1 LIMIT 1`,
      [intent.dealSnapshotId]
    );
    const snapshot = snap.rows[0];
    if (!snapshot) {
      throw new Error("RECONCILIATION_FAILED: missing deal snapshot");
    }

    const snapshotCents = Number(snapshot.amount_cents);
    const stripeAmount = parsed.amount;
    if (
      stripeAmount !== snapshotCents ||
      stripeAmount !== intent.amountCents ||
      !currencyOk(parsed.currency, snapshot.currency)
    ) {
      // Alarm ledger — no SM transition, fail-closed
      await appendLedgerEntry(tx, {
        paymentIntentId: intent.id,
        transactionId: intent.transactionId,
        entryType: "FEE",
        amountCents: snapshotCents,
        actorId: "SYSTEM",
        idempotencyKey: `ledger-alarm-recon-${event.id}`,
        payloadJson: {
          alarm: "RECONCILIATION_MISMATCH",
          stripeAmount,
          snapshotAmountCents: snapshotCents,
          intentAmountCents: intent.amountCents,
          stripeCurrency: parsed.currency,
          stripeEventId: event.id,
          stripeWebhooksVersion: STRIPE_WEBHOOKS_VERSION,
        },
      });
      throw new Error(
        `RECONCILIATION_FAILED: stripe=${stripeAmount} snapshot=${snapshotCents}`
      );
    }

    if (type === "payment_intent.processing") {
      if (TERMINAL_PAYMENT.has(intent.status) || intent.status === "AUTHORIZING") {
        return "noop_monotonic";
      }
      if (intent.status === "CREATED") {
        await intents.updateStatus(tx, {
          id: intent.id,
          expectedVersion: intent.version,
          toStatus: "AUTHORIZING",
        });
        return "processed";
      }
      return "noop_monotonic";
    }

    if (type === "payment_intent.payment_failed" || type === "payment_intent.canceled") {
      if (
        intent.status === "HELD_IN_ESCROW" ||
        intent.status === "RELEASED_TO_SELLER" ||
        intent.status === "REFUNDED"
      ) {
        return "noop_monotonic";
      }
      if (intent.status === "FAILED") {
        return "noop_monotonic";
      }
      await intents.updateStatus(tx, {
        id: intent.id,
        expectedVersion: intent.version,
        toStatus: "FAILED",
      });
      return "processed";
    }

    // payment_intent.succeeded → HELD_IN_ESCROW + 11A PAID (no release/payout)
    if (type === "payment_intent.succeeded") {
      if (
        intent.status === "HELD_IN_ESCROW" ||
        intent.status === "RELEASED_TO_SELLER" ||
        intent.status === "REFUNDED"
      ) {
        await this.attachObligationProvenance(tx, event, {
          transactionId: intent.transactionId,
          amountCents: intent.amountCents,
          currency: parsed.currency,
          stripePaymentIntentId: parsed.id,
        });
        return "noop_monotonic";
      }
      if (intent.status === "FAILED") {
        return "noop_monotonic";
      }

      let current = intent;
      if (current.status === "CREATED") {
        current = await intents.updateStatus(tx, {
          id: current.id,
          expectedVersion: current.version,
          toStatus: "AUTHORIZING",
        });
      }
      if (current.status === "AUTHORIZING") {
        current = await intents.updateStatus(tx, {
          id: current.id,
          expectedVersion: current.version,
          toStatus: "HELD_IN_ESCROW",
        });
        const existingHold = (await listLedgerForIntent(tx, current.id)).some(
          (e) => e.entryType === "ESCROW_HOLD"
        );
        if (!existingHold) {
          await appendLedgerEntry(tx, {
            paymentIntentId: current.id,
            transactionId: current.transactionId,
            entryType: "ESCROW_HOLD",
            amountCents: current.amountCents,
            actorId: "SYSTEM",
            idempotencyKey: `ledger-hold-wh-${event.id}`,
            payloadJson: {
              event: "payment_intent.succeeded",
              stripeEventId: event.id,
              stripeWebhooksVersion: STRIPE_WEBHOOKS_VERSION,
            },
          });
        }
      }

      const txn = await txRepo.getById(current.transactionId);
      if (txn?.status === "PAYMENT_PENDING") {
        await txRepo.executeTransitionInTx(tx, {
          transactionId: txn.id,
          toStatus: "PAID",
          actorType: "SYSTEM",
          actorId: "SYSTEM",
          reasonCode: "PAYMENT_CONFIRMED",
          expectedVersion: txn.version,
          idempotencyKey: `sm-pay-confirm-wh-${event.id}`,
          metadata: {
            paymentIntentId: current.id,
            amountCents: current.amountCents,
            stripeEventId: event.id,
            stripeWebhooksVersion: STRIPE_WEBHOOKS_VERSION,
          },
        });
      }

      await this.attachObligationProvenance(tx, event, {
        transactionId: current.transactionId,
        amountCents: current.amountCents,
        currency: parsed.currency,
        stripePaymentIntentId: parsed.id,
      });

      return "processed";
    }

    return "noop_monotonic";
  }

  /**
   * 11J.4 — bind signature-verified payment_intent.succeeded to obligation provenance.
   * Event id / PI id come from the constructEvent payload, bound to the local PI row.
   * No-op when the obligations table is absent (11A–11I) or no matching row.
   */
  private async attachObligationProvenance(
    tx: TxQueryable,
    event: Stripe.Event,
    local: {
      transactionId: string;
      amountCents: number;
      currency: string;
      stripePaymentIntentId: string;
    }
  ): Promise<void> {
    const exists = await tx.query<{ exists: boolean | string | number }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_name = 'vauto_financial_obligations'
       ) AS exists`
    );
    const flag = exists.rows[0]?.exists;
    if (!(flag === true || flag === "t" || flag === 1 || flag === "true")) {
      return;
    }
    const trusted = mintTrustedProviderProvenanceFromVerifiedStripeEvent(
      event,
      local
    );
    await applyTrustedProviderProvenanceInTx(tx, trusted);
  }

  private async applyRefundFinalityEvent(
    tx: TxQueryable,
    event: Stripe.Event
  ): Promise<"processed" | "noop_monotonic" | "failed_reconciliation"> {
    const obj = event.data.object as {
      id?: string;
      object?: string;
      payment_intent?: string | { id?: string } | null;
      status?: string;
      amount_refunded?: number;
      refunds?: { data?: Array<{ id: string; status: string; payment_intent?: string }> };
    };

    let stripePiId: string | null = null;
    let stripeRefundId: string | null = null;
    let refundStatus = "succeeded";

    if (obj.object === "refund") {
      stripeRefundId = obj.id ?? null;
      refundStatus = obj.status ?? "pending";
      const pi = obj.payment_intent;
      stripePiId =
        typeof pi === "string" ? pi : pi && typeof pi === "object" ? pi.id ?? null : null;
    } else if (obj.object === "charge") {
      const latest = obj.refunds?.data?.[0];
      stripeRefundId = latest?.id ?? obj.id ?? null;
      refundStatus = latest?.status ?? "succeeded";
      const pi = obj.payment_intent;
      stripePiId =
        typeof pi === "string" ? pi : pi && typeof pi === "object" ? pi.id ?? null : null;
    }

    if (!stripePiId) return "noop_monotonic";

    const intents = new PaymentRepository(tx);
    const intent = await intents.getByStripePaymentIntentId(stripePiId);
    if (!intent) return "noop_monotonic";

    if (intent.transferStatus === "REFUNDED") return "noop_monotonic";
    if (
      intent.transferStatus !== "REFUND_PENDING" &&
      intent.status !== "REFUND_PENDING"
    ) {
      return "noop_monotonic";
    }

    const { finalizeBuyerRefundFromProvider } = await import(
      "../../transfer/funds-transfer-service.js"
    );
    await finalizeBuyerRefundFromProvider(tx, {
      paymentIntentId: intent.id,
      transactionId: intent.transactionId,
      actorUserId: "SYSTEM",
      stripeRefundId: stripeRefundId ?? intent.stripeRefundId ?? `re_wh_${event.id}`,
      stripeRefundStatus: refundStatus,
    });
    return "processed";
  }
}

export function createStripeWebhookProcessor(
  deps: WebhookProcessorDeps
): StripeWebhookProcessor {
  return new StripeWebhookProcessor(deps);
}

export {
  StripeWebhookSignatureError,
  StripeWebhookConfigError,
};
