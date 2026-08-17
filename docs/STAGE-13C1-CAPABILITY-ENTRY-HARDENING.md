# Stage 13C.1 — Capability entry-point & PostgreSQL concurrency hardening

**Status:** `ETAPAS 13C.1 IMPLEMENTED — AWAITING INDEPENDENT AUDIT`

This is a **narrow security/concurrency delta** on top of 13C. It does **not** certify:

`ETAPAS 13C — FULL PASS / UNIVERSAL DEAL ROOM & NEGOTIATION ENGINE CERTIFIED`

That label is reserved for a later independent audit.

Independent 13C audit input: CRITICAL 0, HIGH 0, MEDIUM 2. Architecture accepted; this packet closes the two remaining hardening blockers.

## Frozen boundaries

| Layer | Touched? |
| --- | --- |
| 11J `server/src/payments/` internals | **NO** |
| Stripe webhook / provenance | **NO** |
| Ledger semantics | **NO** |
| 11J migrations 058–061 | **NO** |
| 13A registry (`capabilities.ts`, `attributes.ts`, `registry.ts`, `types.ts`) | **NO** semantic changes |
| 13B facet engine | **NO** semantic changes |
| Global UI/UX, split-map, media | **NO** |

Route files that already existed (`payment-intent.ts`, `offers.ts`) are wired only for 13C authorization. 11F Stripe service is still called through its **public** `createStripePaymentIntentService` API after the 13C guard.

## 1. All payment entry points

| HTTP | Privilege | 13C.1 gate |
| --- | --- | --- |
| `POST /api/transactions/:id/payment-intent` | Create ledger payment intent (authoritative amount) | `UniversalDealRoomService.initiatePayment()` → `authorizePrivilegedPayment()` |
| `POST /api/transactions/:id/universal-deal/payment` | Same as above | `initiatePayment()` → `authorizePrivilegedPayment()` |
| `POST /api/transactions/:id/payment-intent/stripe-intent` | Create Stripe PaymentIntent | `createStripePaymentIntent()` → **same** `authorizePrivilegedPayment()` **then** public 11F Stripe service |
| `GET /api/transactions/:id/payment-intent` | Read existing intent | 11F participant 404 (does **not** initiate payment) |

There is **no** remaining production path that constructs Stripe checkout without the shared guard.

## 2. Shared privileged-payment guard

Single internal method: `UniversalDealRoomService.authorizePrivilegedPayment()`.

Fail-closed checks (independent on every call — no “user already called the other endpoint” assumption):

1. Authenticated actor (`requireAuth` + `actorUserId`)
2. Transaction participation (else 404 IDOR)
3. Server-side listing load
4. Canonical vertical from listing (`resolveListingVertical` — **client `verticalId` ignored**)
5. `supportsPlatformPayment` / `INITIATE_PAYMENT` capability
6. Actor role **BUYER** (else 404)
7. Allowed tx state: `AGREED` \| `PAYMENT_PENDING` (`DealPaymentStateError` 422)
8. Amount from 11F snapshot / accepted offer — client money fields are never copied

HTTP:

`route → UniversalDealRoomService → authorizePrivilegedPayment → 11F public service`

Policy is **not** duplicated in three places. JOBS/REAL_ESTATE fail at step 5 with `DEAL_CAPABILITY_DENIED` (403) **before** Stripe is constructed/called. Tests M/N inject a Stripe port that throws `STRIPE_REACHED` and assert call count `0`.

## 3–5. Bypass tests (expected)

| Test | Result |
| --- | --- |
| **M** JOBS `/stripe-intent` | 403 `DEAL_CAPABILITY_DENIED`, `verticalId=JOBS`, Stripe not reached |
| **N** REAL_ESTATE `/stripe-intent` after accept | 403 `DEAL_CAPABILITY_DENIED`, `verticalId=REAL_ESTATE`, Stripe not reached |
| **O** Client `{ verticalId: "ELECTRONICS" }` on JOBS / REAL_ESTATE | Server reports listing vertical (`JOBS` / `REAL_ESTATE`), still 403 |

## 6. Withdraw / cancel authorization chain

`POST /api/offers/:id/withdraw`

`HTTP → UniversalDealRoomService.withdrawOffer() → gate(CANCEL) → OfferEngine.withdraw → OfferRepository`

Gate proves:

- actor is buyer or seller (else 404)
- offer belongs to that deal
- listing canonical capability includes `CANCEL` (always present; negotiation SM still applies)
- current negotiation state allows `CANCEL` (`ACCEPTED` / `CANCELLED` cannot withdraw)
- creator ownership (`createdByUserId === actor`, else 404)
- repository: `SELECT … FOR UPDATE` + `UPDATE … WHERE status = 'PENDING' AND version = $n`

Accepted / rejected / cancelled offers cannot be withdrawn into a fake open state.

## 7. Withdraw tests (expected)

| Test | Result |
| --- | --- |
| **P** Third-party withdraw | 404 `not_found`, offer stays `PENDING` |
| **Q** Withdraw after accepted | 422 `DEAL_INVALID_TRANSITION`, offer stays `ACCEPTED` |
| **R** Owner withdraw while `PENDING` | 200, status `WITHDRAWN` (AI throw does not block) |

