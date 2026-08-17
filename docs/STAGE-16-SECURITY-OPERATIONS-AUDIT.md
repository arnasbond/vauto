# Stage 16 — Production security, operations & release-readiness audit

**Cursor status:** `ETAPAS 16 DELTA COMPLETE — NOT CERTIFIED`

Cursor **does not** grant FULL PASS. Independent auditor decides FULL PASS or REMEDIATION REQUIRED.

Stage 17 was **not** started. `origin/master` was **not** merged. No force-deploy. No production Stripe charge. No production DB restore/reset.

Certified Stage 15 baseline (immutable, not rewritten): `368482d399c090db483131a1d006ba3d6767d74c`

Stage 16 branch: `audit/stage16-security-ops`

---

## 0. Baseline (before Stage 16 commits)

| Check | Value |
| --- | --- |
| `origin/master` | `368482d399c090db483131a1d006ba3d6767d74c` |
| Render `/api/version` `commitSha` | `368482d399c090db483131a1d006ba3d6767d74c` |
| Render `/api/health` | same SHA, `db=connected`, readiness 100 |
| Vercel `www.vauto.lt` | HTTP 200, `Last-Modified: 2026-08-17 19:02:06 GMT`, runtime-config `apiUrl=https://vauto-api.onrender.com`, `conductorEnabled=true` |
| `git status` at branch create | clean except untracked previous Stage 15 NO-GO doc (not committed) |
| `git log -1` | `368482d3 fix(docker): skip out-of-context marketplace sync in API image` |

---

## GO / NO-GO matrix

| Gate | Result | Evidence |
| --- | --- | --- |
| 16A Attack surface + IDOR negatives | **PASS with HIGH finding S16-001 (fixed on this branch)** | HTTP tests `test:stage16-security`; live anonymous probes |
| 16B Financial trust boundary | **PASS (audit only, no rewrite)** | Existing 11F webhook/ledger tests; client cannot set PAID/amount |
| 16C Migrations / schema | **PASS (code + CI from-zero; production READ-ONLY workflow added)** | Chain tests; `scripts/migrate-from-zero.mjs`; `scripts/check-schema-migrations.mjs` |
| 16D Secrets / supply chain | **PASS with documented npm audit High, not auto-blocker** | No live secrets in git; Next/static-export reachability notes |
| 16E HTTP/browser headers | **PASS after fix (not yet on live Stage 15 hosts)** | Production snapshot lacked API XCTO/XFO/CSP; www already HSTS; HTTP 308→HTTPS |
| 16F XSS/injection | **PASS (isolated)** | No `dangerouslySetInnerHTML`; anonymous XSS body → 401; malformed JSON no stack |
| 16G Failure/recovery | **PASS (audit)** | Webhook 400/503 fail-closed; migrate fail keeps HTTP, workers not started; `userIsAdmin` fail-closed on DB error |
| 16H Observability | **PASS after schema field on `/api/health`** | SHA + readiness already live; schema block is Stage 16 |
| 16I Backup/restore | **PASS (procedure only)** | Stage 15 artifact `9296240326`; restore workflow `confirm=RESTORE`, isolated target default; **not executed** |
| 16J Regression | **CI on this branch (do not treat local-only as ship)** | `test:stage16-security` 29/29 local; full CI after push |
| 16K Adversarial review | **PASS with S16-001 closed** | See FINDINGS.md |

---

## Production evidence captured on Stage 15 hosts (pre-Stage-16 deploy)

Anonymous:

- `GET /api/listings/mine` → **401**
- `GET /api/transactions` → **401**
- `GET /api/users/admin-1` → **401**
- `GET /api/admin/platform-flags` → **404** `{error:"Not found"}`
- `POST /api/admin/wallet/credit` → **404**

CORS: request to `/api/health` with `Origin: https://evil.example` had **no** `Access-Control-Allow-Origin`.

`http://www.vauto.lt/` → **308** `https://www.vauto.lt/`.

`www.vauto.lt` already sends `Strict-Transport-Security: max-age=63072000`. API host did **not** send XCTO/XFO/CSP/HSTS (S16-002).

---

## What changed on the Stage 16 branch (not on production until a later authorized deploy)

1. **S16-001 HIGH** — stop default first-name admin elevation (`arnas` / `arnasbond`). `ADMIN_NAMES` is opt-in env only.
2. **S16-002 MEDIUM** — API `securityHeaders` + Vercel `frame-ancestors 'none'` / HSTS / XCTO / XFO / Referrer-Policy. No aggressive `default-src` CSP (would break OAuth/CDN).
3. **S16-003 MEDIUM** — READ-ONLY `getMigrationStatus()` on `/api/health`; `check-schema-migrations.yml`; disposable `migrate-from-zero.mjs`.
4. JWT verify uses `crypto.timingSafeEqual`.
5. `userIsAdmin` returns false if DB lookup throws (fail-closed).
6. HTTP IDOR/authz + migration-chain tests wired into CI.

Payments / ledger / Stripe webhook / transaction SM / disputes / reputation / Omniva business logic were **not** rewritten.

---

## Stop

Stage 17 remains LOCKED. Independent auditor: FULL PASS or REMEDIATION REQUIRED.
