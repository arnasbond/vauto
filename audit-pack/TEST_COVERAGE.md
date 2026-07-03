# TEST_COVERAGE.md
As of audit date. Source: `e2e/`, `scripts/*smoke*`, `server/src/test/`.

## E2E coverage (Playwright)
**File:** `e2e/smoke.spec.ts` — **21 tests** (single spec).

| Area | Covered |
|------|---------|
| Home hero / search | Yes |
| Guest gates (profile, chats, add) | Yes |
| Listing detail page | Yes (slug-based) |
| Install page | Yes |
| Signed-in add/upload UI | Yes (seeded auth) |
| Search results + view modes (list/grid/map) | Yes |
| Category filter bar | Yes (local; flaky prod without search context) |
| Pro business dashboard | Yes (seeded) |
| Admin moderation UI | Yes (seeded) |
| Connection status settings | Yes |
| Mobile bottom nav | Yes |
| Runtime config JSON | Yes |
| Discover page | Yes |

**Helpers:** `e2e/helpers/seed-demo-user.ts` — localStorage auth seed.

**Configs:**
- Local: `playwright.config.ts` — `http-server out :4173`, Chrome channel, 60s timeout.
- Prod: `playwright.prod.config.ts` — `vauto-chi.vercel.app`, 60s timeout.

**Latest results (session):**
- Local: **21/21 pass** (with `NEXT_PUBLIC_SHOW_DEMO_CATALOG=true` build).
- Production: **18/21 pass** — failures: listing detail (no demo catalog on prod), category filter (no results region), map text assertion.

## Integration coverage
| Script | Purpose |
|--------|---------|
| `scripts/validation-smoke.mjs` | Server validation smoke |
| `scripts/api-listing-smoke.mjs` | API listing CRUD smoke |
| `scripts/verify-health.mjs` | `/api/health` + readiness |
| `scripts/validate-catalogs.mjs` | Mock catalog integrity |
| `scripts/validate-fast-search.mjs` | Search performance |
| `server e2e:simulate` | `vauto-e2e-simulation.ts` buyer/seller sim |

## Unit tests
**NOT IMPLEMENTED** — no `*.test.ts`, `*.spec.ts` in `src/` or `server/src/`.

## Critical missing tests
| Gap | Risk |
|-----|------|
| Stripe webhook handling | CRIT — payment correctness |
| Escrow capture/refund | CRIT — money flow |
| Auth JWT edge cases | HIGH |
| AI endpoint contract tests | HIGH — regression on Gemini schema |
| Portal scraper | HIGH — Playwright brittle |
| Rate limit behavior | MED |
| SSRF on import-url | HIGH |
| Shipping label flow | MED (mock but user-facing) |
| Referral reward application | MED |
| Multi-instance portal sync race | MED |

## Flaky tests
| Test | Cause |
|------|-------|
| Production timeouts (old 30s config) | Render cold start |
| `marketplace sticky filter bar` on prod | No `#listing-results` without prior search |
| `listing detail` on prod | Prod build hides demo listings |
| `map view renders listings` on prod | Zero geo results without demo catalog |
| Tests using `networkidle` | Long-lived connections on production home |

## CI integration
`test:e2e` runs full build + Playwright — **not evidenced as running in GitHub Actions** from package.json alone.

## Security audit script
`npm run audit:security` → `scripts/audit-security.mjs` (exists; not run in this audit).
