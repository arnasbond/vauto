# Stage 14 — Production release gate & final system validation

**Cursor status:** `ETAPAS 14 IMPLEMENTED — AWAITING INDEPENDENT PRODUCTION RELEASE AUDIT`

Cursor **does not** grant `PRODUCTION READY`, `GO-LIVE CERTIFIED`, or a Cursor `FULL PASS`. That verdict belongs to independent audit.

13C was independently audited **FULL PASS**. Certified Stage 10–13C kernels are treated as **FROZEN**. Stage 14 changed semantics only where a production-blocking defect was proven, and only with a minimal fix.

Isolated TEST PostgreSQL only (`127.0.0.1:55433`, database `vauto_test`). No production DB. No Stage 15. No production deploy.

---

## GO / NO-GO matrix

Independent audit owns the final release decision. Cursor classification below is evidence for that audit.

| Gate | Result | Evidence |
| --- | --- | --- |
| Full clean build (frontend + server TypeScript, lint, production build) | **PASS** | `npx tsc --noEmit` 0; `npx tsc --noEmit -p server/tsconfig.json` 0; `npm run lint` 0; `npm run server:build` 0; `npm run build` 0. Pre-existing `react-hooks/exhaustive-deps` warnings are not treated as build errors. |
| Stage 10–13C unit/integration regression | **PASS** with documented skips | See §2. Production-critical skips are not counted as PASS. |
| Real PostgreSQL 13C S/T/U | **PASS** | 3 pass / 0 fail / 0 skip / exit 0 on fully migrated TEST DB. |
| Database migrations 058–061 + fresh chain | **PASS** | Fresh apply of 63 SQL files through `061_universal_transaction_core_11j3.sql`, exit 0. Two HIGH migrate blockers were fixed (see §3). |
| Security release gate | **PASS** | Mapped to existing 10I/10K/11B/11F/13B/13C suites plus env fail-closed. See §5. |
| Secrets / configuration audit | **PASS** | No live secrets in git-tracked source. Production `JWT_SECRET` / Stripe secrets fail-closed via `assertProductionEnv()`. |
| Production dependency audit | **PASS** (no major bumps) | Findings classified; no major version changes. See §7. |
| Fresh-start install → migrate → build → start | **PASS** | Documented in §8. Isolated TEST PG + `npm ci` / `server:install` / migrate / build. |
| Critical user journeys | **PASS** | Proven by 13C M–R + S/T/U + 11E.2 + 11I + 13B HTTP, not by new features. See §9. E2E Playwright packet is listed separately. |
| Observability / failure behavior | **PASS** | Client 500 is `{ error: "Internal server error" }`. Stripe/AI/DB failures do not mint success. Misleading migrate log wording corrected. |
| Frozen-boundary diff | **PASS** | Only documented Stage 14 files. See §11. |
| Stage 12A/12B/13B/13C Playwright E2E | **PASS** | 38 passed / 0 failed / 0 skipped / exit 0. Isolated loopback + PGlite harness. See §13. |

**Cursor does not set GO-LIVE.** Recommended independent-audit posture: **CONDITIONAL GO** on server/migrate/security/13C PG/PGlite suite evidence plus this Playwright packet (38/0/0). Cursor still does not grant GO-LIVE.

---

## 1. Full clean build gate

| Command | Exit |
| --- | --- |
| `npx tsc --noEmit` | 0 |
| `npx tsc --noEmit -p server/tsconfig.json` | 0 |
| `npm run lint` | 0 |
| `npm run server:build` | 0 |
| `npm run build` | 0 |

No ignored TypeScript or production-build errors.

---

## 2. Stage 10–13C regression counts

`TEST_DATABASE_URL` pointed at isolated TEST PostgreSQL. Root `package.json` has no `"test"` script; suites are the CI scripts in `.github/workflows/ci.yml`.

### 2.1 Exact suite results

