/**
 * Financial reconciler — loads VAUTO + optional provider mirror, runs invariants.
 */

import type { TxQueryable } from "../../transaction/repository.js";
import { listLedgerForIntent } from "../../payment/ledger-service.js";
import type { LedgerEntryType } from "../../payment/types.js";
import { checkAllInvariants, allInvariantsOk } from "./invariants.js";
import { classifySubject } from "./discrepancy-classifier.js";
import { applySafeRepairs, type RepairPort } from "./repair-policy.js";
import { PAYMENT_RECONCILIATION_VERSION } from "./version.js";
import type {
  ProviderMirror,
  ReconcileSubject,
  ReconciliationReport,
} from "./types.js";

export type ProviderLookupContext = {
  /** Known Stripe object IDs from VAUTO DB — prefer retrieve() over list(). */
  stripeTransferId?: string | null;
  stripeRefundId?: string | null;
  stripeReversalId?: string | null;
};

export type ProviderLookup = {
  lookupByStripePaymentIntentId(
    stripePaymentIntentId: string,
    knownIds?: ProviderLookupContext
  ): Promise<ProviderMirror | null>;
  /** Optional: map vauto payment intent id → known provider PI (crash recovery). */
  lookupRecoverableLink?(
    paymentIntentId: string
  ): Promise<{ stripePaymentIntentId: string; mirror: ProviderMirror } | null>;
};

type IntentScanRow = {
  id: string;
  transaction_id: string;
  deal_snapshot_id: string;
  amount_cents: number;
  platform_fee_cents: number;
  seller_net_cents: number;
  transfer_status: string;
  status: string;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
  stripe_refund_id: string | null;
};

function ledgerSums(entries: { entryType: LedgerEntryType; amountCents: number }[]) {
  let hold = 0;
  let reversed = 0;
  let outflows = 0;
  let fee = 0;
  for (const e of entries) {
    switch (e.entryType) {
      case "ESCROW_HOLD":
        hold += e.amountCents;
        break;
      case "TRANSFER_REVERSED":
        reversed += e.amountCents;
        break;
      case "SELLER_TRANSFERRED":
      case "BUYER_REFUNDED":
      case "ESCROW_RELEASE":
      case "REFUND":
      case "CREDIT":
        outflows += e.amountCents;
        break;
      case "PLATFORM_FEE_RESERVED":
      case "FEE":
        fee += e.amountCents;
        break;
      default:
        break;
    }
  }
  const ledgerDebitSum = hold + reversed;
  const ledgerCreditSum = outflows;
  const ledgerFeeSum = fee;
  // Fees are memorandum — conservation is hold/reversal vs outflows + residual.
  const unreleasedEscrowCents = Math.max(0, ledgerDebitSum - ledgerCreditSum);
  return {
    ledgerDebitSum,
    ledgerCreditSum,
    ledgerFeeSum,
    unreleasedEscrowCents,
  };
}

export async function loadReconcileSubject(
  db: TxQueryable,
  paymentIntentId: string,
  provider: ProviderLookup | null
): Promise<ReconcileSubject | null> {
  const intentRes = await db.query<IntentScanRow>(
    `SELECT id, transaction_id, deal_snapshot_id, amount_cents,
            COALESCE(platform_fee_cents,0) AS platform_fee_cents,
            COALESCE(seller_net_cents,0) AS seller_net_cents,
            COALESCE(transfer_status,'NOT_STARTED') AS transfer_status,
            status, stripe_payment_intent_id, stripe_transfer_id, stripe_refund_id
     FROM vauto_payment_intents WHERE id = $1 LIMIT 1`,
    [paymentIntentId]
  );
  const row = intentRes.rows[0];
  if (!row) return null;

  const snap = await db.query<{ amount_cents: number; accepted_offer_id: string }>(
    `SELECT amount_cents, accepted_offer_id FROM vauto_deal_snapshots WHERE id = $1 LIMIT 1`,
    [row.deal_snapshot_id]
  );
  const snapshotAmountCents = Number(snap.rows[0]?.amount_cents ?? 0);
  let offerAmountCents = 0;
  if (snap.rows[0]?.accepted_offer_id) {
    const off = await db.query<{ amount_cents: number }>(
      `SELECT amount_cents FROM vauto_offers WHERE id = $1 LIMIT 1`,
      [snap.rows[0].accepted_offer_id]
    );
    offerAmountCents = Number(off.rows[0]?.amount_cents ?? 0);
  }

  const ledger = await listLedgerForIntent(db, row.id);
  const sums = ledgerSums(ledger);

  let providerMirror: ProviderMirror | null = null;
  if (provider && row.stripe_payment_intent_id) {
    providerMirror = await provider.lookupByStripePaymentIntentId(
      row.stripe_payment_intent_id,
      {
        stripeTransferId: row.stripe_transfer_id,
        stripeRefundId: row.stripe_refund_id,
      }
    );
  } else if (provider?.lookupRecoverableLink) {
    const rec = await provider.lookupRecoverableLink(row.id);
    if (rec) providerMirror = rec.mirror;
  }

  return {
    paymentIntentId: row.id,
    transactionId: row.transaction_id,
    snapshotAmountCents,
    offerAmountCents,
    grossAmountCents: Number(row.amount_cents),
    platformFeeCents: Number(row.platform_fee_cents),
    sellerNetCents: Number(row.seller_net_cents),
    transferStatus: row.transfer_status,
    status: row.status,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    stripeTransferId: row.stripe_transfer_id,
    stripeRefundId: row.stripe_refund_id,
    ...sums,
    provider: providerMirror,
  };
}

