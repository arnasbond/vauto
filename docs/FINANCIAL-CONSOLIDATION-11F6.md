# Stage 11F.6 — Financial Authority Consolidation Gate

## Status

**Implemented — STRICT STOP before Stage 11G.**  
Surgical hardening only — no new payment product features.

## Auditor fixes

| ID | Fix |
|----|-----|
| **C-01** | Removed `app.use("/api/escrow-billing")` and `app.use("/api/billing")` from `server/src/index.ts`. Deal money MUST use 11F routers only. |
| **C-02** | `refundToBuyer` requires `authority ∈ {SYSTEM, ADMIN, DISPUTE_ENGINE, MUTUAL_CANCEL}`. HTTP route returns **403** unless admin. Buyer self-refund blocked. |
| **H-01** | Refund TX marks `REFUND_PENDING`; `REFUNDED` + ledger `BUYER_REFUNDED` only when Stripe refund `status === 'succeeded'` (or `charge.refunded` / `refund.updated` webhook). |
| **H-02 / M-01** | `reconciliation-check` uses `createProductionProviderLookup()` (live Stripe when `STRIPE_SECRET_KEY` set). `startScheduledReconciliationWorker()` started at boot. |
| **H-03 / M-02** | Financial harness prefers `TEST_DATABASE_URL` + `pg.Pool({ max: 4 })`. Fake `listTransfers` / refunds filter by `transactionId` + `paymentIntentId` / stripe PI. |

## Migration

`048_refund_pending_authority_1.0.sql` — adds `REFUND_PENDING` to payment `status` and `transfer_status`.

## Tests

```bash
npm run test:financial-reconciliation --prefix server
```

Includes `real-postgres-financial.test.ts` consolidation gate.

## Explicit stop

**Do not start Stage 11G** until auditor re-approval after financial checkpoint.