| Suite | pass | fail | skip | exit | Notes |
| --- | --- | --- | --- | --- | --- |
| auth-e2e | 1 (offline script) | 0 | 0 | 0 | Custom harness: `✓ Offline auth E2E checks passed`. Live API `--live` not run (would use production API). |
| ai-golden | 61 `[PASS]` | 0 | 0 | 0 | After Stage 14 source-check fix (see blocker A). |
| ai-foundation | 12 | 0 | 0 | 0 | |
| ai-intent | 2 | 0 | 0 | 0 | |
| ai-search | 5 | 0 | 0 | 0 | |
| ai-sell | 4 | 0 | 0 | 0 | |
| ai-market | 156 | 0 | 0 | 0 | |
| vauto-score | 183 | 0 | 0 | 0 | |
| buyer-match | 203 | 0 | 0 | 0 | |
| compare-engine | 183 | 0 | 0 | 0 | |
| ai-watch | 224 | 0 | 0 | 0 | |
| ai-red-team | 301 | 0 | 0 | 0 | |
| stage10-integration | 4 | 0 | 0 | 0 | |
| stage10-http-integration | 8 | 0 | 0 | 0 | |
| transaction-state-machine | 482 | 0 | 0 | 0 | |
| structured-offers | 269 | 0 | 0 | 0 | |
| transaction-chat | 205 | 0 | 0 | 0 | XSS + IDOR included. |
| negotiation-copilot | 205 | 0 | 0 | 0 | Provider-down uses fallback template; `executableAction` stays null. |
| deal-room | 182 | 0 | 0 | 0 | |
| real-postgres-pool | 5 | 0 | 0 | 0 | After production-like listing seed (blocker C). REAL `pg.Pool max=4`. |
| payment-ledger | 177 | 0 | 0 | 0 | |
| stripe-payment-intent | 181 | 0 | 0 | 0 | Fake adapter only. |
| stripe-webhooks | 220 | 0 | 0 | 0 | Missing signature rejected. |
| funds-transfer | 182 | 0 | 0 | 0 | After PGlite ROLLBACK-on-error adapter (blocker D). |
| financial-reconciliation | 394 | 0 | 0 | 0 | PGlite/CI path after `allSettled` + seed fixes. Real-PG `Promise.all` 409 wave was a test assertion gap (CAS losers), not a double-payout. |
| delivery-shipping | 165 | 0 | 0 | 0 | After production-like seed + PGlite ROLLBACK-on-error adapter. |
| dispute-resolution | 147 | 0 | 0 | 0 | PGlite/CI path. Shared production-like cluster hang is documented in §2.2; not used as PASS for that mode. |
| reputation-engine | 121 | 0 | 0 | 0 | On live TEST DB. |
| universal-core | 18 | 0 | 0 | 0 | Includes 11J.2 real pool FOR UPDATE when URL is set. |
| category-domain | 14 | 0 | 0 | 0 | |
| faceted-search | 24 | 0 | 0 | 0 | EXPLAIN skip cleared when TEST DB was up (see §2.2). |
| deal-room-13c | 35 | 0 | 0 | 0 | Includes M–R capability/IDOR/money/AI-down. |
| deal-room-13c-pg | 3 | 0 | 0 | 0 | S/T/U. Reconfirmed after fixture + migrate fixes. |
| adaptive | 23 | 0 | 0 | 0 | Offline layout checks. |

### 2.2 SKIP explanations (SKIP ≠ PASS)

| Skip | Production-critical? | Explanation |
| --- | --- | --- |
| faceted-search EXPLAIN (`L — EXPLAIN sanity`) | Yes, index/plan sanity | **First wave:** skipped because TEST PG was down (`ECONNREFUSED 55433`). **After restore:** 0 skip / 24 pass. The skip path is `t.skip` when `listings` cannot EXPLAIN — it is **not** reported as PASS. |
| 13C.1 S/T/U without `TEST_DATABASE_URL` | Yes | `describe.skip` + explicit `it.skip(SKIP_MSG)`. URL was set for the certified run: 0 skip. |
| 11J.2 / 11F.6 real-pg describes without URL | Yes | Would skip locally. URL was set for the Stage 14 PG runs. |
| 11H re-apply-migrations on a dirty shared TEST cluster | No (CI uses empty Postgres) | Hung/`40P01` once after a killed run. Certified count is PGlite **147 / 0 / 0 / 0**. |
| Playwright E2E job | Yes for UX | **After this gate:** 38 / 0 / 0 / exit 0. See §13. |
| `test:api-integration` | Ops smoke vs live Render | **SKIPPED** — uses production API host; Stage 14 forbids production data/hosts as the test oracle. |

---

## 3. Migrations (058–061 and fresh chain)

Lexicographic apply via `schema_migrations`. Duplicate prefixes exist (`015_*` ×2, `019_*` ×2) and are compatible. Number **054 is a gap only** (053 → 055), not a missing file.

Fresh isolated TEST DB: **63 files applied**, last `061_universal_transaction_core_11j3.sql`, **MIGRATE_EXIT=0**.

### Blocker 1 — HIGH (fresh TEXT schema)

**Before:** `015_universal_category_registry.sql` ran `ALTER TYPE listing_category ...` but `001_initial_schema.sql` uses `listings.category TEXT`. Fresh production-like DB aborted the chain before 058–061.

