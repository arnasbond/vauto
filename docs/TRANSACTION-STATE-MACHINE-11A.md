# Stage 11A — Transaction State Machine 1.0

## Status

**PASS criteria target** — server-authoritative core only.  
**No UI. No Stripe / payment integration. No Stage 11B Structured Offers.**

`stateMachineVersion`: **`1.0`** (`TRANSACTION_STATE_MACHINE_VERSION`).

## Purpose

Deterministic transaction lifecycle from first discussion to completion or terminal exit. Clients **cannot** set `status` directly — transitions run only through the server engine with:

1. Allowed transition matrix (by actor role)
2. Optimistic locking (`version`)
3. Idempotency keys
4. Append-only event + audit log

## States

Happy path:

`DISCUSSION → OFFER_PENDING → NEGOTIATING → AGREED → PAYMENT_PENDING → PAID → SHIPPING_PENDING → SHIPPED → DELIVERED → COMPLETED`

Terminal / exception: `CANCELLED`, `EXPIRED`, `DISPUTED`.

## Transition matrix (summary)

| From | Allowed to |
|------|------------|
| DISCUSSION | OFFER_PENDING, CANCELLED |
| OFFER_PENDING | NEGOTIATING, AGREED, EXPIRED, CANCELLED |
| NEGOTIATING | AGREED, OFFER_PENDING, CANCELLED, EXPIRED |
| AGREED | PAYMENT_PENDING, CANCELLED |
| PAYMENT_PENDING | PAID *(SYSTEM/ADMIN)*, EXPIRED, CANCELLED |
| PAID | SHIPPING_PENDING, DISPUTED, CANCELLED *(REFUND_APPROVED only)* |
| SHIPPING_PENDING | SHIPPED, DISPUTED |
| SHIPPED | DELIVERED, DISPUTED |
| DELIVERED | COMPLETED, DISPUTED |
| COMPLETED / CANCELLED / EXPIRED / DISPUTED | *(none)* |

Actors: `BUYER`, `SELLER`, `SYSTEM`, `ADMIN` — see `transition-matrix.ts` for role gates and required `reasonCode`s.

## Persistence

Migration: `server/migrations/039_transaction_state_machine_1.0.sql`

- `vauto_transactions` — status, version, optional create idempotency key
- `vauto_transaction_events` — append-only transitions; unique `(transaction_id, idempotency_key)`
- `vauto_transaction_audit` — sequence + `state_hash` chain

## Module layout

`server/src/transaction/`

- `version.ts`, `types.ts`, `schema.ts`
- `transition-matrix.ts`, `state-machine.ts`
- `repository.ts`, `audit-logger.ts`, `index.ts`

## Tests

```bash
npm run test:transaction-state-machine --prefix server
```

Covers legal/illegal transitions, happy path, optimistic lock race (10-way → 1 win), idempotency replay, audit chain integrity (PGlite).

## Payment authority (Stage 11F foreshadow — M-03 / 11E.1)

When Escrow/Payments land in **11F**, the **only** financial authorities are:

1. `vauto_deal_snapshots.amount_cents` (immutable agreement freeze at AGREED)
2. `vauto_offers.amount_cents` on the accepted offer (`accepted_offer_id`)

Both are **integer cents**.  
`vauto_transactions.current_price` is a **UI display convenience only** (euro numeric) and MUST NOT be treated as the payment / escrow authority.

## Out of scope (later stages)

- 11B Structured offers *(done in later stage docs)*
- Payment / Stripe webhooks (SYSTEM `PAYMENT_CONFIRMED` reserved) — **11F only after audit**
- Buyer/seller UI surfaces
