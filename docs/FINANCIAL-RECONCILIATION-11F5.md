# Stage 11F.5 — Financial Reconciliation & Red Team Stress Tests 1.0

## Status

**Implemented — awaiting financial checkpoint audit (full source ZIP).**  
No new payment product features — proves 11F.1–11F.4 zero-drift.  
**Stage 11G NOT started.**

`paymentReconciliationVersion`: **`1.0`**

## Eight invariants (integer EUR cents)

1. `snapshot.amount_cents === accepted_offer.amount_cents`
2. `payment_intent.amount_cents === snapshot.amount_cents`
3. `gross === platform_fee + seller_net` (when fee split set)
4. Stripe PI amount === VAUTO gross
5. Transfer amount === seller_net
6. Refund ≤ captured
7. Reversal ≤ transferred
8. Ledger conservation: holds(+reversals) === outflows + unreleased

## Classification

| Class | Meaning | Auto-heal |
|-------|---------|-----------|
| `IN_SYNC` | OK | — |
| `RECOVERABLE_DRIFT` | Safe provider link missing | Yes (attach known PI id only) |
| `MANUAL_REVIEW` | Needs operator | No |
| `SECURITY_MISMATCH` | Amount/currency/seller mismatch | **Never** |

## Modules

`server/src/payments/reconciliation/` — version, types, schema, invariants, discrepancy-classifier, repair-policy, reconciler, reconciliation-worker

## HTTP

`GET /api/admin/payments/reconciliation-check` (`requireAuth` + `requireAdmin`)  
Operator-safe report only — no raw Stripe PII/secrets.

## Race policy

Release vs refund: `SELECT … FOR UPDATE` on payment intent — deterministic winner; `TRANSFER_PENDING` blocks concurrent refund start.

## Tests

```bash
npm run test:financial-reconciliation --prefix server
```

## Explicit stop

**Do not start Stage 11G** until unlimited source ZIP audit + auditor approval.
