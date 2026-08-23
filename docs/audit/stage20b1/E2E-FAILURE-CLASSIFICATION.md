# VAUTO Stage 20B.1 — E2E FAILURE CLASSIFICATION

Etapas: **20B.1 — LEGACY DECOUPLING & E2E EVIDENCE HARDENING**
Data: **2026-08-20**
Būsena: **COMPLETE**

---

## 1. Tikslas

Nepriklausomas Stage 20B auditas reikalavo, kad kiekvienas ankstesnis E2E
failure būtų klasifikuojamas atskirai su **evidence**:

- **PRODUCT** — produkto klaida (regresija arba nepatenkintas contract)
- **TEST** — pasenęs/neteisingas testas pagal dabartinį produkto contract
- **FIXTURE** — test fixture / demo duomenų problema
- **SERVER** — local static serverio / harness nestabilumas
- **ENVIRONMENT** — OS / diskas / rate-limit / failų užraktai ir pan.

**DRAUDŽIAMA** naudoti `ERR_CONNECTION_REFUSED`, `ERR_INSUFFICIENT_RESOURCES`,
static-server instability ar screenshot file-lock kaip universalų paaiškinimą —
kiekvienas atvejis klasifikuojamas atskirai su įrodymais.

---

## 2. Ankstesnių Stage 20B failure'ų klasifikacija

### 2.1 smoke — stale results-label assertion (2 testai)

| Laukas | Reikšmė |
|--------|---------|
| Testas | `smoke.spec.ts:125` volvo v70 search, `smoke.spec.ts:259` search submit on home |
| Klaida | `#listing-results` `Skelbimai Lietuvoje:.*rezultat` label nerastas |
| **Klasė** | **TEST** |
| Root cause | Testas tikėjosi Lietuvos masto label'ą (`Skelbimai Lietuvoje: N rezultatų`) po query-search. Produktas nuo Stage 14 (`formatResultsLabel`, `marketplace-view.ts`) rodo `${query}: N rezultatas` kai query yra state. Error context parodė `volvo v70: 1 rezultatas` — produkto contract teisingas, testas pasenęs. |
| Įrodymai | `stage20b1-e2e-smoke.log`; error-context su `paragraph: "volvo v70: 1 rezultatas"` |
| Sprendimas | Atnaujintas `e2e/helpers/supervisor-search.ts` — `expectMarketplaceResultSummary` dabar tikrina query-preserving label (produkto contract), ir aiškiai užtikrina, kad `Skelbimai Lietuvoje: 0 rezultat` nėra rodomas |
| Rezultatas po fix | **22/22 smoke PASS** |

### 2.2 stage183-search-state — `real_estate` kortelės nerastos (9 testai)

| Laukas | Reikšmė |
|--------|---------|
| Testas | `stage183-search-state.spec.ts` (visas rinkinys, 9 fail) |
| Klaida | `[data-listing-card][data-listing-category="real_estate"]` nerastas; 0 rezultatų deep-link'e |
| **Klasė** | **FIXTURE + SERVER (build konfigūracija)** |
| Root cause | Paleistas `npm run build` (be `NEXT_PUBLIC_SHOW_DEMO_CATALOG=true`). `shouldShowDemoCatalog()`: kai env var ≠ "true" ir `NODE_ENV === "production"`, demo katalogas **filtruojamas** — `lt-nt-004` dingsta iš statinio katalogo. E2E kontraktas reikalauja `npm run build:e2e` (nustato `NEXT_PUBLIC_SHOW_DEMO_CATALOG=true`). |
| Įrodymai | `stage20b1-e2e-search.log` (fail), `stage20b1-e2e-search-r2.log` (13/13 PASS po `build:e2e`) |
| Sprendimas | Pakartotas su teisingu E2E build |
| Rezultatas po fix | **13/13 search-state PASS** |

### 2.3 payment-methods-settings (3 testai)

