import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import {
  calculateBuyerProtectionFee,
  calculateBuyerTotal,
  confirmDelivery,
  createEscrowCheckoutSession,
  isStripeEscrowLive,
  resolveEscrowPaymentIntentId,
} from "../billing/stripe-b2b.js";
import {
  confirmEscrowDelivery,
  getChatThreadMeta,
  getEscrowById,
  getEscrowForThread,
  getListingForEmbedding,
  getUserStripeConnectAccountId,
  markEscrowPaidFromStripe,
  upsertEscrow,
} from "../repository.js";
import {
  applyReferralEscrowRewards,
  consumeProtectionCredit,
  getFreeProtectionCredits,
} from "../referral/referral-service.js";
import type { ApiEscrowTransaction } from "../types.js";
import { resolveCarrierAdapter } from "../shipping/providers/carrier-adapters.js";
import type { ShippingProviderId } from "../shipping/shipping-routing.js";
import { rejectIfCheckoutDisabled } from "../platform/platform-guards.js";
import { rejectIfBuyerHasNoCard } from "../billing/payment-gates.js";
import {
  notifyEscrowPaid,
  notifyShippingLabelReady,
} from "../services/sale-notifications.js";
import { sendInternalError } from "../lib/http-errors.js";

export const escrowBillingRouter = Router();

function canAccessEscrow(req: AuthedRequest, escrow: ApiEscrowTransaction): boolean {
  const uid = req.authUserId;
  if (!uid) return false;
  return escrow.buyerId === uid || escrow.sellerId === uid;
}

escrowBillingRouter.get("/status", (_req, res) => {
  res.json({ live: isStripeEscrowLive() });
});

/**
 * H-01: Checkout accepts only thread/listing + shipping prefs.
 * Amount, sellerId, listing title come from DB — never from client body.
 */
escrowBillingRouter.post("/checkout", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (await rejectIfCheckoutDisabled(res)) return;
    if (!isStripeEscrowLive()) {
      return res.status(503).json({ error: "Payments temporarily unavailable" });
    }

    const body = req.body as {
      listingId?: string;
      threadId?: string;
      shippingProvider?: string;
      shippingLockerId?: string;
      shippingLockerName?: string;
    };
    const listingId = String(body.listingId ?? "").trim();
    const threadId = String(body.threadId ?? "").trim();
    if (!listingId || !threadId) {
      return res.status(400).json({ error: "listingId and threadId are required" });
    }

    const thread = await getChatThreadMeta(threadId);
    if (!thread) return res.status(404).json({ error: "Chat thread not found" });
    if (thread.listingId !== listingId) {
      return res.status(400).json({ error: "listingId does not match thread" });
    }
    if (req.authUserId !== thread.buyerId) {
      return res.status(403).json({ error: "Only buyer can initiate payment" });
    }
    if (await rejectIfBuyerHasNoCard(res, thread.buyerId)) return;

    const listing = await getListingForEmbedding(listingId);
    if (!listing) return res.status(404).json({ error: "Listing not found" });
    if (listing.sellerId && listing.sellerId !== thread.sellerId) {
      return res.status(400).json({ error: "Listing seller mismatch" });
    }
    const amount = Number(listing.price);
    if (!Number.isFinite(amount) || amount < 0.01) {
      return res.status(400).json({ error: "Listing has no payable price" });
    }

    const existing =
      (await getEscrowForThread(threadId)) ??
      (await getEscrowById(`esc-${threadId}`));

    if (existing && !["offered", "paying", "cancelled"].includes(existing.status)) {
      return res.status(409).json({
        error: "Escrow already in progress — use billing transition routes",
        status: existing.status,
      });
    }

    const freeCredits = await getFreeProtectionCredits(thread.buyerId);
    const buyerProtectionFee = calculateBuyerProtectionFee(amount, freeCredits);
    const buyerTotal = calculateBuyerTotal(amount, freeCredits);
    const now = new Date().toISOString();
    const escrowId = existing?.id ?? `esc-${threadId}`;

    const draft: ApiEscrowTransaction = {
      id: escrowId,
      threadId: thread.id,
      listingId: thread.listingId,
      buyerId: thread.buyerId,
      sellerId: thread.sellerId,
      amount,
      status: "paying",
      buyerProtectionFee,
      buyerTotal,
      deliveryStatus: "pending",
      buyerConfirmed: false,
      shippingProvider: body.shippingProvider,
      shippingLockerId: body.shippingLockerId,
      shippingLockerName: body.shippingLockerName,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await upsertEscrow(draft);

    const sellerConnect = await getUserStripeConnectAccountId(thread.sellerId);
    const session = await createEscrowCheckoutSession({
      escrowId: draft.id,
      threadId: draft.threadId,
      listingTitle: listing.title || thread.listingTitle || "VAUTO pirkimas",
      buyerId: draft.buyerId,
      sellerConnectAccountId: sellerConnect,
      amountEur: amount,
      buyerProtectionFeeEur: buyerProtectionFee,
      buyerTotalEur: buyerTotal,
    });

    if (!session.url) {
      return res.status(500).json({ error: "Stripe checkout URL missing" });
    }

    res.json({
      ok: true,
      checkoutUrl: session.url,
      sessionId: session.id,
      buyerProtectionFee,
      buyerTotal,
      amount,
      escrowId: draft.id,
    });
  } catch (e) {
    sendInternalError(res, e, "escrow-billing/checkout");
  }
});

