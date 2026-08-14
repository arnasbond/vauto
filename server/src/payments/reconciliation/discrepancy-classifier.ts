/**
 * Deterministic discrepancy classification.
 * Amount/currency/seller mismatches → MANUAL_REVIEW / SECURITY_MISMATCH (never auto-heal money).
 */

import type {
  DiscrepancyClass,
  DiscrepancyFinding,
  InvariantCheckResult,
  ReconcileSubject,
} from "./types.js";

export function classifyInvariantFailure(
  subject: ReconcileSubject,
  check: InvariantCheckResult
): DiscrepancyFinding {
  let classification: DiscrepancyClass = "MANUAL_REVIEW";
  let safeAutoHeal = false;
  let code = `INV_${check.id}`;

  if (
    check.id === "STRIPE_CHARGE_EQ_GROSS" ||
    check.id === "TRANSFER_EQ_SELLER_NET" ||
    check.id === "SNAPSHOT_EQ_OFFER" ||
    check.id === "GROSS_EQ_SNAPSHOT" ||
    check.id === "GROSS_EQ_FEE_PLUS_NET"
  ) {
    classification = "SECURITY_MISMATCH";
    code = `SECURITY_${check.id}`;
    safeAutoHeal = false;
  } else if (
    check.id === "REFUND_LEQ_CAPTURED" ||
    check.id === "REVERSAL_LEQ_TRANSFERRED" ||
    check.id === "LEDGER_CONSERVATION"
  ) {
    classification = "MANUAL_REVIEW";
    safeAutoHeal = false;
  }

  // Missing provider link but known stripe id + matching amount → recoverable
  if (
    check.id === "STRIPE_CHARGE_EQ_GROSS" &&
    subject.stripePaymentIntentId &&
    subject.provider?.amountCents === subject.grossAmountCents &&
    subject.provider.currency?.toLowerCase() === "eur"
  ) {
    // Provider amount matches — not a mismatch; treat as in-sync noise
    classification = "IN_SYNC";
  }

  return {
    paymentIntentId: subject.paymentIntentId,
    transactionId: subject.transactionId,
    classification,
    invariantId: check.id,
    code,
    message: check.detail,
    safeAutoHeal,
  };
}

/**
 * Recoverable drift: DB missing stripe_payment_intent_id but provider mirror
 * has known PI id with same amount/currency/transaction metadata link.
 */
export function detectRecoverableProviderLinkDrift(
  subject: ReconcileSubject
): DiscrepancyFinding | null {
  if (subject.stripePaymentIntentId) return null;
  if (
    !subject.provider?.paymentIntentId ||
    subject.provider.amountCents !== subject.grossAmountCents ||
    (subject.provider.currency &&
      subject.provider.currency.toLowerCase() !== "eur")
  ) {
    return null;
  }
  return {
    paymentIntentId: subject.paymentIntentId,
    transactionId: subject.transactionId,
    classification: "RECOVERABLE_DRIFT",
    invariantId: null,
    code: "MISSING_STRIPE_PI_LINK",
    message:
      "Provider PI known with matching amount/currency — safe to attach id",
    safeAutoHeal: true,
  };
}

export function classifySubject(
  subject: ReconcileSubject,
  checks: InvariantCheckResult[]
): DiscrepancyFinding[] {
  const findings: DiscrepancyFinding[] = [];
  const recoverable = detectRecoverableProviderLinkDrift(subject);
  if (recoverable) findings.push(recoverable);

  for (const c of checks) {
    if (c.ok) continue;
    findings.push(classifyInvariantFailure(subject, c));
  }

  // Currency mismatch on provider → security
  if (
    subject.provider?.currency &&
    subject.provider.currency.toLowerCase() !== "eur"
  ) {
    findings.push({
      paymentIntentId: subject.paymentIntentId,
      transactionId: subject.transactionId,
      classification: "SECURITY_MISMATCH",
      invariantId: "STRIPE_CHARGE_EQ_GROSS",
      code: "CURRENCY_MISMATCH",
      message: `provider_currency=${subject.provider.currency}`,
      safeAutoHeal: false,
    });
  }

  return findings;
}
