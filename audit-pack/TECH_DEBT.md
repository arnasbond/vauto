# TECH_DEBT.md

## Mocks (**MOCK ONLY**)
| Item | Path |
|------|------|
| AI extraction mocks | `src/lib/ai-mocks.ts` |
| Demo listings catalog | `src/data/mockListings.ts`, `lithuania-mock-catalog.ts` |
| Demo payment intents | `src/lib/payments/payment-provider.ts` |
| Client shipping/escrow sim | `src/lib/shipping/shipping-provider.ts`, `src/lib/escrow.ts` |
| Server shipping labels | `server/src/routes/escrow-billing.ts` |
| Synthetic parcel lockers | `server/src/shipping/shipping-routing.ts` |
| Regitra plate demo hash | `server/src/vehicle/plate-lookup.ts` |
| Demo wallet top-up | `server/src/routes/api.ts` + `demo-guards.ts` |
| Investor demo mode | `src/lib/investor-demo.ts` |
| Dashboard mock | `src/lib/dashboard-mock.ts` |
| Wardrobe guest demo | `src/lib/wardrobe-guest-demo.ts` |
| Server demo catalog | `server/src/demo-catalog-*.ts`, `demo-listings.ts` |
| Auth local login | `AuthContext.tsx` `loginLocal()` |

## TODO / FIXME / HACK
**NOT IMPLEMENTED** — no genuine `TODO`/`FIXME`/`HACK` comments in `src/` or `server/src/` (verified grep; only false positives in package-lock).

## Dead code (candidates)
| Item | Notes |
|------|-------|
| `GET /api/search/health` only router | `search.ts` — search moved to `/api/ai/*` |
| `POST /api/search/vision` | Legacy path, superseded by `/api/ai/*` |
| `fcm_tokens` table | Migrated to `user_push_tokens` (019) — verify reads |
| `_later/` directory | iOS TestFlight scripts — not in main build |
| `wallet_transactions.kind=refund` | Schema without route |

## Duplicate logic
| Area | Files |
|------|-------|
| Gemini client + server extract | `gemini-browser.ts` vs `client-api.ts` vs server `ai/*` |
| Listing slug/path | `seo.ts` `listingPath` vs `listingPrettyPath` |
| Auth persistence | `session.ts` + `persistence.ts` + Capacitor Preferences bridge |
| B2B plan naming | `b2b-plans.ts` vs `monetization-engine.ts` tier names |
| Demo catalog gating | `demo-catalog.ts` (client) vs `demo-catalog-env.ts` (server) |
| Admin email constant | `middleware/auth.ts`, `routes/auth.ts`, `repository.ts` |

## Fallback overuse **RISK**
- Triple-tier AI fallback masks production API failures.
- Demo catalog shown in dev by default — prod static build hides listings unless `NEXT_PUBLIC_SHOW_DEMO_CATALOG=true`.
- Regitra demo when API creds missing — users see fake plate data.

## Coupling risks
| Risk | Detail |
|------|--------|
| Monolithic VautoContext | Listings + search + seller flow + auth patch |
| String PKs everywhere | Mobile localStorage ↔ Postgres shape lock-in |
| JSONB embeddings | No pgvector — search logic in app code |
| Vercel rewrites hardcoded to Render URL | `vercel.json` — env change needs redeploy |
| Playwright in API container | Scraping coupled to user-facing API process |

## Missing infrastructure (debt)
- Job queue — **NOT IMPLEMENTED**
- Webhook idempotency store — **NOT IMPLEMENTED**
- Refund/dispute flow — **NOT IMPLEMENTED**
- Real carrier APIs — **NOT IMPLEMENTED**
- Unit/integration tests — **NOT IMPLEMENTED**
- Structured logging / APM — **NOT IMPLEMENTED**
- Feature flags service — env-only

## Version drift
- package.json `1.6.4` vs production references `v1.6.62` in prior session — **RISK** doc/code mismatch.

## Existing audit artifact
`TECH-AUDIT-2026-06-28.txt` in repo root — prior audit (may be stale vs current code).