## 8–10. PostgreSQL atomic mechanisms (not `Promise.all`, not a disabled button)

Enforced in `server/src/transaction/offers/repository.ts` + `server/migrations/040_structured_offers_1.0.sql`:

1. **`SELECT * FROM vauto_offers WHERE id = $1 FOR UPDATE`**
2. **`SELECT * FROM vauto_transactions WHERE id = $1 FOR UPDATE`**
3. **CAS:** `UPDATE vauto_offers SET status = … WHERE id = $1 AND version = $2 AND status = 'PENDING' RETURNING *` — 0 rows → `OfferVersionConflictError`
4. **Unique partial index** `uq_vauto_offers_active_pending_per_tx` — at most one `PENDING` tip per transaction
5. **Unique partial index** `uq_vauto_transactions_listing_active_sale` — one active sale per listing
6. **Explicit transaction** via `runQueryableTransaction` / `pool.connect()` + `BEGIN` (each Deal Room service uses its own pool client when `pg.Pool({ max: >= 2 })`)

`Promise.all` in tests is only the **race driver**. Frontend button disable is not a security boundary.

| Test | Invariant |
| --- | --- |
| **S** Double ACCEPT, two pool clients | Exactly one `ACCEPTED` offer; tx `AGREED`; loser conflict/stale |
| **T** ACCEPT vs REJECT, two pool clients | One terminal offer status; not two authoritative finals |
| **U** Parallel counters, two pool clients | One `PENDING` child, parent `COUNTERED`, `parent_offer_id` set |

Suite: `npm run test:deal-room-13c-pg`

If `TEST_DATABASE_URL` is unset:

> **SKIPPED — requires TEST_DATABASE_URL; mandatory before Stage 14 GO/NO-GO.**

SKIP ≠ PASS.

This machine (2026-08-17): isolated local PostgreSQL 18.4 on `127.0.0.1:55432/vauto_test` (not production, not the compose `vauto` DB). **S, T, U all PASS.**

## 11. Money authority

Unchanged 13C rule: client cannot set the real payment amount.

Test J: accepted `50000` cents; client sends `500` on `/payment-intent` (400) and `/stripe-intent` (400); successful `/universal-deal/payment` remains `50000`.

## 12. AI-down

Test K unchanged: offer + accept succeed while `DealAiPort.suggest` throws. Test R withdraw also throws AI and still succeeds. No new AI refactor.

## 13. Chain the auditor must read

```
HTTP (offers.ts / payment-intent.ts / universal-deal-room.ts)
  → UniversalDealRoomService (authorizePrivilegedPayment / gate / withdrawOffer)
    → OfferEngine
      → OfferRepository (FOR UPDATE + version CAS + unique indexes)
        → PostgreSQL (040_structured_offers_1.0.sql)
```

Public 11F: `PaymentIntentService` / `createStripePaymentIntentService` after the gate only.

## QA commands

```
npm run test:category-domain
npm run test:faceted-search
npm run test:adaptive
npm run test:deal-room-13c
npm run test:deal-room-13c-pg
npx playwright test e2e/stage13c-deal-room.spec.ts
npx playwright test e2e/stage13b-faceted-filters.spec.ts
npx playwright test e2e/stage12b-user-comprehension.spec.ts
npx tsc --noEmit
npx tsc --noEmit -p server/tsconfig.json
npm run lint
npm run build
npm run server:build
```

## QA results (2026-08-17, this machine)

| Command | passed | failed | skipped | Exit |
| --- | --- | --- | --- | --- |
| `npm run test:category-domain` | 14 | 0 | 0 | 0 |
| `npm run test:faceted-search` | 23 | 0 | 1 | 0 |
| `npm run test:adaptive` | 23 | 0 | 0 | 0 |
| `npm run test:deal-room-13c` (A–K, M–R) | 35 | 0 | 0 | 0 |
| `npm run test:deal-room-13c-pg` (S–U) | 3 | 0 | 0 | 0 |
| Playwright `e2e/stage13c-deal-room.spec.ts` | 5 | 0 | 0 | 0 |
| Playwright `e2e/stage13b-faceted-filters.spec.ts` | 11 | 0 | 0 | 0 |
| Playwright `e2e/stage12b-user-comprehension.spec.ts` | 16 | 0 | 0 | 0 |
| `npx tsc --noEmit` | — | — | — | 0 |
| `npx tsc --noEmit -p server/tsconfig.json` | — | — | — | 0 |
| `npm run lint` | — | — | — | 0 |
| `npm run build` | — | — | — | 0 |
| `npm run server:build` | — | — | — | 0 |

Faceted-search SKIP is the existing 13B EXPLAIN test without `TEST_DATABASE_URL`. SKIP ≠ PASS.

Real PostgreSQL 13C.1 S/T/U on this machine: **3 passed, 0 failed, 0 skipped, exit 0** (isolated `127.0.0.1:55432/vauto_test`, not production).

`npm run lint` / `npm run build` printed pre-existing `react-hooks/exhaustive-deps` warnings in `VautoAgentContext` / `VautoContext` (exit 0).