escrowBillingRouter.post("/confirm-session", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const sessionId = String((req.body as { sessionId?: string })?.sessionId ?? "");
    if (!sessionId) return res.status(400).json({ error: "sessionId is required" });

    const { paymentIntentId, escrowId } = await resolveEscrowPaymentIntentId(sessionId);
    if (!escrowId) return res.status(400).json({ error: "Invalid escrow session" });

    const existing = await getEscrowById(escrowId);
    if (!existing) return res.status(404).json({ error: "Escrow not found" });
    if (!canAccessEscrow(req, existing)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const freeCredits = await getFreeProtectionCredits(existing.buyerId);
    const fee =
      existing.buyerProtectionFee ??
      calculateBuyerProtectionFee(existing.amount, freeCredits);
    const total =
      existing.buyerTotal ?? calculateBuyerTotal(existing.amount, freeCredits);
    if (fee === 0 && freeCredits > 0) {
      await consumeProtectionCredit(existing.buyerId);
    }
    const updated = await markEscrowPaidFromStripe({
      escrowId,
      paymentIntentId,
      buyerProtectionFee: fee,
      buyerTotal: total,
    });
    void notifyEscrowPaid(updated ?? existing).catch((e) =>
      console.error("Sale email (escrow paid) failed:", e)
    );
    res.json({ ok: true, escrow: updated });
  } catch (e) {
    sendInternalError(res, e, "escrow-billing/confirm-session");
  }
});

/**
 * H-02: Only the seller may create a shipping label, and only after escrow is paid.
 */
escrowBillingRouter.post("/shipping-label", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const body = req.body as {
      escrowId?: string;
      providerId?: string;
      parcelSize?: string;
      lockerId?: string;
      lockerName?: string;
    };
    const escrowId = String(body.escrowId ?? "");
    if (!escrowId) return res.status(400).json({ error: "escrowId is required" });

    const escrow = await getEscrowById(escrowId);
    if (!escrow) return res.status(404).json({ error: "Escrow not found" });
    if (escrow.sellerId !== req.authUserId) {
      return res.status(403).json({ error: "Only seller can create shipping label" });
    }
    if (escrow.status !== "paid") {
      return res.status(409).json({
        error: "Shipping label requires escrow status paid",
        status: escrow.status,
      });
    }

    const allowedCarriers = ["omniva", "dpd", "lpexpress", "venipak"] as const;
    const rawProvider = String(body.providerId ?? "omniva").trim().toLowerCase();
    if (!(allowedCarriers as readonly string[]).includes(rawProvider)) {
      return res.status(400).json({
        error: "Unsupported shipping provider",
        allowed: allowedCarriers,
      });
    }
    const providerMap: Record<(typeof allowedCarriers)[number], ShippingProviderId | null> = {
      omniva: "omniva",
      dpd: "dpd",
      lpexpress: "lp_express",
      venipak: null,
    };
    const provider = providerMap[rawProvider as (typeof allowedCarriers)[number]];
    if (!provider) {
      return res.status(400).json({
        error: "Shipping provider is not enabled",
        allowed: ["omniva", "dpd", "lpexpress"],
      });
    }
    const adapter = resolveCarrierAdapter(provider);
    const label = await adapter.createLabel({
      escrowId,
      listingId: escrow.listingId,
      providerId: provider,
      lockerId: body.lockerId ?? escrow.shippingLockerId,
      lockerName: body.lockerName ?? escrow.shippingLockerName,
      parcelSize: body.parcelSize ?? "M",
    });
    const now = new Date().toISOString();

    const next: ApiEscrowTransaction = {
      ...escrow,
      status: "label_sent",
      shippingLabelId: label.id,
      trackingCode: label.trackingCode,
      shippingProvider: provider,
      shippingLockerId: body.lockerId ?? escrow.shippingLockerId,
      shippingLockerName: body.lockerName ?? escrow.shippingLockerName,
      deliveryStatus: "label_created",
      updatedAt: now,
    };
    await upsertEscrow(next);
    void notifyShippingLabelReady(next, label.trackingUrl).catch((e) =>
      console.error("Sale email (label) failed:", e)
    );
    res.json({
      ok: true,
      escrow: next,
      label: {
        id: label.id,
        trackingCode: label.trackingCode,
        qrPayload: label.qrPayload,
        instructions: label.instructions,
        mode: label.mode,
        trackingUrl: label.trackingUrl,
      },
    });
  } catch (e) {
    sendInternalError(res, e, "escrow-billing/shipping-label");
  }
});

escrowBillingRouter.post("/confirm-delivery", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const escrowId = String((req.body as { escrowId?: string })?.escrowId ?? "");
    if (!escrowId) return res.status(400).json({ error: "escrowId is required" });

    const escrow = await getEscrowById(escrowId);
    if (!escrow) return res.status(404).json({ error: "Escrow not found" });
    if (escrow.buyerId !== req.authUserId) {
      return res.status(403).json({ error: "Only buyer can confirm delivery" });
    }

    const stripeResult = await confirmDelivery(escrowId);
    const updated = await confirmEscrowDelivery(escrowId);
    if (updated) {
      await applyReferralEscrowRewards(updated);
    }
    res.json({ ok: true, escrow: updated, stripe: stripeResult });
  } catch (e) {
    sendInternalError(res, e, "escrow-billing/confirm-delivery");
  }
});
