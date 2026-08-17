# Stage 15R — Real Postgres release-blocker remediation

**Cursor status:** recorded in `vauto-15r-delta.zip` `MANIFEST.txt` after GitHub CI on the new SHA.

Cursor **does not** grant GO-LIVE. Stage 16 was **not** started. Production Vercel / Render / DB were **not** touched. Force-push and force-deploy were **not** used.

Certified Stage 10–14 product semantics are **FROZEN**. This stage only remediates the GitHub CI 11F.5 real-PostgreSQL cascade and the Android `[skip ci]` SHA drift.

---

## Chain

`14R FULL PASS` (`439cd102…`) → `15 NO-GO` (CI `32035682002`, 341 pass / 53 fail / 0 skip) → **15R** → independent audit → only then a repeat of Stage 15.

`439cd1022d33a0e2020b7d487d56aac2f637be9f` is **no longer a deployable candidate**. Any tracked-file change requires a new immutable SHA.

Live production (unchanged in 15R):

| Host | SHA |
| --- | --- |
| Render `/api/version` | `0e353e9c193ac2d43465dd6dc2e91f52bdd5cdfa` |
| Vercel `https://www.vauto.lt/` | pre-Stage-14 static site (not cut over) |

---

## Root cause (do not re-litigate as “53 test bugs”)

GitHub CI job env sets `TEST_DATABASE_URL` → **real `postgres:16`**. Stage 14R local 11F.5 used **PGlite**, so it missed this.

### Primary defect (one)

`isAuthorizedDisputeSellerPayout` in `server/src/payments/transfer/funds-transfer-service.ts` ran, **inside an open transaction**:

```sql
SELECT status FROM vauto_disputes WHERE transaction_id = $1 LIMIT 1
```

wrapped in `try/catch` that returned `false`.

On real PostgreSQL, missing relation is **`42P01`**. That **aborts the TX**. The catch swallows it. The next statement `PaymentRepository.getByTransactionIdForUpdate` (`SELECT … FOR UPDATE`) gets **`25P02` current transaction is aborted**.

The same catch-inside-TX pattern existed in `assertReleaseNotFrozenPreCall` (only when `txn.status === "DISPUTED"`).

### Why PGlite PASS was not evidence

`adaptPglite` runs `ROLLBACK` on any query error, so the session left the aborted TX and later queries looked fine. `11F.4 funds-transfer.test.ts` always uses PGlite (ignores `TEST_DATABASE_URL`), which is why CI 11F.4 passed and 11F.5 failed.

### Secondary victims (not independent bugs)

The other ~52 failures — crash-window recovery, M-02, `expected at least one concurrent winner`, reconciliation — were **25P02 cascade**. `collectConcurrentSuccesses` failed because all concurrent `releaseToSeller` jobs rejected after the aborted TX, so there was no winner.

Local probe on empty DB `vauto_15r_empty` **before** the fix: `setupHeldDelivered` OK; `releaseToSeller` first SQLSTATE **`25P02`**; stack `tx-connection.ts` → `getByTransactionIdForUpdate` → `runTx1PrepareTransfer`.

### Concurrency after the portability fix

On isolated real PG (empty CI-like DB, then fully migrated DB): crash-window `#0`–`#9` pass; `20 concurrent releases → 1 transfer` pass; `expected at least one concurrent winner` no longer fires. No OfferEngine / ledger semantic change.

A **second** real-PG harness issue appeared only after the 25P02 fix, when three 11F.5 files booted DDL/DML in parallel on one shared TEST DB: **`40P01` deadlock** on `ledger conservation after hold #0`. That is test-isolation, not money semantics. Mitigations: `pg_advisory_lock` around harness DDL + `--test-concurrency=1` on `test:financial-reconciliation`.

---

## Production log: `column "tags" does not exist` (DB not changed)

| Item | Value |
| --- | --- |
| Query | `LISTING_SELECT` / `LISTING_SEARCH_SELECT` in `server/src/repository.ts` — `category, tags, contact, … FROM listings` |
| Table | `listings.tags` |
| Provenance | `server/migrations/001_initial_schema.sql` (`tags JSONB NOT NULL DEFAULT '[]'`) |
| Not this table | `seller_reviews.tags` from `026_trust_reviews_boost_alerts.sql` |
| Why a later ALTER exists | `CREATE TABLE IF NOT EXISTS` does **not** add missing columns if a narrower stub created `listings` first (11E.2 / 11F.5 `LISTINGS_STUB` historically omitted `tags`) |
| 15R migration | `062_listings_tags_if_missing.sql` — `ALTER TABLE listings ADD COLUMN IF NOT EXISTS tags …` |
| Production | **Not applied.** Live GET `/api/listings` already returned rows on `0e353e9c`; 062 is defensive for stub-created catalogs. |

