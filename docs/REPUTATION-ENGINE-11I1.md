# Stage 11I.1 — Reputation Engine & Verified Reviews 1.0

## Status

**Implemented — STRICT STOP before Stage 12 (Front-end UI/UX & Production Launch).**  
`reputationEngineVersion`: **`1.0`**

## Zero fake reviews invariant

1. Only the transaction **buyer** or **seller** may review (`reviewer_id` is a party).
2. Review allowed **only** when transaction status is `COMPLETED` (paid + fulfilled; includes dispute seller-payout finality, which lands on `COMPLETED`).
3. **No self-review** — `reviewee_id` is always the counterparty; DB `CHECK (reviewer_id <> reviewee_id)`.
4. **Exactly 1 review per party per deal** — `UNIQUE (transaction_id, reviewer_id)` → HTTP **409**.
5. Stranger / uncompleted / cancelled / in-flight → HTTP **403**. Missing transaction → **404**.

`reviewee_id` is **server-derived**. The client cannot pick who is rated.

## Aggregation

Deterministic from `vauto_reviews`:

- `ratingAverage` = `ROUND(AVG(rating), 2)` (e.g. `4.85`)
- `totalReviewsCount` = row count for `reviewee_id`
- Empty user: `ratingAverage = null`, `totalReviewsCount = 0`

## HTTP

| Method | Path | Who |
|--------|------|-----|
| POST | `/api/transactions/:id/reviews` | Buyer/Seller (`requireAuth`) |
| GET | `/api/users/:id/reputation` | Public average + review list |

Body: `{ "rating": 1-5, "comment"?: string }` (strict Zod).

## Migration

`057_reputation_reviews_1.0.sql` — `vauto_reviews`

## Tests

```bash
npm run test:reputation-engine --prefix server
```

## Explicit stop

**Do not start Stage 12** until auditor approval.
