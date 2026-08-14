/**
 * Payment Domain & Ledger 1.0 version pin (Stage 11F.1).
 * No external Stripe / PSP execution in this stage.
 */

export const PAYMENT_LEDGER_VERSION = "1.0" as const;
export type PaymentLedgerVersion = typeof PAYMENT_LEDGER_VERSION;
