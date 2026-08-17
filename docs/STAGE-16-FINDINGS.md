# Stage 16 FINDINGS

RAW secret values are not included.

## S16-001 — HIGH — default name-based super_admin elevation

- **Status:** FIXED on `audit/stage16-security-ops` (not yet on production SHA `368482d3`)
- **Root cause:** `server/src/lib/admin-allowlist.ts` shipped `DEFAULT_ADMIN_NAMES = ["arnas","arnasbond"]`. `shouldElevateToSuperAdmin` treated the first token of a display name as an operator. A Google user whose given name is "Arnas" could be elevated. `userIsAdmin` used the same helper, so this was not UI-only.
- **Affected files:** `server/src/lib/admin-allowlist.ts`, `server/src/routes/auth.ts`, `server/src/middleware/auth.ts`
- **Reproduction:** unit test `server/src/lib/__tests__/admin-allowlist.test.ts` — `shouldElevateToSuperAdmin({ firstName: "Arnas", email: "buyer@example.com" })` is **false** unless `ADMIN_NAMES` is set.
- **Fix:** remove compiled-in names. Name elevation only if `ADMIN_NAMES` is explicitly configured. Email allowlist + `ADMIN_PHONE` unchanged.
- **Regression:** `npm run test:stage16-security --prefix server`

## S16-002 — MEDIUM — missing browser security headers on API (and incomplete on Vercel)

- **Status:** FIXED on this branch; **live Stage 15 API still missing headers** (expected until authorized deploy)
- **Root cause:** Express had CORS only; no helmet/HSTS/XCTO/XFO/CSP. Vercel `vercel.json` had cache headers only. Live `www.vauto.lt` already had HSTS from the edge; live API did not.
- **RAW production (Stage 15 SHA):** API `/api/health` — HSTS/XCTO/XFO/CSP empty. `www.vauto.lt` — `Strict-Transport-Security: max-age=63072000`. `http://www.vauto.lt/` → 308 HTTPS.
- **Fix:** `server/src/middleware/security-headers.ts`; `vercel.json` site-wide XCTO/XFO/Referrer-Policy/`frame-ancestors 'none'`/HSTS. No `default-src` CSP (OAuth/Cloudinary).
- **Regression:** `server/src/middleware/__tests__/security-headers.test.ts`

## S16-003 — MEDIUM — no production-readable migration status (Stage 15 evidence gap)

- **Status:** FIXED on this branch (health field + READ-ONLY workflow). Live `/api/health` on `368482d3` has **no** `schema` block yet.
- **Root cause:** `schema_migrations` existed but was not exposed; Render logs API returned `400 ownerId is required`.
- **Fix:** `getMigrationStatus()`; `/api/health.schema`; `scripts/check-schema-migrations.mjs`; workflow `check-schema-migrations.yml`; CI `scripts/migrate-from-zero.mjs` on disposable DB.
- **Constraint honored:** no production writes, no DROP, no restore.

## S16-004 — LOW — npm audit High on Next.js / postcss / sharp / nanoid

- **Status:** REGISTERED, not treated as automatic release blocker
- **Reachability:** production frontend is `output: "export"` static files on Vercel. Next Server Actions, Image Optimization API, Edge runtime, and rewrite-hostname SSRF in a Next server are **not** the production serving path. `nanoid` High is in the frontend tree; not a payment/auth primitive.
- **Action:** do not `npm audit fix` in Stage 16 (would churn lockfile / Next minor without a product security proof). Track for a later dependency window.

## S16-005 — LOW — stateless JWT logout

- **Status:** REGISTERED
- `POST /api/auth/logout` is a client-side discard. No server revoke list. Standard for this JWT design. No product change.

## Closed adversarial paths (evidence)

| Path | Why closed |
| --- | --- |
| Anonymous → listings/mine, transactions, private user | 401 (live + tests) |
| Anonymous/non-admin → admin | opaque 404 (live + tests) |
| Buyer A → user B GET/PUT | 403 (HTTP tests on real `apiRouter`) |
| Seller → refund-to-buyer | 403 admin gate (`funds-transfer.ts`); DB errors fail-closed |
| Client sets PAID/amount/ledger | Zod forbidden fields; webhook signature required (11F tests, not rewritten) |
| Invalid Stripe signature | 400, no DB write (existing `stripe-webhooks.test.ts`) |
| XSS listing POST anonymous | 401 |
| Legacy `X-User-Id` | 401 unless `ALLOW_LEGACY_USER_HEADER` (forbidden in prod env-check) |
| JWT alg=none / tampered role | `verifyAccessToken` HMAC + timingSafeEqual |
