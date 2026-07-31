import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { getUser } from "../repository.js";
import { getStripe } from "../billing/stripe-client.js";
import {
  createPaymentMethodSetupSession,
  createPayoutOnboardingLink,
  detachPaymentMethod,
  ensureStripeCustomer,
  readPayoutAccount,
  resolveSetupSessionCard,
} from "../billing/payment-methods-stripe.js";
import {
  clearCardDetails,
  getPaymentMethodRecord,
  saveCardDetails,
  savePayoutAccount,
  savePayoutAccountId,
  saveStripeCustomerId,
} from "../billing/payment-methods-repo.js";

export const paymentMethodsRouter = Router();

const BRAND_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  unionpay: "UnionPay",
  jcb: "JCB",
  diners: "Diners Club",
};

const PAYOUT_LABELS: Record<string, string> = {
  pending: "Tikrinama",
  verified: "Patvirtinta",
  restricted: "Reikia veiksmų",
};

function brandLabel(brand: string): string {
  return BRAND_LABELS[brand.toLowerCase()] ?? "Kortelė";
}

function stripeUnavailable(res: Response): Response {
  return res.status(503).json({
    error: "Mokėjimų sistema šiuo metu neprieinama. Pabandykite vėliau.",
    code: "stripe_unavailable",
  });
}

paymentMethodsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const record = await getPaymentMethodRecord(req.authUserId!);
    const card = record?.card ?? null;
    const payout = record?.payout ?? null;

    res.json({
      ok: true,
      stripeConfigured: Boolean(getStripe()),
      card: card
        ? {
            label: brandLabel(card.brand),
            masked: `•••• ${card.last4}`,
            expiry:
              card.expMonth && card.expYear
                ? `${String(card.expMonth).padStart(2, "0")}/${String(card.expYear).slice(-2)}`
                : null,
            updatedAt: card.updatedAt,
          }
        : null,
      payout: payout
        ? {
            masked: payout.ibanLast4 ? `LT•• •••• •••• ${payout.ibanLast4}` : null,
            holderName: payout.holderName,
            status: payout.status,
            statusLabel: PAYOUT_LABELS[payout.status] ?? "Tikrinama",
            updatedAt: payout.updatedAt,
          }
        : null,
      canBuy: Boolean(record?.paymentMethodId),
      canSellWithShipping: payout?.status === "verified",
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

paymentMethodsRouter.post("/setup-session", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!getStripe()) return stripeUnavailable(res);

    const userId = req.authUserId!;
    const [user, record] = await Promise.all([
      getUser(userId),
      getPaymentMethodRecord(userId),
    ]);

    const customerId = await ensureStripeCustomer({
      userId,
      email: user?.email,
      name: user?.name,
      existingCustomerId: record?.stripeCustomerId ?? undefined,
    });
    if (customerId !== record?.stripeCustomerId) {
      await saveStripeCustomerId(userId, customerId);
    }

    const session = await createPaymentMethodSetupSession({ userId, customerId });
    if (!session.url) {
      return res.status(500).json({ error: "Stripe checkout URL missing" });
    }

    res.json({ ok: true, checkoutUrl: session.url, sessionId: session.id });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

paymentMethodsRouter.post("/confirm", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!getStripe()) return stripeUnavailable(res);

    const sessionId = String((req.body as { sessionId?: string })?.sessionId ?? "").trim();
    if (!sessionId) return res.status(400).json({ error: "sessionId is required" });

    const { userId, card } = await resolveSetupSessionCard(sessionId);
    if (userId && userId !== req.authUserId) {
      return res.status(403).json({ error: "Session does not belong to user" });
    }
    if (!card) {
      return res.status(422).json({ error: "Kortelė nebuvo išsaugota. Pabandykite dar kartą." });
    }

    await saveCardDetails(req.authUserId!, card);
    res.json({
      ok: true,
      card: {
        label: brandLabel(card.brand),
        masked: `•••• ${card.last4}`,
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

paymentMethodsRouter.delete("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const record = await getPaymentMethodRecord(req.authUserId!);
    if (record?.paymentMethodId && getStripe()) {
      await detachPaymentMethod(record.paymentMethodId);
    }
    await clearCardDetails(req.authUserId!);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

paymentMethodsRouter.post("/payout/onboarding", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!getStripe()) return stripeUnavailable(res);

    const userId = req.authUserId!;
    const [user, record] = await Promise.all([
      getUser(userId),
      getPaymentMethodRecord(userId),
    ]);

    const { accountId, url } = await createPayoutOnboardingLink({
      userId,
      email: user?.email,
      existingAccountId: record?.stripeConnectAccountId ?? undefined,
    });
    await savePayoutAccountId(userId, accountId);

    res.json({ ok: true, onboardingUrl: url });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Pull the latest Connect status after the user returns from onboarding. */
paymentMethodsRouter.post("/payout/sync", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!getStripe()) return stripeUnavailable(res);

    const record = await getPaymentMethodRecord(req.authUserId!);
    if (!record?.stripeConnectAccountId) {
      return res.status(404).json({ error: "Išmokėjimo paskyra dar nesukurta." });
    }

    const payout = await readPayoutAccount(record.stripeConnectAccountId);
    if (!payout) {
      return res.status(502).json({ error: "Nepavyko gauti Stripe būsenos." });
    }
    await savePayoutAccount(req.authUserId!, payout);

    res.json({
      ok: true,
      payout: {
        masked: payout.ibanLast4 ? `LT•• •••• •••• ${payout.ibanLast4}` : null,
        holderName: payout.holderName,
        status: payout.status,
        statusLabel: PAYOUT_LABELS[payout.status] ?? "Tikrinama",
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