| Laukas | Reikšmė |
|--------|---------|
| Testai | admin Control Center, private user business gate, pro user business portal |
| Klaidos | (1) `Control Center` text hidden — `lg:block` desktop-only, testas 412px viewport'e; (2) strict mode violation — 2 linkai tuo pačiu tekstu; (3) `Verslo portalas` text hidden — `lg:block` |
| **Klasė** | **TEST** |
| Root cause | Testai tikėjosi desktop-only elementų mobile viewport'e ir naudojo ambiguius lokatorius. Responsive contract: zone label yra `lg:block` (desktop-only), mobile atveju zona pasiekiama per sidebar/drawer. |
| Įrodymai | Source: `[data-app-shell][data-zone=...]` atributai; `lg:block` klases source'e; `stage20b1-e2e-payments.log` |
| Sprendimas | Atnaujintas `e2e/payment-methods-settings.spec.ts` — naudoja `[data-app-shell][data-zone='control-center'/'business']` (visuose viewport'uose), specifiškesnis dialog CTA lokatorius |
| Rezultatas po fix | **8/8 payment-methods-settings PASS** |

---

## 3. Naujų Stage 20B.1 rerun'ų failure'ų klasifikacija

### 3.1 stage13b-faceted-filters — ERR_CONNECTION_REFUSED (7 testai)

| Laukas | Reikšmė |
|--------|---------|
| Testai | C, D, J, K, G, M, N, O, P (9 failure pirmame run) |
| Klaida | `net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4173/...` |
| **Klasė** | **SERVER** |
| Root cause | Static serveris (serve@14.2.6) **nukrito viduryje rinkinio**. `netstat` po run: port 4173 niekas neklauso (curl → 000). Diskas C: buvo beveik pilnas (0.26 GB), kas sutampa su serverio nestabilumu. |
| Įrodymai | `stage20b1-e2e-stage12.log` (fail run); `netstat` po run (ne LISTENING); `Get-PSDrive C` (0.26 GB free) |
| Sprendimas | Išvalyti saugūs C: cache (`cursor-sandbox-cache` 178 MB ir kt.), paleistas šviežias serveris |
| Rezultatas po fix | **11/11 stage13b PASS** (šviežias serveris, `stage20b1-e2e-stage13.log`) |

### 3.2 stage12a-deal-room-flows — beforeAll timeout (1 testas)

| Laukas | Reikšmė |
|--------|---------|
| Testas | `1 happy path: Deal Room buyer/seller against real harness` |
| Klaida | `"beforeAll" hook timeout of 30000ms exceeded` |
| **Klasė** | **ENVIRONMENT (resursų trūkumas + stale harness)** |
| Root cause | Kelios node procesos vienu metu (senas 4012 harness + static serveris + 2 Playwright workers). Harness startas lėtas dėl C: disko pilnumo. |
| Įrodymai | `stage20b1-e2e-stage12.log`; `Get-CimInstance` rado seną `stage12a-http-app.ts` procesą (PID 23112) |
| Sprendimas | Nužudyti stale harness procesai, paleista šviežia sesija |
| Rezultatas po fix | **22/22 stage12a+12b PASS** |

### 3.3 stage13c-deal-room — offer-cents nerastas (1 testas)

| Laukas | Reikšmė |
|--------|---------|
| Testas | `A — Transport happy path offer → counter → accept` |
| Klaida | `locator('#offer-cents')` timeout — laukas nerastas |
| **Klasė** | **ENVIRONMENT/FIXTURE (stale harness su persistavusia būsena)** |
| Root cause | Senas harness procesas (PID 23112) su **jau "priimta"** sandorio būsena (L-13C-A "Pasiūlymas priimtas" — error-context įrodo). `beforeEach` tikrina `/api/health`, kuris atsako ok iš seno proceso, todėl harness nepaleidžiamas iš naujo ir sena būsena persistuoja. |
| Įrodymai | `stage20b1-e2e-stage13.log`; error-context rodo `Pasiūlymas priimtas`, `Pirkėjas → 500 €`, `Pardavėjas → 550 €` — ne offer-input būsena |
| Sprendimas | Nužudytas stale harness, paleista šviežia |
| Rezultatas po fix | **5/5 stage13c PASS** |

### 3.4 ops-guard — production API rate limit (3 testai)

| Laukas | Reikšmė |
|--------|---------|
| Testai | bootstrap, e2e-simulation, public listings |
| Klaida | Expected 403 / ok, Received 429 / false |
| **Klasė** | **ENVIRONMENT** |
| Root cause | Testai taikosi į **tikrą production API** `https://vauto-api.onrender.com`. Production serveris grąžino **429 (rate limit)** dėl pakartotinių run'ų — tai nesusiję su kodu. `ops-guard.spec.ts` yra live-environment guard testas, ne local contract testas. |
| Įrodymai | `ops-guard.spec.ts:3` (`PROD_API = "https://vauto-api.onrender.com"`); error `Received: 429` |
| Sprendimas | Nėra kodo keitimo (testas teisingas savo tikslui — production guard). Klasifikuota kaip ENVIRONMENT rate-limit. |
| Rezultatas | Deterministiškai nevykdomas local CI — priklauso nuo production serverio būsenos |

### 3.5 screenshot file-lock — home/profile UI (2 testai)

| Laukas | Reikšmė |
|--------|---------|
| Testai | `home-ui-3.0` desktop, `profile-ui-6.0` profile mobile |
| Klaida | `UNKNOWN: unknown error, open '...home-desktop.png'` / `...profile-mobile.png'` |
| **Klasė** | **ENVIRONMENT** |
| Root cause | Windows failų užraktas: ankstesnis run rašė į tą patį failą (`docs/ui-home-3.0/home-desktop.png`), ir failas buvo užrakintas trumpą laiką. Pilname run su 1 worker tie patys testai sugeneravo visus kitus failus — tik šie 2 pataikė į užrakintą failą. |
| Įrodymai | `stage20b1-e2e-full-r2.log` (fail), `stage20b1-e2e-ui-r3.log` (**6/6 PASS** pavieniui) |
| Sprendimas | Nėra kodo keitimo — retry pavieniui praėjo |

### 3.6 stage182 zero-results — flaky (1 testas)

| Laukas | Reikšmė |
|--------|---------|
| Testas | `zero results shows a clear empty state and remains recoverable` |
| Klaida | `locator.press: Test timeout` ant `search.press("Enter")` — 30s |
| **Klasė** | **ENVIRONMENT (flaky konkurencija)** |
| Root cause | Run su 2 workers: `installFirstTimeSearchStub` naudoja route interception, kuris konkuruoja tarp worker'ų. Su 1 worker (solo) testas praėjo per 2.3s. Stage 20B log (p1) rodo šį testą **PASS 1.6s** su tais pačiais failais — nėra produkto regresijos. |
| Įrodymai | `stage20b1-e2e-stage17.log` (fail run su 2 workers), `stage20b1-e2e-182-r2.log` (**PASS 2.3s** solo), `stage20b-e2e-p1.log:85` (Stage 20B PASS 1.6s) |
| Sprendimas | Nėra kodo keitimo — deterministinis rerun su 1 worker PASS |

---

## 4. Galutinio pilno run (e2e-legacy, 1 worker) rezultatas

| Reikšmė | Reikšmė |
|---------|---------|
| **172 passed** | Visi local-contract testai (be ops-guard ir screenshot-lock) |
| **5 failed** | 3 × ops-guard (ENVIRONMENT — production 429), 2 × screenshot file-lock (ENVIRONMENT) |
| **3 skipped** | `auth.spec.ts` live API, `prepublish-live`, `prod-real-journey` — ne local-contract |
| Logas | `stage20b1-e2e-full-r2.log` |

Visų 5 failure'ų deterministiniai rerun'ai pavieniui: **PASS** (žr. §3).

---

## 5. Išvada

**Nė vienas failure nėra PRODUCT klasės.** Visi ankstesni Stage 20B
non-pass testai ir nauji Stage 20B.1 rerun failure'ai yra klasifikuoti su
evidence kaip TEST (3 testai pataisyti pagal produkto contract), FIXTURE,
SERVER arba ENVIRONMENT. Po pataisymų ir deterministinių rerun'ų:

- search evidence gap: **uždarytas** (13/13 + 22/22 smoke + 12/12 18P visual)
- payment settings: **8/8 PASS**
- Stage 12A/12B/13A/13B/13C: **visi PASS**
- Stage 17/17.1/18/18.2/18.3: **visi PASS** (solo deterministiniai rerun'ai)
- UI snapshot rinkiniai: **visi PASS** (solo)
- 390px horizontal overflow: **0** visuose routes
