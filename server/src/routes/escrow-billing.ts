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
  getEscrowById,
  getUserStripeConnectAccountId,
  markEscrowPaidFromStripe,
  upsertEscrow,
} from "../repository.js";
import { validateEscrow, type ValidationResult } from "../validation.js";
import {
  applyReferralEscrowRewards,
  consumeProtectionCredit,
  getFreeProtectionCredits,
} from "../referral/referral-service.js";
import type { ApiEscrowTransaction } from "../types.js";
import type { Response } from "express";

export const escrowBillingRouter = Router();

function badRequest<T>(
  res: Response,
  result: ValidationResult<T>
): result is { ok: false; error: string } {
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return true;
  }
  return false;
}

function canAccessEscrow(req: AuthedRequest, escrow: ApiEscrowTransaction): boolean {
  const uid = req.authUserId;
  if (!uid) return false;
  return escrow.buyerId === uid || escrow.sellerId === uid;
}

escrowBillingRouter.get("/status", (_req, res) => {
  res.json({ live: isStripeEscrowLive() });
});

escrowBillingRouter.post("/checkout", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!isStripeEscrowLive()) {
      return res.status(503).json({ error: "Stripe escrow not configured" });
    }

    const parsed = validateEscrow((req.body as { escrow?: unknown })?.escrow);
    if (badRequest(res, parsed)) return;
    const escrow = parsed.value;
    if (escrow.buyerId !== req.authUserId) {
      return res.status(403).json({ error: "Only buyer can initiate payment" });
    }

    const locker = req.body as {
      shippingProvider?: string;
      shippingLockerId?: string;
      shippingLockerName?: string;
    };

    const freeCredits = await getFreeProtectionCredits(escrow.buyerId);
    const buyerProtectionFee = calculateBuyerProtectionFee(escrow.amount, freeCredits);
    const buyerTotal = calculateBuyerTotal(escrow.amount, freeCredits);
    const now = new Date().toISOString();
    const draft: ApiEscrowTransaction = {
      ...escrow,
      status: "paying",
      buyerProtectionFee,
      buyerTotal,
      deliveryStatus: "pending",
      buyerConfirmed: false,
      shippingProvider: locker.shippingProvider,
      shippingLockerId: locker.shippingLockerId,
      shippingLockerName: locker.shippingLockerName,
      updatedAt: now,
      createdAt: escrow.createdAt || now,
    };
    await upsertEscrow(draft);

    const sellerConnect = await getUserStripeConnectAccountId(escrow.sellerId);
    const session = await createEscrowCheckoutSession({
      escrowId: escrow.id,
      threadId: escrow.threadId,
      listingTitle: (req.body as { listingTitle?: string }).listingTitle ?? "VAUTO pirkimas",
      buyerId: escrow.buyerId,
      sellerConnectAccountId: sellerConnect,
      amountEur: escrow.amount,
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
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
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
    res.json({ ok: true, escrow: updated });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

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
    if (!canAccessEscrow(req, escrow)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const provider = body.providerId ?? "omniva";
    const suffix = Math.floor(100000 + Math.random() * 900000);
    const labelId = `${provider.toUpperCase().replace("_", "")}-${suffix}`;
    const trackingCode = labelId;
    const now = new Date().toISOString();

    const next: ApiEscrowTransaction = {
      ...escrow,
      status: "label_sent",
      shippingLabelId: labelId,
      trackingCode,
      shippingProvider: provider,
      shippingLockerId: body.lockerId ?? escrow.shippingLockerId,
      shippingLockerName: body.lockerName ?? escrow.shippingLockerName,
      deliveryStatus: "label_created",
      updatedAt: now,
    };
    await upsertEscrow(next);
    res.json({
      ok: true,
      escrow: next,
      label: {
        id: labelId,
        trackingCode,
        qrPayload: `VAUTO-SHIP:${labelId}:${escrow.listingId}`,
        instructions: `Nueikite į ${body.lockerName ?? "pasirinktą paštomatą"}, nuskenuokite QR ir įdėkite ${body.parcelSize ?? "M"} dydžio siuntą.`,
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
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

    if (isStripeEscrowLive() && escrow.stripePaymentIntentId) {
      await confirmDelivery(escrow.stripePaymentIntentId);
    }

    const updated = await confirmEscrowDelivery(escrowId);
    await applyReferralEscrowRewards({
      buyerId: escrow.buyerId,
      sellerId: escrow.sellerId,
    });
    res.json({ ok: true, escrow: updated });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
