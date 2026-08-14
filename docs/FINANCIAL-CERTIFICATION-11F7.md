# Stage 11F.7 — Final Financial Certification Delta Gate

## Status

**Implemented — STRICT STOP before Stage 11G.**  
Two targeted fixes only — no new payment / delivery features.

## Fixes

| ID | Change |
|----|--------|
| **H-01** | `processBillingCheckoutSessionCompleted`: `metadata.kind === "escrow"` short-circuits **before** `persistInvoiceFromCheckoutSession`. Webhook returns `{ received: true, legacyEscrowIgnored: true }`. Zero invoice / ledger / payment mutations. |
| **M-01** | `stripe-provider-lookup.ts`: when DB has `stripe_transfer_id` / `stripe_refund_id` / `stripe_reversal_id`, uses `stripe.transfers.retrieve` / `stripe.refunds.retrieve` / `retrieveReversal`. **Removed** `transfers.list({ limit: 100 })`. |

## Tests

- `>100` noise transfers + direct retrieve reconciliation (financial-reconciliation + real-postgres-financial).
- Source assertions: no escrow write in billing webhook; no `list({limit:100})` in live lookup.

```bash
npm run test:financial-reconciliation --prefix server
```

## Explicit stop

**Do not start Stage 11G** until auditor final certification.
