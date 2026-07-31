/**
 * Persistence for masked payment / payout details (migration 032).
 * Only Stripe ids and display tails are stored — see the migration comments.
 */
import { query } from "../db.js";
import type { PayoutAccountDetails, SavedCardDetails } from "./payment-methods-stripe.js";

export interface PaymentMethodRecord {
  stripeCustomerId: string | null;
  stripeConnectAccountId: string | null;
  card: {
    brand: string;
    last4: string;
    expMonth: number | null;
    expYear: number | null;
    updatedAt: string | null;
  } | null;
  paymentMethodId: string | null;
  payout: {
    ibanLast4: string | null;
    holderName: string | null;
    status: string;
    updatedAt: string | null;
  } | null;
}

interface PaymentMethodRow {
  stripe_customer_id: string | null;
  stripe_connect_account_id: string | null;
  payment_method_id: string | null;
  payment_method_brand: string | null;
  payment_method_last4: string | null;
  payment_method_exp_month: number | null;
  payment_method_exp_year: number | null;
  payment_method_updated_at: Date | null;
  payout_iban_last4: string | null;
  payout_holder_name: string | null;
  payout_status: string | null;
  payout_updated_at: Date | null;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export async function getPaymentMethodRecord(
  userId: string
): Promise<PaymentMethodRecord | null> {
  const rows = await query<PaymentMethodRow>(
    `SELECT stripe_customer_id,
            stripe_connect_account_id,
            payment_method_id,
            payment_method_brand,
            payment_method_last4,
            payment_method_exp_month,
            payment_method_exp_year,
            payment_method_updated_at,
            payout_iban_last4,
            payout_holder_name,
            payout_status,
            payout_updated_at
       FROM users
      WHERE id = $1`,
    [userId]
  );

  const row = rows[0];
  if (!row) return null;

  return {
    stripeCustomerId: row.stripe_customer_id,
    stripeConnectAccountId: row.stripe_connect_account_id,
    paymentMethodId: row.payment_method_id,
    card: row.payment_method_id
      ? {
          brand: row.payment_method_brand ?? "card",
          last4: row.payment_method_last4 ?? "",
          expMonth: row.payment_method_exp_month,
          expYear: row.payment_method_exp_year,
          updatedAt: iso(row.payment_method_updated_at),
        }
      : null,
    payout: row.stripe_connect_account_id
      ? {
          ibanLast4: row.payout_iban_last4,
          holderName: row.payout_holder_name,
          status: row.payout_status ?? "pending",
          updatedAt: iso(row.payout_updated_at),
        }
      : null,
  };
}

export async function saveStripeCustomerId(
  userId: string,
  customerId: string
): Promise<void> {
  await query(
    `UPDATE users SET stripe_customer_id = $2 WHERE id = $1`,
    [userId, customerId]
  );
}

export async function saveCardDetails(
  userId: string,
  card: SavedCardDetails
): Promise<void> {
  await query(
    `UPDATE users
        SET payment_method_id = $2,
            payment_method_brand = $3,
            payment_method_last4 = $4,
            payment_method_exp_month = $5,
            payment_method_exp_year = $6,
            payment_method_updated_at = now()
      WHERE id = $1`,
    [
      userId,
      card.paymentMethodId,
      card.brand,
      card.last4,
      card.expMonth,
      card.expYear,
    ]
  );
}

export async function clearCardDetails(userId: string): Promise<void> {
  await query(
    `UPDATE users
        SET payment_method_id = NULL,
            payment_method_brand = NULL,
            payment_method_last4 = NULL,
            payment_method_exp_month = NULL,
            payment_method_exp_year = NULL,
            payment_method_updated_at = now()
      WHERE id = $1`,
    [userId]
  );
}

export async function savePayoutAccount(
  userId: string,
  payout: PayoutAccountDetails
): Promise<void> {
  await query(
    `UPDATE users
        SET stripe_connect_account_id = $2,
            payout_iban_last4 = $3,
            payout_holder_name = $4,
            payout_status = $5,
            payout_updated_at = now()
      WHERE id = $1`,
    [
      userId,
      payout.connectAccountId,
      payout.ibanLast4,
      payout.holderName,
      payout.status,
    ]
  );
}

export async function savePayoutAccountId(
  userId: string,
  accountId: string
): Promise<void> {
  await query(
    `UPDATE users
        SET stripe_connect_account_id = $2,
            payout_status = COALESCE(payout_status, 'pending'),
            payout_updated_at = now()
      WHERE id = $1`,
    [userId, accountId]
  );
}
