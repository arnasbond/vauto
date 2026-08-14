/**
 * Eight mathematical financial invariants (integer EUR cents).
 * 100% deterministic — no AI.
 */

import type {
  InvariantCheckResult,
  ReconcileSubject,
} from "./types.js";

export function checkAllInvariants(
  subject: ReconcileSubject
): InvariantCheckResult[] {
  const results: InvariantCheckResult[] = [];

  results.push({
    id: "SNAPSHOT_EQ_OFFER",
    ok: subject.snapshotAmountCents === subject.offerAmountCents,
    detail: `snapshot=${subject.snapshotAmountCents} offer=${subject.offerAmountCents}`,
  });

  results.push({
    id: "GROSS_EQ_SNAPSHOT",
    ok: subject.grossAmountCents === subject.snapshotAmountCents,
    detail: `gross=${subject.grossAmountCents} snapshot=${subject.snapshotAmountCents}`,
  });

  const feeSet =
    subject.platformFeeCents > 0 ||
    subject.sellerNetCents > 0 ||
    subject.transferStatus === "TRANSFERRED" ||
    subject.transferStatus === "TRANSFER_PENDING";
  const feeOk = !feeSet
    ? subject.platformFeeCents === 0 && subject.sellerNetCents === 0
    : subject.grossAmountCents ===
      subject.platformFeeCents + subject.sellerNetCents;
  results.push({
    id: "GROSS_EQ_FEE_PLUS_NET",
    ok: feeOk,
    detail: `gross=${subject.grossAmountCents} fee=${subject.platformFeeCents} net=${subject.sellerNetCents}`,
  });

  const stripeAmt = subject.provider?.amountCents ?? null;
  results.push({
    id: "STRIPE_CHARGE_EQ_GROSS",
    ok:
      stripeAmt == null ||
      !subject.stripePaymentIntentId ||
      stripeAmt === subject.grossAmountCents,
    detail: `stripe=${stripeAmt} gross=${subject.grossAmountCents}`,
  });

  const transferAmt = subject.provider?.transferAmountCents ?? null;
  const expectNet =
    subject.transferStatus === "TRANSFERRED" ||
    subject.transferStatus === "REFUNDED"
      ? subject.sellerNetCents
      : null;
  results.push({
    id: "TRANSFER_EQ_SELLER_NET",
    ok:
      expectNet == null ||
      transferAmt == null ||
      transferAmt === expectNet ||
      // After full reversal, transfer record may still show original amount
      (subject.transferStatus === "REFUNDED" &&
        transferAmt === subject.sellerNetCents),
    detail: `transferAmt=${transferAmt} sellerNet=${subject.sellerNetCents}`,
  });

  const refundAmt = subject.provider?.refundAmountCents ?? null;
  results.push({
    id: "REFUND_LEQ_CAPTURED",
    ok: refundAmt == null || refundAmt <= subject.grossAmountCents,
    detail: `refund=${refundAmt} gross=${subject.grossAmountCents}`,
  });

  const revAmt = subject.provider?.reversalAmountCents ?? null;
  const transferred = subject.provider?.transferAmountCents ?? subject.sellerNetCents;
  results.push({
    id: "REVERSAL_LEQ_TRANSFERRED",
    ok: revAmt == null || revAmt <= transferred,
    detail: `reversal=${revAmt} transferred=${transferred}`,
  });

  const lhs = subject.ledgerDebitSum;
  const rhs = subject.ledgerCreditSum + subject.unreleasedEscrowCents;
  results.push({
    id: "LEDGER_CONSERVATION",
    ok: lhs === rhs,
    detail: `debits=${lhs} credits+unreleased=${rhs} (fees_memo=${subject.ledgerFeeSum})`,
  });

  return results;
}

export function allInvariantsOk(results: InvariantCheckResult[]): boolean {
  return results.every((r) => r.ok);
}
