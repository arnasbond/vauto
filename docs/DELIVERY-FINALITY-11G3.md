# Stage 11G.3 / 11G.4 — Delivery Finality & Durable Release Gate (Omniva v1 Ready)

## Status

**Implemented — STRICT STOP before Stage 11H (Dispute Resolution).**  
`deliveryIntegrationVersion`: **`1.2`**

Surgical finality + worker safety only — no Dispute / Reputation product work.

## Auditor fixes

### 11G.3

| ID | Fix |
|----|-----|
| **H-01** | On `DELIVERED`, same DB TX inserts `seller_release_jobs` (`PENDING`). Immediate attempt + scheduled worker retry with exponential backoff. **Invariant:** `DELIVERED` always has `SELLER_TRANSFERRED` and/or an active `PENDING`/`PROCESSING` job. Replays keep the job alive. |
| **H-02** | Authoritative carrier `DELIVERED` while deal is still `SHIPPING_PENDING` → **atomic** `SHIPPING_PENDING → SHIPPED → DELIVERED` in one TX (both audit events), then durable release job. No 409 for skip-state. |

### 11G.4 (worker safety)

| Fix | Detail |
|-----|--------|
| **Stale lease** | `PROCESSING` with `processing_started_at` older than **5 minutes** is reclaimed → `PENDING` at the start of each worker tick. |
| **Bounded retries** | After **12** failed attempts → `FAILED` (MANUAL_REVIEW) + critical log; job is never auto-retried. |
| **Boot wiring** | `server/src/index.ts` calls `startScheduledSellerReleaseWorker({ db, releasePort })` after migrations. |

## Omniva v1

Production default carrier mode is **Omniva** (`VAUTO_CARRIER_MODE=omniva` or unset). Fake remains forbidden in production.

## Flow

```
PAID → LABEL / SHIPPING_PENDING
     → (scan) SHIPPED
     → (confirm | carrier DELIVERED) DELIVERED + seller_release_jobs
     → releaseToSeller (immediate + durable retry)
```

Skip-state:

```
SHIPPING_PENDING + carrier DELIVERED
  → SHIPPED (audit) → DELIVERED (audit) → release job
```

## Migrations

- `051_durable_release_jobs_1.0.sql` — `seller_release_jobs`
- `052_stale_release_job_recovery_1.0.sql` — `processing_started_at` + stale index

## Worker

```ts
startScheduledSellerReleaseWorker({
  db: sellerReleaseDb,
  releasePort: createFundsReleasePort(sellerReleaseDb),
});
```

Started at API boot in `server/src/index.ts` (with reconciliation).

## Tests

```bash
npm run test:delivery-shipping --prefix server
```

Includes crash-recovery reclaim and max-12 → `FAILED` cases.

## Explicit stop

**Do not start Stage 11H** until auditor approval.
