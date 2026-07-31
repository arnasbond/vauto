/**
 * Post-sale email notifications for seller and buyer.
 *
 * Every send is claimed against `sale_notifications.event_key` first, so Stripe
 * webhook retries, `confirm-session` and a duplicate label request can all fire
 * without the participants receiving the same email twice.
 */
import { randomUUID } from "node:crypto";
import { query } from "../db.js";
import { getListingForEmbedding, getUser } from "../repository.js";
import type { ApiEscrowTransaction } from "../types.js";
import { isMailerConfigured, sendEmail } from "../mail/mailer.js";
import {
  renderBuyerSaleEmail,
  renderSellerSaleEmail,
  type SaleEmailContext,
} from "../mail/sale-emails.js";

type NotificationKind = "escrow_paid" | "label_sent" | "listing_sold";

const CARRIER_LABELS: Record<string, string> = {
  omniva: "Omniva",
  lpexpress: "LP Express",
  dpd: "DPD",
  venipak: "Venipak",
};

/** Returns false when this event was already claimed by an earlier call. */
async function claimNotification(opts: {
  eventKey: string;
  kind: NotificationKind;
  listingId?: string;
  escrowId?: string;
  sellerId?: string;
  buyerId?: string;
}): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `INSERT INTO sale_notifications (id, event_key, kind, listing_id, escrow_id, seller_id, buyer_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (event_key) DO NOTHING
     RETURNING id`,
    [
      randomUUID(),
      opts.eventKey,
      opts.kind,
      opts.listingId ?? null,
      opts.escrowId ?? null,
      opts.sellerId ?? null,
      opts.buyerId ?? null,
    ]
  );
  return rows.length > 0;
}

async function finishNotification(
  eventKey: string,
  status: "sent" | "skipped" | "failed",
  recipients: string[],
  error?: string
): Promise<void> {
  await query(
    `UPDATE sale_notifications
        SET status = $2,
            recipients = $3::jsonb,
            error = $4,
            updated_at = now()
      WHERE event_key = $1`,
    [eventKey, status, JSON.stringify(recipients), error ?? null]
  );
}

/** Release the claim so a later attempt (e.g. after mailer outage) can retry. */
async function releaseNotification(eventKey: string): Promise<void> {
  await query(`DELETE FROM sale_notifications WHERE event_key = $1`, [eventKey]);
}

async function buildContext(escrow: ApiEscrowTransaction): Promise<{
  context: SaleEmailContext;
  sellerEmail?: string;
  buyerEmail?: string;
}> {
  const [listing, seller, buyer] = await Promise.all([
    escrow.listingId ? getListingForEmbedding(escrow.listingId) : Promise.resolve(null),
    getUser(escrow.sellerId),
    getUser(escrow.buyerId),
  ]);

  const provider = escrow.shippingProvider?.toLowerCase();

  return {
    context: {
      listingId: escrow.listingId,
      listingTitle: listing?.title ?? "VAUTO prekė",
      amount: escrow.amount,
      sellerName: seller?.name,
      buyerName: buyer?.name,
      threadId: escrow.threadId,
      trackingCode: escrow.trackingCode,
      lockerName: escrow.shippingLockerName,
      carrierLabel: provider ? (CARRIER_LABELS[provider] ?? escrow.shippingProvider) : undefined,
    },
    sellerEmail: seller?.email,
    buyerEmail: buyer?.email,
  };
}

async function dispatch(opts: {
  eventKey: string;
  kind: NotificationKind;
  escrow: ApiEscrowTransaction;
  labelUrl?: string;
}): Promise<void> {
  if (!isMailerConfigured()) return;

  const claimed = await claimNotification({
    eventKey: opts.eventKey,
    kind: opts.kind,
    listingId: opts.escrow.listingId,
    escrowId: opts.escrow.id,
    sellerId: opts.escrow.sellerId,
    buyerId: opts.escrow.buyerId,
  });
  if (!claimed) return;

  try {
    const { context, sellerEmail, buyerEmail } = await buildContext(opts.escrow);
    const withLabel: SaleEmailContext = { ...context, labelUrl: opts.labelUrl };
    const recipients: string[] = [];

    if (sellerEmail) {
      const mail = renderSellerSaleEmail(withLabel);
      if (await sendEmail({ to: [sellerEmail], subject: mail.subject, html: mail.html })) {
        recipients.push(sellerEmail);
      }
    }
    if (buyerEmail) {
      const mail = renderBuyerSaleEmail(withLabel);
      if (await sendEmail({ to: [buyerEmail], subject: mail.subject, html: mail.html })) {
        recipients.push(buyerEmail);
      }
    }

    await finishNotification(
      opts.eventKey,
      recipients.length ? "sent" : "skipped",
      recipients
    );
  } catch (e) {
    await releaseNotification(opts.eventKey).catch(() => {});
    throw e;
  }
}

/** Buyer paid — both sides get the confirmation with the order summary. */
export async function notifyEscrowPaid(escrow: ApiEscrowTransaction): Promise<void> {
  await dispatch({
    eventKey: `escrow_paid:${escrow.id}`,
    kind: "escrow_paid",
    escrow,
  });
}

/** Shipping label created — reuses the same template, now carrying the tracking code. */
export async function notifyShippingLabelReady(
  escrow: ApiEscrowTransaction,
  labelUrl?: string
): Promise<void> {
  await dispatch({
    eventKey: `label_sent:${escrow.id}:${escrow.shippingLabelId ?? escrow.trackingCode ?? "na"}`,
    kind: "label_sent",
    escrow,
    labelUrl,
  });
}

/**
 * Listing marked sold outside escrow (local deal). Only the seller has a
 * counterparty we can address, so this confirms the sale to the seller alone.
 */
export async function notifyListingSoldManually(listing: {
  id: string;
  sellerId: string;
  title: string;
  price: number;
}): Promise<void> {
  if (!isMailerConfigured()) return;

  const eventKey = `listing_sold:${listing.id}`;
  const claimed = await claimNotification({
    eventKey,
    kind: "listing_sold",
    listingId: listing.id,
    sellerId: listing.sellerId,
  });
  if (!claimed) return;

  try {
    const seller = await getUser(listing.sellerId);
    if (!seller?.email) {
      await finishNotification(eventKey, "skipped", []);
      return;
    }

    const mail = renderSellerSaleEmail({
      listingId: listing.id,
      listingTitle: listing.title,
      amount: listing.price,
      sellerName: seller.name,
    });
    const sent = await sendEmail({
      to: [seller.email],
      subject: mail.subject,
      html: mail.html,
    });
    await finishNotification(
      eventKey,
      sent ? "sent" : "skipped",
      sent ? [seller.email] : []
    );
  } catch (e) {
    await releaseNotification(eventKey).catch(() => {});
    throw e;
  }
}