export async function reconcilePaymentIntent(
  db: TxQueryable,
  paymentIntentId: string,
  provider: ProviderLookup | null,
  repairPort: RepairPort | null = null
): Promise<{
  subject: ReconcileSubject;
  inSync: boolean;
  findings: ReturnType<typeof classifySubject>;
  repairs: Awaited<ReturnType<typeof applySafeRepairs>>;
}> {
  const subject = await loadReconcileSubject(db, paymentIntentId, provider);
  if (!subject) {
    throw new Error(`payment_intent_not_found:${paymentIntentId}`);
  }
  const checks = checkAllInvariants(subject);
  const findings = classifySubject(subject, checks);
  const linkMap = new Map<string, string>();
  if (
    !subject.stripePaymentIntentId &&
    subject.provider?.paymentIntentId &&
    provider?.lookupRecoverableLink
  ) {
    const rec = await provider.lookupRecoverableLink(subject.paymentIntentId);
    if (rec) linkMap.set(subject.paymentIntentId, rec.stripePaymentIntentId);
  }
  const repairs = await applySafeRepairs(db, findings, repairPort, linkMap);
  const inSync =
    findings.length === 0 ||
    (findings.every((f) => f.classification === "IN_SYNC") &&
      allInvariantsOk(checks));
  return { subject, inSync: inSync && allInvariantsOk(checks), findings, repairs };
}

export async function reconcileBatch(
  db: TxQueryable,
  opts: {
    limit: number;
    offset?: number;
    statuses?: string[];
    provider?: ProviderLookup | null;
    repairPort?: RepairPort | null;
  }
): Promise<ReconciliationReport> {
  const limit = Math.min(Math.max(1, opts.limit), 200);
  const offset = opts.offset ?? 0;
  const statuses = opts.statuses?.length
    ? opts.statuses
    : [
        "CREATED",
        "AUTHORIZING",
        "HELD_IN_ESCROW",
        "RELEASED_TO_SELLER",
        "REFUNDED",
        "FAILED",
      ];

  const rows = await db.query<{ id: string }>(
    `SELECT id FROM vauto_payment_intents
     WHERE status = ANY($1::text[])
     ORDER BY created_at ASC, id ASC
     LIMIT $2 OFFSET $3`,
    [statuses, limit, offset]
  );

  const discrepancies: ReconciliationReport["discrepancies"] = [];
  const autoRepairsApplied: ReconciliationReport["autoRepairsApplied"] = [];
  let inSync = 0;

  for (const r of rows.rows) {
    const result = await reconcilePaymentIntent(
      db,
      r.id,
      opts.provider ?? null,
      opts.repairPort ?? null
    );
    if (result.inSync && result.findings.length === 0) {
      inSync += 1;
    } else {
      discrepancies.push(
        ...result.findings.filter((f) => f.classification !== "IN_SYNC")
      );
    }
    autoRepairsApplied.push(...result.repairs.filter((a) => a.applied));
  }

  return {
    paymentReconciliationVersion: PAYMENT_RECONCILIATION_VERSION,
    reconciledAt: new Date().toISOString(),
    scanned: rows.rows.length,
    inSync,
    discrepancies,
    autoRepairsApplied,
    manualReviewRequired: discrepancies.filter(
      (d) => d.classification === "MANUAL_REVIEW"
    ).length,
    securityMismatches: discrepancies.filter(
      (d) => d.classification === "SECURITY_MISMATCH"
    ).length,
  };
}
