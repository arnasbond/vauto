# Stage 11F.3 — Stripe Signed Webhooks 1.0

## Status

**Implemented — awaiting audit PASS.**  
Sole asynchronous authority for payment success / failure after cryptographic verification.  
**Stage 11F.4 (Payout / Escrow Release) NOT started.**

`stripeWebhooksVersion`: **`1.0`**

## Hard rules

1. **No state change before successful signature verification.**
2. `PAID` / `HELD_IN_ESCROW` only via signed webhook — never via browser `/payment/success`.
3. Amount reconciliation: Stripe `amount` === `vauto_deal_snapshots.amount_cents` and currency `eur`/`EUR`.
4. No payout / transfer / release / refund execution in this stage.

## Express wiring

`POST /api/webhooks/stripe` is registered in `server/src/index.ts` **before** global `express.json()`, with:

```ts
express.raw({ type: "application/json" })
```

## Flow

1. Verify `Stripe-Signature` via `constructEvent(rawBody, …, STRIPE_WEBHOOK_SECRET)`
2. Durable inbox insert (`vauto_stripe_webhook_events`, UNIQUE `stripe_event_id`)
3. Dedup → `200` no-op if already `PROCESSED`
4. Atomic TX: `FOR UPDATE SKIP LOCKED` claim → reconcile → ledger → payment intent → 11A `executeTransitionInTx` → mark `PROCESSED` / `FAILED`

## Allowlist

- `payment_intent.succeeded` → `HELD_IN_ESCROW` + ledger `ESCROW_HOLD` + 11A `PAYMENT_PENDING` → `PAID`
- `payment_intent.payment_failed` / `canceled` → payment `FAILED` (no SM PAID)
- `payment_intent.processing` → `AUTHORIZING` (monotonic; no-op if already held)
- Unknown types → `200` ignored

## Migration

`046_stripe_webhooks_1.0.sql` — `vauto_stripe_webhook_events`

## Tests / CI

```bash
npm run test:stripe-webhooks --prefix server
```

## Explicit stop

**Do not start Stage 11F.4** until auditor PASS after ZIP audit.
