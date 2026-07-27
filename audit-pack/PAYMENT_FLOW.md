# PAYMENT_FLOW.md
Source: `server/src/routes/billing.ts`, `escrow-billing.ts`, `billing/stripe-*.ts`, `src/lib/payments/*`.

## Stripe flow — B2B subscription
1. Client `openCheckout(b2b)` / `subscribeB2BPlan` → `POST /api/billing/subscribe` (`requireAuth`).
2. Server creates Stripe Checkout Session (`billing/stripe-plans.ts`: starter €29/mo, pro €99/mo, enterprise €249/mo) with tax ID + billing address collection.
3. User completes checkout on Stripe hosted page (card / Link / Apple Pay / Google Pay when Dashboard+domain ready).
4. `POST /api/billing/confirm` — client confirms session after redirect; also persists PVM invoice.
5. Webhook `checkout.session.completed` → updates `billing_subscriptions` + user `billing_plan` + `billing_invoices`.

## Stripe flow — Escrow (buyer protection)
1. `POST /api/escrow-billing/checkout` — Checkout Session with **`capture_method: manual`** (`stripe-b2b.ts`).
2. Buyer protection fee = **5%** of item price (`BUYER_PROTECTION_FEE_PERCENT` in escrow route + `src/lib/payments/buyer-protection.ts`).
3. `application_fee_amount` + `transfer_data.destination` → seller **Stripe Connect** account if present.
4. Return URL `/pokalbiai/?escrow=success` → `EscrowReturnToast` → `POST /api/escrow-billing/confirm-session`.
5. Seller ships → `POST /api/escrow-billing/shipping-label` (**MOCK** label).
6. Buyer `POST /api/escrow-billing/confirm-delivery` → **captures** PaymentIntent, releases funds, applies referral rewards.

## Invoices (PVM)
- Table `billing_invoices` (migration `028_billing_invoices.sql`).
- Created on webhook/confirm from Checkout session (gross → 21% VAT split).
- Escrow invoices bill **platform fee only** (buyer protection), not full item price.
- Client: `GET /api/billing/invoices` + print view with `NEXT_PUBLIC_VAUTO_*` legal issuer.

## Webhook validation
- Route: `POST /api/billing/webhook` mounted **before** `express.json` with `express.raw` (`index.ts`).
- Verifies `stripe-signature` header via `stripe.webhooks.constructEvent` + `STRIPE_WEBHOOK_SECRET`.
- Bad signature → **400**. Missing secret → **503**.
- Events handled: `checkout.session.completed`, `customer.subscription.deleted`.
- Auto-registration: `billing/ensure-stripe.ts` if `STRIPE_AUTO_WEBHOOK=1`.

## Escrow states (DB)
`offered → paying → paid → label_sent → shipped → delivered → completed` (+ `disputed`, `cancelled` enum exists).

## Refunds
**NOT IMPLEMENTED**
- No `stripe.refunds.create` or `paymentIntents.cancel` in codebase.
- `disputed` status in schema only — no handler.
- `wallet_transactions.kind = refund` exists in migration — **no route uses it**.
- Checkout `cancel_url` is client redirect only — no server reversal.

## Failure states
| Failure | Behavior |
|---------|----------|
| Stripe key missing | `isStripeEscrowLive()` false; checkout endpoints error |
| Connect disabled | `STRIPE_CONNECT_ESCROW=false` disables escrow live |
| Webhook signature fail | 400, event ignored |
| DB unavailable during webhook | 500, Stripe retries per Stripe policy |
| Seller no Connect account | Escrow may proceed without transfer_data (code path in stripe-b2b.ts) |
| Demo wallet top-up | `POST /api/wallet/top-up` blocked in prod (`demo-guards.ts`) |

## Retry logic
- **Stripe webhooks:** Stripe platform retries; no custom idempotency table in app.
- **Client confirm:** User must retry `confirm-session` manually — **no idempotency key**.
- **NOT IMPLEMENTED:** Dead-letter queue for failed webhook processing.

## Frontend mock payments
`src/lib/payments/payment-provider.ts` — `createDemoPaymentIntent` returns `status: "paid"` — **MOCK ONLY**, no Stripe.

## Monetization fee references (client)
- PPC: listing click €0.08, call €0.35, service lead €1.20 (`b2b-plans.ts`)
- Smart boost C2C €2.99, B2B €29.99 (`monetization-engine.ts`)

## Critical dependencies
- `STRIPE_SECRET_KEY` **CRITICAL**
- `STRIPE_WEBHOOK_SECRET` **CRITICAL**
- Seller `stripe_connect_account_id` on users table for Connect payouts

## Risks **RISK**
- No refund/dispute automation
- No webhook event idempotency store (duplicate `checkout.session.completed` relies on DB upsert logic)
- Manual capture without automated expiry handling visible in code audit
