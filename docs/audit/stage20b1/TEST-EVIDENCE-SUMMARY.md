# Stage 20B.1 — TEST EVIDENCE SUMMARY

Šis failas apibendrina visus testų run'us ir jų log failus. Pilni logai
pateikiami delta pakete (repo root `stage20b1-*.log`).

## Gates

| Gate | Komanda | Rezultatas | Logas |
|------|---------|-----------|-------|
| Build | `npm run build` | PASS (85 puslapiai) | `stage20b1-build.log` |
| E2E build | `npm run build:e2e` (NEXT_PUBLIC_SHOW_DEMO_CATALOG=true) | PASS | `stage20b1-e2e-build.log` |
| Typecheck | `npx tsc --noEmit` | PASS | (session) |
| Lint | `npm run lint` | PASS (4 pre-existing warnings) | (session) |
| Unit | `node --import tsx --test "src/**/__tests__/*.test.ts"` | 66/66 PASS | (session) |

## Targeted E2E (deterministiniai rerun'ai)

| Rinkinys | Rezultatas | Logas |
|----------|-----------|-------|
| stage183-search-state (po build:e2e) | 13/13 PASS | `stage20b1-e2e-search-r2.log` |
| stage183-search-state (solo, 1 worker) | 13/13 PASS | `stage20b1-e2e-search-r3.log` |
| payment-methods-settings (po fix) | 8/8 PASS | `stage20b1-e2e-payments-r2.log` |
| smoke (po fix) | 22/22 PASS | `stage20b1-e2e-smoke-r2.log` |
| UI snapshots (detail/home/market) | 6/6 PASS | `stage20b1-e2e-ui.log` |
| stage13b + stage13c (šviežias harness) | 11/11 + 5/5 PASS | `stage20b1-e2e-stage13.log`, `stage20b1-e2e-13c-r2.log` |
| stage12a + stage12b | 22/22 PASS | `stage20b1-e2e-12ab-r2.log` |
| Stage 17/17.1/18/18.2/18.3 + AI + app-shell + admin + prepublish | 69 PASS / 4 fail (klasifikuoti) | `stage20b1-e2e-stage17.log` |
| stage182 zero-results (solo) | PASS (2.3s) | `stage20b1-e2e-182-r2.log` |
| profile desktop (solo) | PASS (2.2s) | `stage20b1-e2e-profile-r2.log` |
| home/profile UI (solo) | 6/6 PASS | `stage20b1-e2e-ui-r3.log` |
| 20B.1 targeted visual regression | 12/12 PASS (0 overflow) | `stage20b1-visual-regression-r3.log` |

## Pilnas e2e-legacy run (1 worker)

| Metrika | Reikšmė |
|---------|---------|
| PASS | 172 |
| FAIL | 5 (3× ops-guard ENVIRONMENT production 429; 2× screenshot file-lock ENVIRONMENT) |
| SKIP | 3 (auth live, prepublish-live, prod-real-journey — ne local-contract) |
| Logas | `stage20b1-e2e-full-r2.log` |

Visų 5 failure'ų deterministiniai rerun'ai pavieniui — PASS (žr.
`E2E-FAILURE-CLASSIFICATION.md`).

## Ankstesni Stage 20B non-pass testai

| Testas | Prieš | Po | Root cause klasė |
|--------|-------|----|------------------|
| smoke volvo v70 / search submit | 2 fail | 22/22 PASS | TEST — stale results-label assertion |
| stage183-search-state | 9 fail | 13/13 PASS | FIXTURE+SERVER — neteisingas build (demo catalog) |
| payment-methods-settings | 3 fail | 8/8 PASS | TEST — responsive contract + ambiguūs lokatoriai |