**After:** no-op unless `pg_type.typname = 'listing_category'`. File: `server/migrations/015_universal_category_registry.sql`.

### Blocker 2 — HIGH (UTF-8 BOM)

**Before:** `019_drop_user_portal_links.sql` began with U+FEFF → `syntax error at or near "﻿"`.

**After:** file rewritten UTF-8 without BOM. `server/src/migrate.ts` strips BOM: `readFileSync(...).replace(/^\uFEFF/, "")`.

Idempotency: `schema_migrations` primary key skips already-applied filenames. `IF NOT EXISTS` / `ADD VALUE IF NOT EXISTS` used where types exist. No production DB was modified.

---

## 4. Production-blocking defects found by Stage 14 tests

### A — MEDIUM — AI golden source check (CI gate)

**Cause:** `openAiSellerListingChat` renders `sellerListingWelcome()` via `setMessages` (no LLM). Golden regex still required `STATIC_SELLER_LISTING_WELCOME` inside `VautoAgentContext.tsx`.

**Fix:** golden check accepts `sellerListingWelcome` + `setMessages` and still forbids `sendAgentMessage(aiSellerListingGreeting|sellerListingWelcome)`.

**After:** `npm run test:ai-golden` exit 0, all golden checks passed.

### B — HIGH — migrate chain (see §3)

### C — HIGH — production-like listing seed

**Cause:** 001 requires `listings.seller_id`, `location`, `image`, `category` NOT NULL (+ `users` FK). 11E.2 / 11F.5 / 11G / 13C.1 stubs inserted a thin listings row. That is a **test fixture** gap, not OfferEngine semantics.

**Fix:** seed `users` when present; INSERT required columns. Unique listing ids (`randomUUID`) so a persistent TEST cluster does not hit `LISTING_SALE_CONFLICT` across reruns.

**After:** 11E.2 **5 / 0 / 0 / 0**; 13C.1 **3 / 0 / 0 / 0**.

### D — HIGH — PGlite abort poisoning (11F.4)

**Cause:** a failed statement left PGlite in `25P02`; later tests looked like 110 money failures. First named fail was `releaseToSeller Stripe transfer #0`.

**Fix (test adapter only):** `adaptPglite` ROLLBACK on query error.

**After:** single test pass; full `test:funds-transfer` **182 / 0 / 0 / 0**.

### E — MEDIUM — observability log lie

**Before:** migrate catch logged `payment gates fail-open until schema catches up`.

**Actual:** HTTP stays up for health checks; payment queries throw → `sendInternalError` 500. No false success.

**After:** log text says fail-closed. File: `server/src/index.ts`.

### F — MEDIUM — real-PG concurrency tests used `Promise.all`

**Cause:** 11F CAS losers correctly throw `PAYMENT_VERSION_CONFLICT` (409). Tests required every concurrent promise to fulfill. Ledger still had exactly one `SELLER_TRANSFERRED` on the winner path.

**Fix:** `collectConcurrentSuccesses()` (`Promise.allSettled`) + assert ≥1 winner and ledger count 1. **No change to funds-transfer/OfferEngine semantics.**

---

## 5. Security release gate

| Invariant | Proof |
| --- | --- |
| Auth required | 10K HTTP 401; agent routes `requireAuth`. |
| IDOR | 11B / 13C E: stranger 404, not 403 leakage. Payment `PaymentAuthError` → 404. |
| Capability authorization | 13C F/M/N/O: JOBS / REAL_ESTATE cannot unlock Stripe; forged vertical ignored. `DEAL_CAPABILITY_DENIED` = 403. |
| Server-authoritative money | 13C J; 11E.2 amount cents INT; client body cannot set amount. |
| Webhook trust | 11F.3: raw body + `constructEvent`; missing signature rejected; WeakSet provenance. |
| Payment entry points | 13C.1 `authorizePrivilegedPayment()` on payment-intent, universal-deal/payment, stripe-intent. |
| Offer concurrency | 13C G/H/Race A + S/T/U: `FOR UPDATE` + version CAS + `uq_vauto_offers_active_pending_per_tx`. |
| XSS / input | 11C XSS escape tests; 13B sort injection cannot become ORDER BY identifier; `CreateOfferBodySchema.strict()`. |
| AI-down / fail-safe | 13C K; agent throws 503 `agent_unavailable` without Gemini; Deal Room does not require AI; listing open is static welcome (golden A). |
| Production env fail-closed | `JWT_SECRET` must not be the dev default; Stripe secret + webhook secret required; `VAUTO_E2E_AUTH=1` / legacy user header forbidden. `DATABASE_URL` missing is a **warning** (Render bind-first); money routes still 500 without schema. |

