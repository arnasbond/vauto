# Stage 11F.1 — Payment Domain & Ledger 1.0

## Status

**Implemented — awaiting audit PASS.**  
Server-authoritative financial core **before** any external Stripe / PSP API.  
**Stage 11F.2 (Stripe PaymentIntent Integration) NOT started.**

`paymentLedgerVersion`: **`1.0`**

## Hard financial rule

1. Payment **amount** and **currency** are 100% server-loaded.
2. Client may send **only** `idempotencyKey` (plus `transactionId` in the URL).
3. Client **must not** send `amount`, `amountCents`, `currency`, `sellerId`, or `status`.
4. Amount is taken **only** from `vauto_deal_snapshots.amount_cents` (INTEGER).
5. Before insert: **reconciliation**  
   `vauto_deal_snapshots.amount_cents === accepted_offer.amount_cents`  
   On mismatch → **422** `UNPROCESSABLE_FINANCIAL_ENTITY` (fail-closed, full rollback).

## Tables (migration `044_payment_domain_ledger_1.0.sql`)

### `vauto_payment_intents`

Statuses: `CREATED` → `AUTHORIZING` → `HELD_IN_ESCROW` → `RELEASED_TO_SELLER` | `REFUNDED` | `FAILED`  
Terminal: `RELEASED_TO_SELLER`, `REFUNDED`  
Unique per `transaction_id` and `idempotency_key`.  
DELETE forbidden; financial identity columns immutable on UPDATE.

### `vauto_payment_ledger` (append-only)

Entry types: `DEBIT` | `CREDIT` | `FEE` | `ESCROW_HOLD` | `ESCROW_RELEASE` | `REFUND`  
Fields include `amount_cents`, `running_balance_cents`, `actor_id`, `idempotency_key`, `entry_hash`.  
**UPDATE/DELETE raise exception** at DB level.

## 11A State Machine hooks

| Domain event | 11A transition |
|--------------|----------------|
| Payment intent created (buyer) | `AGREED` → `PAYMENT_PENDING` (`PAYMENT_REQUESTED`) |
| Escrow released to seller (SYSTEM) | `PAYMENT_PENDING` → `PAID` (`PAYMENT_CONFIRMED`) |

Internal `holdInEscrow` / `releaseToSeller` / `refund` are domain methods for tests and future 11F.2 webhooks — **no Stripe calls in 11F.1**.

## HTTP

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `POST` | `/api/transactions/:id/payment-intent` | `requireAuth` | Buyer only; 201 fresh / 200 idempotent replay |
| `GET` | `/api/transactions/:id/payment-intent` | `requireAuth` | Buyer or seller; stranger → **404** |

## Modules

`server/src/payment/` — `version`, `types`, `schema`, `reconciliation-service`, `ledger-service`, `payment-intent-service`, `repository`

## Tests / CI

```bash
npm run test:payment-ledger --prefix server
```

Wired in `.github/workflows/ci.yml` as **Stage 11F.1**.

## Explicit stop

**Do not start Stage 11F.2** until auditor PASS after ZIP audit.
