# Stage 11F.2 — Stripe PaymentIntent Integration 1.0

## Status

**Implemented — awaiting audit PASS.**  
Stripe is an external PSP executor; **VAUTO DB remains the only domain authority.**  
**Stage 11F.3 (Signed Webhooks) NOT started.**

`stripeIntegrationVersion`: **`1.0`**

## Hard financial rule

- Stripe `amount` / `currency` are 100% server-derived from `vauto_deal_snapshots.amount_cents` + `'eur'`.
- Client body may contain **only** `idempotencyKey`.
- Tampering (`amount`, `currency`, `sellerId`, `status`, `snapshotId`, …) → **400**.

## 2-phase model (no open DB TX during network)

1. **TX1** — AGREED policy, snapshot + reconciliation, insert VAUTO intent `CREATED` (+ ledger DEBIT, SM → `PAYMENT_PENDING`). **COMMIT**
2. **External** — `PaymentProvider.createPaymentIntent` with Idempotency-Key  
   `vauto:payment-intent:{paymentIntentId}:create`
3. **TX2** — attach `stripe_payment_intent_id` / `stripe_client_secret` / `provider_status`, status → `AUTHORIZING`. **COMMIT**

Crash after Stripe create before TX2: retry reuses Stripe idempotency and completes TX2.

## Adapters

`server/src/payments/stripe/stripe-adapter.ts`

- `FakeStripeAdapter` — tests/CI (0 live network)
- `RealStripeAdapter` — only when `STRIPE_SECRET_KEY` is set

## HTTP

`POST /api/transactions/:id/payment-intent/stripe-intent` (`requireAuth`, buyer-only, IDOR → 404)

Safe response only:

`clientSecret`, `stripePaymentIntentId`, `status`, `amountCents`, `currency`, `idempotentReplay`, `stripeIntegrationVersion`

No raw Stripe object, no secret keys, no `/mark-paid` / `/payment-success`.

Creating a Stripe PI does **not** mean `PAID` or `HELD_IN_ESCROW`.

## Migration

`045_stripe_payment_intents_1.0.sql` — columns + partial unique index on `stripe_payment_intent_id`.

## Tests / CI

```bash
npm run test:stripe-payment-intent --prefix server
```

Wired in `.github/workflows/ci.yml` as **Stage 11F.2**.

## Explicit stop

**Do not start Stage 11F.3** until auditor PASS after ZIP audit.
