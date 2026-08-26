# VAUTO Stage 20B.1 — MANIFEST

Etapas: **20B.1 — LEGACY DECOUPLING & E2E EVIDENCE HARDENING**
Data: **2026-08-20**
Būsena: **COMPLETE**

---

## 1. Šio dokumento paskirtis

Pilnas Stage 20B.1 pakeitimų ir evidence inventoriaus sąrašas, skirtas
nepriklausomam ChatGPT auditui. Kiekvienas failas turi klasifikaciją pagal
savo vaidmenį etape.

**Klasės:**
- **NEW** — naujai sukurtas VAUTO-native modulis
- **BRIDGE** — compatibility bridge (senoji semantika `@deprecated`, nauja logika nukreipta į VAUTO-native)
- **MIGRATE** — aktyvus failas migruotas prie VAUTO-native semantikos
- **CLEAN** — CSS/kodo cleanup (portal-native paletės → DS2 tokenai)
- **TEST** — testų pataisymai pagal produkto contract
- **DOC** — dokumentacijos korekcija
- **EVIDENCE** — evidence artefaktai (screenshot'ai, logai)

---

## 2. Pakeisti šaltinio failai (source)

### 2.1 NAUJI VAUTO-native moduliai (NEW)

| Failas | Turinys |
|--------|---------|
| `src/lib/vertical-presentation.ts` | `VerticalPresentationId`, `verticalPresentationForCategory`, `verticalExperienceForQuery`, `getVerticalUi`, `verticalPromoteLabels`, `VERTICAL_EXPERIENCES` — visa vertikalių prezentacija su DS 2.0 emerald identitetu |
| `src/lib/vertical-listing-filter.ts` | `categoriesForVertical`, `verticalIdForQuery`, `inferStrictCategory`, `filterListingsForVertical`, `verticalRankedListings`, `sanitizeSearchQuery` |

### 2.2 Compatibility bridges (BRIDGE)

| Failas | Pastaba |
|--------|---------|
| `src/lib/chameleon-themes.ts` | `@deprecated` bridge — re-export iš `vertical-presentation`; `ChameleonThemeId` paliktas frozen moduliams |
| `src/lib/chameleon-portal-ui.ts` | `@deprecated` bridge — portal-native paletės PAŠALINTOS, visos vertikalės emerald |
| `src/lib/portal-experience.ts` | `@deprecated` bridge — re-export `VerticalExperience` |
| `src/lib/portal-listing-filter.ts` | `@deprecated` bridge — re-export iš `vertical-listing-filter` |

### 2.3 Migruoti aktyvūs failai (MIGRATE)

| Failas | Migracija |
|--------|-----------|
| `src/lib/marketplace-view.ts` | `effectiveChameleonCategory` → `effectiveVerticalCategory` |
| `src/lib/smart-promote.ts` | `getPromoteLabelsForCategory` → `verticalPromoteLabels` |
| `src/lib/display-listings-pipeline.ts` | Importai → `vertical-listing-filter` |
| `src/lib/buddy-messages.ts`, `src/lib/smart-broker.ts`, `src/lib/search-conversational-intent.ts`, `src/lib/scoring.ts` | Importai `sanitizeSearchQuery`/`inferStrictCategory` → `vertical-listing-filter` |
| `src/hooks/useActivePortal.ts` | `useActiveVertical` semantika (failas — re-export) |
| `src/components/theme/ChameleonThemeHost.tsx` | `getVerticalPresentation`/`getVerticalUi`/`verticalExperienceForQuery`; `VERTICAL_BODY_CLASSES` |
| `src/components/chameleon/PortalPageChrome.tsx` | `VerticalPageChrome` semantika; `portal-chrome` → `vertical-chrome` |
| `src/components/chameleon/PortalExperienceStrip.tsx` | `VerticalExperienceStrip` semantika |
| `src/app/page.tsx`, `src/app/search/page.tsx` | `<PortalPageChrome>` → `<VerticalPageChrome>` |
| `src/app/discover/page.tsx` | `isFluxHome` → vertical semantika |
| `src/components/ListingGrid.tsx` | `getPortalUi`/`portalExperienceForQuery` → `getVerticalUi`/`verticalExperienceForQuery` |
| `src/components/search/AiCommandBar.tsx` | Tas pats |
| `src/components/dashboard/ProListingCard.tsx` | `categoryToTheme` → DS2 emerald badge |
| `src/components/dashboard/SmartPromoteModal.tsx` | `classicLayout` pašalinta; DS2 emerald |
| `src/components/adaptive-confirmation/ConfirmationShell.tsx` | `getChameleonTheme("flux")` → `getVerticalPresentation("marketplace")` |
| `src/components/vehicle/VehicleListingResults.tsx` | `getPortalUi("autoplius")` → `getVerticalUi("transport")` |
| `src/components/services/ServiceListingResults.tsx` | `getPortalUi("paslaugos")` → `getVerticalUi("services")` |
| `src/components/real-estate/RealEstateListingResults.tsx` | `getPortalUi("aruodas")` → `getVerticalUi("real_estate")` |
| `src/components/general/GeneralListingResults.tsx` | `getPortalUi("skelbiu")` → `getVerticalUi("goods")` |
| `src/components/clothing/ClothingListingResults.tsx` | `getPortalUi("wardrobe")` → `getVerticalUi("fashion")` |
| `src/components/notifications/NotificationBell.tsx` | `useActivePortal` → `useActiveVertical` |
| `src/components/conversational/BuddyQuickActions.tsx` | `classic`/`themeId` props ir portal hex šakos pašalintos |
| `src/components/profile/ProfileSpintaSwitch.tsx` | Fuchsia/violet → DS2 emerald; tekstas be portal imitation |
| `src/lib/__tests__/marketplace-filter-url.test.ts` | Komentarai "chameleon attr" → "category attr" |

### 2.4 CSS cleanup (CLEAN)

| Failas | Turinys |
|--------|---------|
| `src/app/globals.css` | Pašalintos portal-native paletės (autoplius/skelbiu/aruodas/paslaugos/cvbankas), `--chameleon-accent` → DS2 emerald, dead selectors pašalinti, NT wizard spalvos → emerald |
| `src/components/clothing/WardrobeDealStepper.tsx` | `ACCENT #09b1a8` → `var(--vauto-primary, #10b981)` |
| `src/components/clothing/WardrobeCabinetGrid.tsx` | `ACCENT` konstanta pašalinta → DS2 vars |
| `src/components/clothing/VisibilityBooster.tsx` | `ACCENT` → DS2 |
| `src/components/clothing/SecretaryWarmGreeting.tsx` | `ACCENT` → DS2 |
| `src/components/zero-ui/ZeroUiScreenChrome.tsx` | `var(--portal-text)` → `var(--vauto-text-main)` |
| `src/components/zero-ui/ZeroUiListingPreview.tsx` | Tas pats |
| `src/components/seller/ListingPublishSocialOptions.tsx` | Tas pats |

### 2.5 Konfigūracija

| Failas | Pastaba |
|--------|---------|
| `tsconfig.json` | `stage20b`, `out` įtraukti į exclude (neleisti senų snapshot'ų į typecheck scope) |

---

## 3. Pakeisti testai (TEST)

| Failas | Pakeitimas |
|--------|------------|
| `e2e/payment-methods-settings.spec.ts` | 3 testai atnaujinti pagal produkto responsive contract: `[data-app-shell][data-zone=...]` lokatoriai + dialog CTA specifiškumas |
| `e2e/helpers/supervisor-search.ts` | `expectMarketplaceResultSummary` atnaujinta pagal `formatResultsLabel` contract (query-preserving label) |
| `e2e/stage20b1-visual-regression.spec.ts` | **NEW** — targeted visual regression (DISCOVER/DEAL ROOM/AI SEARCH × LIGHT/DARK × 1440/390, 0 overflow assert) |

---

## 4. Dokumentacija (DOC)

| Failas | Pastaba |
|--------|---------|
| `docs/visual-drift-register-20B.md` | L-1 klaidingas teiginys pataisytas: portal imitation NĖRA frozen zones → deprecated legacy |
| `docs/audit/stage20b1/LEGACY-DEPENDENCY-MAP.md` | Phase A inventory (anksčiau sukurta, šio etapo dokumentas) |
| `docs/audit/stage20b1/DECOUPLING-REPORT.md` | Phase B–D ataskaita |
| `docs/audit/stage20b1/E2E-FAILURE-CLASSIFICATION.md` | Visų failure'ų klasifikacija su evidence |
| `docs/audit/stage20b1/VISUAL-REGRESSION-MATRIX.md` | Design regression matrica |
| `docs/audit/stage20b1/FINDINGS-20B1.md` | Radiniai + known debt |
| `docs/audit/stage20b1/STATUS-20B1.md` | Statusas + exit criteria |
| `docs/audit/stage20b1/MANIFEST-20B1.md` | Šis failas |

---

## 5. Evidence artefaktai (EVIDENCE)

### 5.1 Testų logai (repo root)

| Failas | Turinys |
|--------|---------|
| `stage20b1-build.log` | `npm run build` PASS |
| `stage20b1-e2e-build.log` | `npm run build:e2e` PASS |
| `stage20b1-e2e-search.log` / `-r2.log` | stage183 prieš (fail) / po (13/13 PASS) |
| `stage20b1-e2e-payments.log` / `-r2.log` | payments prieš (3 fail) / po (8/8 PASS) |
| `stage20b1-e2e-smoke.log` / `-r2.log` | smoke prieš (2 fail) / po (22/22 PASS) |
| `stage20b1-e2e-ui.log` | UI snapshots (6/6 PASS) |
| `stage20b1-e2e-stage12.log` / `stage20b1-e2e-12ab-r2.log` | Stage 12/13 pirmas run (fail) / rerun (PASS) |
| `stage20b1-e2e-stage13.log` / `stage20b1-e2e-13c-r2.log` | Stage 13B/C rerun'ai PASS |
| `stage20b1-e2e-stage17.log` | Stage 17/18/AI rinkiniai (69 PASS, 4 fail — klasifikuoti) |
| `stage20b1-e2e-182-r2.log` | stage182 zero-results solo PASS |
| `stage20b1-e2e-profile-r2.log` | profile desktop solo PASS |
| `stage20b1-e2e-search-r3.log` | stage183 deterministinis PASS |
| `stage20b1-e2e-ui-r3.log` | home/profile UI solo PASS |
| `stage20b1-e2e-full-r2.log` | Pilnas `e2e-legacy` run (172 pass / 5 fail / 3 skip) |
| `stage20b1-visual-regression.log` / `-r2.log` / `-r3.log` | Visual regression (pirmas run fail → 12/12 PASS) |

### 5.2 Screenshot'ai

| Kelias | Turinys |
|--------|---------|
| `docs/ui-stage18/*.png` (20 failų) | HOME/SEARCH/LISTING/RE — LIGHT/DARK × 390/1440/1920 |
| `docs/audit/stage20b1/visual/*.png` (12 failų) | DISCOVER/DEAL ROOM(/sandoriai)/AI SEARCH(/search) — LIGHT/DARK × 1440/390 |
| `docs/ui-*` rinkiniai (business/control-center/detail/final/home/market/nav/profile) | UI snapshot evidence (regeneruoti) |

### 5.3 Dependency evidence

| Failas | Turinys |
|--------|---------|
| `docs/audit/stage20b1/LEGACY-DEPENDENCY-MAP.md` | Prieš/po dependency žemėlapis su klasifikacija |
| Šio etapo source diff | Žr. §6 |

---

## 6. Diff / patch

Švarus Stage 20B.1-only patch pateikiamas kaip atskiras artefaktas:

| Artefaktas | Kelias |
|------------|--------|
| **Stage 20B.1-only patch (UTF-8, A klasė)** | `stage20b1/stage20b1-only.patch` |
| Patch generavimo skriptas | `stage20b1/gen-stage20b1-patch-git.py` |
| Rekonstruotas pre-20B.1 baseline (A klasės before-source) | `stage20b1/baseline-tree.zip` (NESTED ZIP, 128 failai) |
| Failų ownership klasifikacija (A/B/C) | `docs/audit/stage20b1/STAGE-20B1-FILE-OWNERSHIP.md` |
| MANIFEST vs snapshot verifikacijos skriptas | `stage20b1/verify-20b1.1.ps1` |

Patch apima **tik A klasės failus (46)**. Pre-20B.1 baseline rekonstruotas iš
`vauto-20b-delta.zip` → `stage20b/source/` (12 failų) ir `git HEAD d4b7b41a`
(30 failų); 4 failai yra naujai sukurti (NEW). Patch validacija:

```text
git apply --check (baseline) : PASS
Roundtrip (apply -> compare) : 46/46 files, 0 mismatches vs live
```

> Pastaba: repo neturi atskiro 20B.1 branch'o — pakeitimai yra darbo kopijoje
> virš Stage 20B. `stage20b1-only.patch` yra izoliuotas A klasės pakeitimų
> diff (be ankstesnių working-tree pakeitimų).

---

## 7. Pakavimas

| Artefaktas | Kelias |
|------------|--------|
| Audit docs | `docs/audit/stage20b1/` (įsk. `STAGE-20B1-FILE-OWNERSHIP.md`) |
| Source snapshot (A klasė, 46 failai, 1:1 su MANIFEST) — **NESTED ZIP** | `docs/audit/stage20b1/source-snapshot.zip` |
| Stage 20B.1-only patch (UTF-8) | `stage20b1/stage20b1-only.patch` |
| Rekonstruotas baseline (128 failai) — **NESTED ZIP** | `stage20b1/baseline-tree.zip` |
| Visual evidence | `docs/audit/stage20b1/visual/` + `docs/ui-stage18/` |
| Testų logai | `logs/` (repo root: `stage20b1-*.log`) |
| Verifier #1 (MANIFEST ↔ snapshot.zip) | `stage20b1/verify-manifest-zip-20b1.1.py` |
| Verifier #2 (provenance + roundtrip) | `stage20b1/verify-package-final.py` |

> **Svarbu (R4):** `source-snapshot` ir `baseline-tree` pateikiami kaip **nested ZIP failai** (ne katalogai), kad root `tsconfig.json` / `next build` jų neįtrauktų kaip aktyvaus source tree. Tai sąmoningas audit-packaging sprendimas. A klasės provenance (MANIFEST ↔ patch ↔ after-source ↔ baseline) yra nepriklausomai patikrinama abiem Python verifieriais iš fresh-extracted R4.