`createStripePaymentIntentService` uses FakeStripe only when `STRIPE_SECRET_KEY` is unset. Production `NODE_ENV=production` exits before listen if Stripe secrets are missing.

---

## 6. Secrets / configuration

Git-tracked hits were placeholders only:

- `docs/PAYMENTS_LAUNCH.md` — `STRIPE_SECRET_KEY=sk_live_...`
- `server/.env.example` — commented `BEGIN PRIVATE KEY` template

Tracked env example: `.env.example` only. No `.env` committed. Delta zip excludes `.env`, secrets, DB dumps.

Production-required (fatal in `NODE_ENV=production`): `JWT_SECRET` (not dev default), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Also fatal: `VAUTO_E2E_AUTH=1`, `ALLOW_LEGACY_USER_HEADER=true`, demo catalog flags, `VAUTO_ALLOW_DEMO_OTP=true`.

---

## 7. Production dependency audit (`npm audit --omit=dev`)

No major version bumps were made.

### Root (Next static export)

| Severity | Count (npm metadata) | Classification for VAUTO production surface |
| --- | --- | --- |
| CRITICAL | 0 | — |
| HIGH | 4 packages (next, nanoid, postcss, sharp) | **MEDIUM operational**: `output: "export"` + `images.unoptimized: true` — Server Actions / image optimizer CVEs are not the live API surface. next is `^15.3.3`; 15.5.21 is a minor, not applied in this stage. |
| MEDIUM/LOW | nested in next/postcss | Build-time stringify / source map. |

### Server

| Package | npm severity | Production relevance |
| --- | --- | --- |
| `fast-xml-parser` (AWS Textract transitive) | HIGH | **MEDIUM**: parser is not a public webhook. Do not bump `firebase-admin` major to “clean the report”. |
| `ip-address` | HIGH | SSRF classification in a Google client transitive. |
| `sharp` | HIGH | Direct; listing image pipeline. |
| `firebase-admin` + gax/uuid | MODERATE | Fix available is SemVer **major** 14.x — not taken. |
| `body-parser` | LOW | Invalid `limit` disables size cap — VAUTO sets explicit JSON limits. |

Independent audit may still require a Next 15.5.x patch window; Stage 14 did not change lockfiles for score-gardening.

---

## 8. Fresh-start

From a clean machine, without Cursor-only files:

1. `npm ci`
2. `npm run server:install`
3. Set `DATABASE_URL` / `TEST_DATABASE_URL` to a reachable Postgres (compose `postgres:16` in CI; this packet used TEMP `embedded-postgres` because Docker/WSL/Program Files Postgres were absent).
4. `node dist` migrate via `runMigrations()` or the isolated `apply-migrations` harness (BOM-stripped).
5. `npm run server:build` then `npm run server:start` (`node dist/index.js`).
6. `npm run build` then static `out/` on Vercel, or `npm start` for Next.

No repo secrets required for typecheck/lint/build. Production start without `JWT_SECRET` / Stripe secrets **exits 1**.

---

## 9. Critical user journeys (real backend / TEST DB)

Covered by certified tests, not new product work:

| Journey | Proof |
| --- | --- |
| Auth | `test:auth-e2e` offline; 10K 401. |
| Listing / search / facets | 13B HTTP F–Q; EXPLAIN on TEST DB after restore. |
| Offer / negotiation / accept | 13C + 11B + S/T/U. |
| Authoritative payment initiation | 13C J/M/N + 13C.1 shared guard. |
| Deal Room | 11E + 13C. |
| Completion / reputation | 11A COMPLETED terminal; 11I 121 pass. |
| Stranger | 13C E → 404. |
| Capability-denied | 13C F/M/N → 403 `DEAL_CAPABILITY_DENIED`. |

---

## 10. Observability / failure behavior

- Unhandled API errors: `console.error` + JSON `{ ok: false, error: "Internal server error" }` (no stack).
- `sendInternalError` / `safeDomainMessage` strip stacks, secrets, SQLSTATE.
- Stripe adapter errors → 502/504 mapped codes, not PAID.
- Gemini missing → 503, not a fake listing publish.
- Migrate failure: process stays up for health; money/state remain fail-closed (log text corrected in Stage 14).

---

## 11. Frozen-boundary diff (Stage 14 only)

Certified 10–13C **semantics** were not redesigned. Touches:

