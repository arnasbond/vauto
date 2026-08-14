# Stage 11E.2 — Real PostgreSQL pg.Pool payment-readiness gate

## Status

**CI gate before 11F.** No new product features. No Escrow/Payments.

## Purpose

PGlite cannot prove multi-connection `pg.Pool` atomicity. This stage adds:

1. GitHub Actions `postgres:16` service
2. `TEST_DATABASE_URL` for real Pool tests (`max: 4`)
3. `npm run test:real-postgres-pool`

## Tests

`server/src/transaction/__tests__/real-postgres-pool.test.ts`

| Case | Assertion |
|------|-----------|
| Multi-buyer concurrent accept | Exactly 1 `AGREED` + 1 `vauto_deal_snapshots` |
| Fail-closed snapshot | Accept rolls back; offer stays `PENDING` |
| Audit immutability | UPDATE/DELETE → append-only exception |
| Amount cents authority | Snapshot + accepted offer store integer cents |

Without `TEST_DATABASE_URL`, suite falls back to PGlite (local).

## CI

`.github/workflows/ci.yml` — `services.postgres` + step **Stage 11E.2 Real PostgreSQL pg.Pool gate**.