---

## Minimal patch set (frozen kernels)

1. **`funds-transfer-service.ts`** — `publicRelationExists` via `SELECT to_regclass($1)::text` (does not fail if missing). Probe `vauto_disputes` only when present. Semantics unchanged: no table / no `DECIDED_SELLER_PAYOUT` → not an authorized dispute payout.
2. **`financial-harness.ts`** — listings stub + `ALTER … tags`; apply `DISPUTE_MIGRATION_SQL`; serialize harness DDL with advisory lock.
3. **`real-postgres-pool.test.ts`** — same `tags` stub/ALTER (11E.2 runs first on shared CI `vauto_test`).
4. **`062_listings_tags_if_missing.sql`** — idempotent column add. **Do not apply on production in 15R.**
5. **`server/package.json`** — `test:financial-reconciliation` uses `--test-concurrency=1`.
6. **`.github/workflows/android-build.yml`** — no longer `on: push` to master. `workflow_run` after **CI success** on master push (same pattern as Vercel/Render). Manual dispatch requires green CI for that SHA. Checkout **that SHA**. Removed `git commit` + `git push` of `version-config` (`[skip ci]` can no longer move the deploy unit). APK publish does not rewrite git master.

---

## Local real-Postgres proof

No Docker on this machine. Isolated cluster `127.0.0.1:55434`, user `vauto_test`, **PostgreSQL 18.4** (same `42P01` / `25P02` / `40P01` SQLSTATEs as 16). Official version proof is GitHub CI `postgres:16`.

PGlite PASS is **not** counted as 15R evidence.

### Fresh migrate (`vauto_15r_gate`)

`DROP DATABASE` + `CREATE DATABASE` + `runMigrations()` from zero: **64 files**, including `062_listings_tags_if_missing.sql`. `listings.tags` present. RAW: `vauto-15r-migrate.txt` in the zip.

### CI-like empty DB (`vauto_15r_ci`) — GitHub 11F.5 order

11E.2 then 11F.5 with `TEST_DATABASE_URL` only (no `DATABASE_URL`):

| Suite | Result |
| --- | --- |
| 11E.2 real-postgres-pool | 5 pass / 0 fail / 0 skip |
| 11F.5 financial-reconciliation | **394 pass / 0 fail / 0 skip** |

RAW: `vauto-15r-11f5-ci-empty-raw.txt`.

### Full gate on migrated `vauto_15r_gate`

`TEST_DATABASE_URL` → `vauto_15r_gate`. Builds + critical regression + concurrency + 13C PG. Gate exit **0**, `bad=0`. 11F.5 again **394 / 0 / 0**. Playwright TAP parser printed `pass=0` (known 14R miss); dedicated re-run:

```
Running 38 tests using 1 worker
  38 passed (4.4m)
PW_EXIT=0
```

0 fail / 0 unexpected skip. RAW: `vauto-15r-playwright.txt`, `vauto-15r-gate.jsonl`, `vauto-15r-gate-summary.txt`.

`public/runtime-config.json` restored to `https://vauto-api.onrender.com` / `conductorEnabled: true` after bake.

---

## Git / release SHA

Branch: `release/stage15r-remediation` from `origin/master` (`77ae4a14`, APK-size chore only). One 15R commit. **Not merged. Not pushed to master. Not deployed.**

Old candidate `439cd102…` is obsolete.

---

## GitHub CI

Must be **green** on the new SHA (same workflow as failed run `32035682002`). Run ID is in the zip `MANIFEST.txt`.

Only green GitHub CI allows a later **repeat of Stage 15**. This packet does **not** start that repeat.

Catalog audit on GitHub (hidden by 11F.5 fail-fast on `439cd102`) still required `e2e/smoke.spec.ts` to contain the pre-12A headline `Parduok ir rask greičiau`. Certified Stage 12 smoke asserts `Žmogus sprendžia`. The audit needle was aligned to that frozen copy. UI was not redesigned.

`e2e/ai-assistant-restore.spec.ts` still required the fashion-only welcome `Jūsų kontaktai jau paruošti`. Certified default seller welcome is `Pasirinkite kategoriją…` (`STATIC_SELLER_LISTING_WELCOME`). Locator aligned to that frozen copy. Seller flow was not redesigned.

---

## Explicit non-goals

- No Vercel / Render / production DB changes
- No force deploy, no force-push
- No Stage 16
- No UX / product redesign
- 062 not applied on production
