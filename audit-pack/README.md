# VAUTO Audit Pack

Technical audit for senior CTO / ChatGPT analysis.  
**Source:** real codebase at `vauto/` (**v1.6.62**).  
**Generated:** 2026-07-02, **refreshed 2026-07-03**.  
**Rule:** facts from code only; secrets omitted.

> **Note:** `VAUTO-AUDIT-PACK.zip` from 2026-07-02 may be **STALE**. Use files in this folder or regenerate ZIP after refresh.

## Contents (19 documents)

| # | File | Description |
|---|------|-------------|
| 1 | PROJECT_TREE.md | Repository tree (depth 4) |
| 2 | PACKAGE_JSON.md | Dependencies, devDependencies, scripts |
| 3 | ARCHITECTURE.md | FE/BE/DB/Auth/AI/Payments/Shipping/Deploy |
| 4 | ENV_MAP.md | All env keys → purpose → criticality |
| 5 | API_MAP.md | All HTTP endpoints + risk levels |
| 6 | DB_SCHEMA.md | Tables, relations, indexes |
| 7 | AI_PIPELINE.md | Providers, fallbacks, timeouts, cost hotspots |
| 8 | PAYMENT_FLOW.md | Stripe, escrow, webhooks, gaps |
| 9 | SHIPPING_FLOW.md | Simulated carrier flow |
| 10 | PORTAL_SYNC.md | Spinta import/sync model |
| 11 | SECURITY_AUDIT.md | Auth, SSRF, webhooks, gaps |
| 12 | PERFORMANCE_AUDIT.md | Slow paths, cold starts |
| 13 | TECH_DEBT.md | Mocks, duplicates, missing infra |
| 14 | DEPLOYMENT.md | Vercel + Render + cron |
| 15 | BUSINESS_LOGIC.md | Monetization, fees, plans |
| 16 | TEST_COVERAGE.md | E2E + gaps |
| 17 | FAILURE_MAP.md | Fail points by subsystem |
| 18 | COST_MAP.md | AI/infra cost drivers |
| 19 | FINAL_SUMMARY.md | Scores, blockers, top 10 fixes |

## Legend
- **NOT IMPLEMENTED** — no code path exists
- **MOCK ONLY** — simulated/demo behavior
- **RISK** — production concern
- **CRITICAL** — blocks or high-severity

## Recommended entry point
Start with **FINAL_SUMMARY.md**, then **SECURITY_AUDIT.md** + **FAILURE_MAP.md**.

## Production endpoints (reference)
- Frontend: https://vauto-chi.vercel.app
- API: https://vauto-api.onrender.com
- Health: GET /api/health

## Zip archive
Run from repo root:
```powershell
Compress-Archive -Path audit-pack\* -DestinationPath audit-pack\VAUTO-AUDIT-PACK.zip -Force
```
