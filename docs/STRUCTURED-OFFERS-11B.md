# Stage 11B — Structured Offers 1.0

## Status

Server-authoritative offer / counter-offer engine on top of **11A Transaction State Machine**.  
**No Stripe, escrow, shipping UI, or LLM write authority. No Stage 11C.**

`offersVersion`: **`1.0`** (`STRUCTURED_OFFERS_VERSION`).

## Flow

`LISTING → buyer offer → seller accept|reject|counter → buyer accept|reject|counter → AGREED`

## Rules

- Money: **`amount_cents` integer only** (e.g. 699.99 EUR → `69999`)
- Immutable chain: counters insert a new row with `parent_offer_id`
- Client may send only `amountCents`, optional `expiresAt`, `idempotencyKey`, `expectedVersion`
- Identities + status loaded server-side from auth + DB
- Offer mutation + 11A transition + audit in **one DB transaction**
- Single-sale: unique partial index on `vauto_transactions(listing_id)` for AGREED+ statuses
- Optimistic locking on offer `version` and 11A `version`

## 11A mapping

| Offer action | Typical 11A transition |
|--------------|-------------------------|
| First create | DISCUSSION → OFFER_PENDING |
| Counter | → NEGOTIATING |
| Accept | → AGREED |
| Withdraw (last pending) | → CANCELLED |
| Expire | → EXPIRED |
| Reject | → NEGOTIATING (from OFFER_PENDING) |

## HTTP (requireAuth)

- `POST /api/transactions/:id/offers`
- `GET /api/transactions/:id/offers`
- `POST /api/offers/:id/accept|reject|counter|withdraw`

## Migration

`server/migrations/040_structured_offers_1.0.sql`

## Tests

```bash
npm run test:structured-offers --prefix server
```