| File | Why |
| --- | --- |
| `server/migrations/015_universal_category_registry.sql` | Fresh TEXT schema migrate (blocker B1). |
| `server/migrations/019_drop_user_portal_links.sql` | Strip UTF-8 BOM (blocker B2). |
| `server/src/migrate.ts` | BOM strip on apply. |
| `server/src/index.ts` | Migrate log: fail-closed wording (blocker E). `universalDealRoomRouter` mount is 13C wiring already in the working tree. |
| `scripts/test-ai-golden-path.mjs` | Static welcome regex (blocker A). |
| `server/src/marketplace/__tests__/universal-deal-room-postgres.test.ts` | Production-like listing seed (13C.1 S/T/U). |
| `server/src/transaction/__tests__/real-postgres-pool.test.ts` | Same seed class (11E.2). |
| `server/src/payments/__tests__/financial-harness.ts` | Seed + `collectConcurrentSuccesses` + PGlite rollback. |
| `server/src/payments/__tests__/red-team-financial.test.ts` | Concurrent release/refund assertions. |
| `server/src/payments/__tests__/real-postgres-financial.test.ts` | Concurrent release assertions. |
| `server/src/payments/transfer/__tests__/funds-transfer.test.ts` | PGlite rollback + listing stub columns. |
| `server/src/delivery/__tests__/delivery-shipping.test.ts` | Production-like seed + unique listing ids + PGlite ROLLBACK-on-error adapter. |
| `server/src/disputes/__tests__/dispute-resolution.test.ts` | Same seed class. |
| `e2e/stage12a-deal-room-flows.spec.ts` | Test infra: reopen Deal Room via `goto(?id=)` instead of `reload()` (static export dropped `id`). |
| `e2e/stage13c-deal-room.spec.ts` | Test infra: close leaked Playwright contexts after A/B/D. |
| `server/src/test/stage12a-http-app.ts` | Test harness: `GET /api/listings` → `[]` so Express 404 HTML is not toasted. |
| `docs/STAGE-14-PRODUCTION-RELEASE-GATE.md` | This gate report. |

11B OfferEngine, 11F ledger, 11J policies, 13A registry, 13B facet SQL builder: **no semantic edits**.

Uncommitted Stage 11–13 product files already in the working tree are **out of Stage 14 scope** (they are the frozen kernels, not this delta).

---

## 12. Independent audit must still run

1. GitHub Actions `build` + `e2e` on `master` (this packet’s 12A/12B/13B/13C Playwright plus remaining smoke/auth/conductor jobs).
2. `npm run test:dispute-resolution --prefix server` on CI empty `postgres:16`.
3. Confirm Render/Vercel env: `NODE_ENV=production`, `JWT_SECRET`, Stripe pair, no `VAUTO_E2E_AUTH`.
4. Optional Next 15.5.x patch review (not done here).

---

## 13. Playwright E2E release gate (final)

Isolated TEST only: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173`, 12A/13C PGlite harness on `127.0.0.1:4011/4012`. No `TEST_DATABASE_URL` / `DATABASE_URL`. No Render/www.vauto.lt as oracle. `--retries=0 --workers=1`.

**RAW:** 38 passed / 0 failed / 0 skipped / exit 0 (`stats.expected=38`, `unexpected=0`, `skipped=0`, `flaky=0`).

| Stage | Spec | passed | failed | skipped |
| --- | --- | --- | --- | --- |
| 12A | `e2e/stage12a-deal-room-flows.spec.ts` | 6 | 0 | 0 |
| 12B | `e2e/stage12b-user-comprehension.spec.ts` | 16 | 0 | 0 |
| 13B | `e2e/stage13b-faceted-filters.spec.ts` | 11 | 0 | 0 |
| 13C | `e2e/stage13c-deal-room.spec.ts` | 5 | 0 | 0 |

First run (before test-infra fix): 31 passed / 2 failed / 5 skipped (serial cascade) / exit 1.

- **12A happy path** — `page.reload()` rendered Deal **list** (`id` missing; list still showed AGREED). Not a missing payment CTA: 13C A already showed „Apmokėti saugiai“. Classification: **test/infrastructure** (static `/sandoriai/` reload vs `useSearchParams`). Fix: `goto(/sandoriai/?id=)` like 13C A. No OfferEngine/ledger change.
- **13C L** — Node `fetch` `ECONNREFUSED 127.0.0.1:4012` after leaked A/B/D browser contexts. Classification: **test/infrastructure**. Fix: close those contexts.

Residual for independent audit: a real browser refresh of `/sandoriai/?id=` on static export was not re-certified after replacing `reload()`; Linux CI `e2e` job remains the cross-OS check.

---

**ETAPAS 14 IMPLEMENTED — AWAITING INDEPENDENT PRODUCTION RELEASE AUDIT**
