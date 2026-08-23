# STAGE 20B.1 — FILE OWNERSHIP

Etapas: **20B.1.1 — AUDIT PACKAGE COMPLETENESS CLOSURE**
Statusas: **NO PRODUCTION CHANGE — AUDIT PACKAGING ONLY**
Data: **2026-08-20**

---

## 1. Tikslas

Klasifikuoti **kiekvieną pakeistą working-tree failą** pagal priklausomybę:

- **A — STAGE 20B.1**: failai, pakeisti šio etapo (legacy decoupling, E2E evidence hardening).
- **B — PRE-EXISTING BEFORE 20B.1**: failai, pakeisti ankstesnių etapų (20A/20A.2/20B) — egzistavo dar prieš 20B.1.
- **C — EVIDENCE/DOC ONLY**: dokumentacija, logai, screenshot'ai, audit artefaktai.

Šio dokumento pagrindu sugeneruotas `stage20b1/stage20b1-only.patch` apima **tik A klasę**.

---

## 2. Baseline rekonstrukcija (A klasės patch šaltinis)

Repo neturi atskiro 20B.1 branch'o — paskutinis commit yra `d4b7b41a`
(2026-08-17, Stage 14 era). Visa 20A/20B/20B.1 yra uncommitted working tree.

Pre-20B.1 baseline buvo rekonstruotas iš dviejų patikimų šaltinių:

| Šaltinis | Aprašymas | Naudotas kiek |
|----------|-----------|---------------|
| `vauto-20b-delta.zip` → `stage20b/source/` (98 failai) | Oficialus Stage 20B pabaigos source snapshot (sukurtas 20B pakuotės metu) | **12 failų** |
| `git HEAD d4b7b41a` | Stage 14 certified commit — failams, kurių 20B NEpakeitė | **30 failų** |
| — | Failai, kurių nėra nei HEAD, nei 20B zip (naujai sukurti) | **4 failai** (NEW) |

**Kiekvieno failo baseline šaltinis nurodytas §3 lentelėje.**

---

## 3. A klasė — STAGE 20B.1 pakeisti failai (46)

Klasifikacijos žymės MANIFEST-20B1: **NEW / BRIDGE / MIGRATE / CLEAN / TEST / CONFIG**.

| # | Failas | MANIFEST klasė | Baseline šaltinis |
|---|--------|----------------|-------------------|
| 1 | `src/lib/vertical-presentation.ts` | NEW | NEW (sukurtas 20B.1) |
| 2 | `src/lib/vertical-listing-filter.ts` | NEW | NEW (sukurtas 20B.1) |
| 3 | `src/lib/chameleon-themes.ts` | BRIDGE | HEAD |
| 4 | `src/lib/chameleon-portal-ui.ts` | BRIDGE | ZIP-20B |
| 5 | `src/lib/portal-experience.ts` | BRIDGE | ZIP-20B |
| 6 | `src/lib/portal-listing-filter.ts` | BRIDGE | HEAD |
| 7 | `src/lib/marketplace-view.ts` | MIGRATE | HEAD |
| 8 | `src/lib/smart-promote.ts` | MIGRATE | HEAD |
| 9 | `src/lib/display-listings-pipeline.ts` | MIGRATE | ZIP-20B |
| 10 | `src/lib/buddy-messages.ts` | MIGRATE | HEAD |
| 11 | `src/lib/smart-broker.ts` | MIGRATE | HEAD |
| 12 | `src/lib/search-conversational-intent.ts` | MIGRATE | HEAD |
| 13 | `src/lib/scoring.ts` | MIGRATE | HEAD |
| 14 | `src/hooks/useActivePortal.ts` | MIGRATE | HEAD |
| 15 | `src/components/theme/ChameleonThemeHost.tsx` | MIGRATE | HEAD |
| 16 | `src/components/chameleon/PortalPageChrome.tsx` | MIGRATE | HEAD |
| 17 | `src/components/chameleon/PortalExperienceStrip.tsx` | MIGRATE | HEAD |
| 18 | `src/app/page.tsx` | MIGRATE | HEAD |
| 19 | `src/app/search/page.tsx` | MIGRATE | HEAD |
| 20 | `src/app/discover/page.tsx` | MIGRATE | ZIP-20B |
| 21 | `src/components/ListingGrid.tsx` | MIGRATE | ZIP-20B |
| 22 | `src/components/search/AiCommandBar.tsx` | MIGRATE | ZIP-20B |
| 23 | `src/components/dashboard/ProListingCard.tsx` | MIGRATE | ZIP-20B |
| 24 | `src/components/dashboard/SmartPromoteModal.tsx` | MIGRATE | HEAD |
| 25 | `src/components/adaptive-confirmation/ConfirmationShell.tsx` | MIGRATE | HEAD |
| 26 | `src/components/vehicle/VehicleListingResults.tsx` | MIGRATE | HEAD |
| 27 | `src/components/services/ServiceListingResults.tsx` | MIGRATE | HEAD |
| 28 | `src/components/real-estate/RealEstateListingResults.tsx` | MIGRATE | HEAD |
| 29 | `src/components/general/GeneralListingResults.tsx` | MIGRATE | HEAD |
| 30 | `src/components/clothing/ClothingListingResults.tsx` | MIGRATE | HEAD |
| 31 | `src/components/notifications/NotificationBell.tsx` | MIGRATE | HEAD |
| 32 | `src/components/conversational/BuddyQuickActions.tsx` | MIGRATE | ZIP-20B |
| 33 | `src/components/profile/ProfileSpintaSwitch.tsx` | MIGRATE | HEAD |
| 34 | `src/components/clothing/WardrobeDealStepper.tsx` | CLEAN | HEAD |
| 35 | `src/components/clothing/WardrobeCabinetGrid.tsx` | CLEAN | HEAD |
| 36 | `src/components/clothing/VisibilityBooster.tsx` | CLEAN | HEAD |
| 37 | `src/components/clothing/SecretaryWarmGreeting.tsx` | CLEAN | HEAD |
| 38 | `src/components/zero-ui/ZeroUiScreenChrome.tsx` | CLEAN | ZIP-20B |
| 39 | `src/components/zero-ui/ZeroUiListingPreview.tsx` | CLEAN | ZIP-20B |
| 40 | `src/components/seller/ListingPublishSocialOptions.tsx` | CLEAN | ZIP-20B |
| 41 | `src/lib/__tests__/marketplace-filter-url.test.ts` | TEST | NEW (sukurtas 20A/20B, nepateiktas 20B zip — traktuojamas NEW patch'e) |
| 42 | `src/app/globals.css` | CLEAN | ZIP-20B |
| 43 | `e2e/helpers/supervisor-search.ts` | TEST | HEAD |
| 44 | `e2e/payment-methods-settings.spec.ts` | TEST | HEAD |
| 45 | `e2e/stage20b1-visual-regression.spec.ts` | TEST (NEW) | NEW (sukurtas 20B.1) |
| 46 | `tsconfig.json` | CONFIG | HEAD |

> **Pastaba dėl #41**: `src/lib/__tests__/marketplace-filter-url.test.ts` neegzistuoja
> HEAD ir nėra 20B zip source. Jis sukurtas 20A/20B eigoje (kartu su
> `src/lib/marketplace-filter-url.ts`). Kadangi patikimo jo pre-20B.1 snapshot'o
> nėra, patch'e jis traktuojamas kaip NEW failas (pilnas after-source).
> MANIFEST-20B1 nurodo, kad 20B.1 pakeitė tik komentarus jame.

---

## 4. B klasė — PRE-EXISTING BEFORE 20B.1 (kumuliatyvūs 20A/20B pakeitimai)

Šie failai pakeisti ankstesnių etapų (20A Design System 2.0, 20A.2, 20B).
Jie **nėra** Stage 20B.1 specifiniai ir **neįtraukti** į `stage20b1-only.patch`.

### 4.1 Tracked (git) failai, pakeisti iki 20B.1

Šie failai buvo pakeisti 20A/20B metu ir **jau buvo pasikeitę prieš 20B.1**
(neišvardinti A klasėje):

- `docs/ui-*.png` (25 screenshot failai: ui-business/control-center/detail/final/home/market/nav/profile)
- `e2e/helpers/stage12b-comprehension.ts`
- `package.json`
- `src/app/add/page.tsx`, `src/app/apie/page.tsx`, `src/app/layout.tsx`,
  `src/app/preview-design/PreviewShowcase.tsx`, `src/app/registracija/page.tsx`
- `src/components/*` — likę Stage 20A/20B komponentai (ActionButtons, AiSettingsCard,
  AudioWaveAnimation, ChatThreadView, EscrowActionBlock, EscrowModal, FilterBubbles,
  NativeShell, SellerProfilePage, VautoHexMark, VautoLogo, adaptive-confirmation/*,
  billing/*, broker/SmartBrokerCard, buddy/*, checkout/*, clothing/WardrobeCabinetSection,
  conversational/BuddyAvatar, dashboard/* (B2B, BulkUpload, Business*, CallAndSell,
  DashboardListingCard, EditListingModal, LaunchTrialBanner, MicroAnalytics,
  PrivateListingCard, ProUpsellCard, ReferralInviteCard, ServiceCalendar,
  ServiceLeadInbox, VisibilityPricingCard), escrow/ParcelLockerPicker,
  home/*, marketplace/*, photo/*, privacy/*, product/*, profile/ProfileSettingsMenu,
  search/VisualSearchStrip, seller/PhotoCategoryMismatchBanner, services/ServiceRequestCard,
  settings/*, trust/*, ui/ToastHost, vehicle/VehicleLookupCard, wishlist/*, wizard/*,
  zero-ui/ZeroUiBusinessDashboard, zero-ui/ZeroUiPaymentGate)
- `src/context/*` (AppThemeContext, VautoAgentContext, VautoContext, VautoSearchContext)
- `src/design-system/*` (UiKitPage, index, polish.css, primitives/*, tokens.css)
- `src/hooks/useCanonicalFacetUrl.ts`
- `src/lib/app-theme.ts`, `src/lib/native-media.ts`, `src/lib/story-visual.ts`
- `tests/screenshots/*.png` (3 failai)

### 4.2 Untracked failai, sukurti iki 20B.1 (ne Stage 20B.1)

- `src/components/marketplace/AiInterpretationChips.tsx`
- `src/design-system/primitives/Chip.tsx`, `Container.tsx`, `Drawer.tsx`, `ListingCard.tsx`
- `src/lib/__tests__/` (katalogas — kiti testai nei A klasėje)
- `src/lib/ai-facet-interpretation.ts`, `src/lib/ai-vertical-adapter.ts`,
  `src/lib/apply-ai-facet.ts`, `src/lib/listing-capabilities.ts`,
  `src/lib/marketplace-filter-url.ts`
- `e2e/stage171-*.spec.ts`, `e2e/stage17-*.spec.ts`, `e2e/stage182-ai-native-flow.spec.ts`,
  `e2e/stage183-search-state.spec.ts`, `e2e/stage18-ai-native.spec.ts`,
  `e2e/stage18-visual-evidence.spec.ts`
- `docs/design-reference/` (vizualus baseline), `docs/STAGE-15-PRODUCTION-DEPLOYMENT.md`,
  `docs/STAGE-16R.1-OBSERVABILITY.md`, `docs/STAGE-17-AUDIT.md`,
  `docs/STAGE-18.1/18.2/18.3/18.3.1/18.3.2-*.md`, `docs/STAGE-20A-DESIGN-SYSTEM.md`,
  `docs/VAUTO-EXPERIENCE-SYSTEM.md`, `docs/migration-route-matrix-20B.md`,
  `docs/ui-stage18/`
- `.cursor/rules/visual-reference-baseline.mdc`
- `scripts/*` — ankstesnių etapų verifikacijos/pakavimo skriptai
- Ankstesnių etapų artefaktai: `FINDINGS-20A2.txt`, `FINDINGS-20B.txt`,
  `MANIFEST-20A2.txt`, `MANIFEST-20B.txt`, `MATRIX-20A2.md`, `MATRIX-20B.md`,
  `STATUS-20A2.txt`, `STATUS-20B.txt`, `git-diff-stage20b.patch`,
  `git-diff-stat-20a2.txt`, `stage16r1/`, `stage16r2/`, `stage17/`,
  `stage18-*-delta/`, `stage20a/`, `staging/`, `vauto-*-delta.zip`,
  `stage182-*.log`, `stage20b-*.log`, `head-check-build.log`, `head-serve.log`,
  `serve.err`, `serve.log`, `git-status.txt`

---

## 5. C klasė — EVIDENCE/DOC ONLY (Stage 20B.1 artefaktai)

Šie failai yra Stage 20B.1 evidence ir dokumentacija — **ne production kodas**.
Jie saugomi `docs/audit/stage20b1/` ir repo root, į patch neįtraukti.

### 5.1 Dokumentacija (`docs/audit/stage20b1/`)

- `MANIFEST-20B1.md`
- `LEGACY-DEPENDENCY-MAP.md`
- `DECOUPLING-REPORT.md`
- `E2E-FAILURE-CLASSIFICATION.md`
- `VISUAL-REGRESSION-MATRIX.md`
- `FINDINGS-20B1.md`
- `STATUS-20B1.md`
- `source-snapshot/` (46 failai — A klasės after-source)
- `visual/*.png` (12 screenshot'ų)

### 5.2 Dokumentacija (kita)

- `docs/visual-drift-register-20B.md` (korekcija: frozen zones → deprecated legacy)
- `docs/audit/stage20b/` (Stage 20B audit docs)

### 5.3 Testų logai (repo root, `stage20b1-*.log`)

`stage20b1-build.log`, `stage20b1-e2e-build.log`, `stage20b1-e2e-search.log`,
`stage20b1-e2e-search-r2.log`, `stage20b1-e2e-search-r3.log`,
`stage20b1-e2e-payments.log`, `stage20b1-e2e-payments-r2.log`,
`stage20b1-e2e-smoke.log`, `stage20b1-e2e-smoke-r2.log`,
`stage20b1-e2e-ui.log`, `stage20b1-e2e-ui2.log`, `stage20b1-e2e-ui-r3.log`,
`stage20b1-e2e-stage12.log`, `stage20b1-e2e-12ab-r2.log`,
`stage20b1-e2e-stage13.log`, `stage20b1-e2e-13c-r2.log`,
`stage20b1-e2e-stage17.log`, `stage20b1-e2e-182-r2.log`,
`stage20b1-e2e-profile-r2.log`, `stage20b1-e2e-full-r2.log`,
`stage20b1-visual-regression.log`, `stage20b1-visual-regression-r2.log`,
`stage20b1-visual-regression-r3.log`

### 5.4 Šio closure žingsnio artefaktai

- `stage20b1/stage20b1-only.patch` — **švarus UTF-8 A klasės patch**
- `stage20b1/verify-20b1.1.ps1` — MANIFEST vs snapshot automatinė verifikacija
- `stage20b1/gen-stage20b1-patch-git.py` — patch generavimo skriptas (reprodukuojamas)
- `stage20b1/baseline-tree/` — rekonstruotas pre-20B.1 baseline (A klasės before-source)

---

## 6. Ownership pagrindimas (A klasės)

### 6.1 A klasės failai — kodėl jie priskirti 20B.1

Visi 46 failai atitinka MANIFEST-20B1 §2–§3 deklaruotus pakeitimus:

1. **NEW** (`vertical-presentation`, `vertical-listing-filter`,
   `stage20b1-visual-regression.spec.ts`): sukurti šio etapo — nėra nei HEAD,
   nei 20B zip.
2. **BRIDGE** (`chameleon-themes`, `chameleon-portal-ui`, `portal-experience`,
   `portal-listing-filter`): 20B.1 pavertė juos `@deprecated` compatibility
   bridges — nauja logika nukreipta į VAUTO-native modulius.
3. **MIGRATE**: importai ir semantika pakeisti iš portal-imitation į vertical-native.
4. **CLEAN**: portal-native paletės ir `--portal-*` tokenai pakeisti DS 2.0.
5. **TEST**: testų contract atnaujinimas.
6. **CONFIG** (`tsconfig.json`): exclude taisyklės.

### 6.2 A klasės failų baseline patikimumas

- **12 failų**: baseline = 20B zip `stage20b/source/` — oficialus Stage 20B
  pabaigos snapshot. **Patikima.**
- **30 failų**: baseline = HEAD. Šiems failams 20B NEpadarė jokių pakeitimų
  (jie nėra 20B zip source), tad HEAD = pre-20B.1. **Patikima.**
- **4 NEW failai**: before neegzistuoja — pateikiamas pilnas after-source.

### 6.3 Kodėl patch yra patikimas (NE "NOT RELIABLY RECONSTRUCTABLE")

Nors direktyva numato galimybę žymėti `PATCH NOT RELIABLY RECONSTRUCTABLE`,
baseline pavyko rekonstruoti iš dviejų nepriklausomų šaltinių ir patch
**empiriškai patvirtintas**:

- `git apply --check` prieš baseline: **PASS**
- Pritaikius patch baseline'ui ir palyginus su live failais: **46/46, 0 mismatch**

---

## 7. Automatinės verifikacijos rezultatai

```
MANIFEST declared source/test/config files : 46
source-snapshot actual files                 : 46
MISSING (declared, not snapshotted)          : 0
EXTRA (snapshotted, not declared)            : 0
STALE (snapshot differs from live source)     : 0
RESULT: PASS - MANIFEST == source-snapshot 1:1, all snapshots fresh.
```

Patch validacija:

```
git apply --check (baseline) : PASS
Roundtrip (apply -> compare) : 46/46 files, 0 mismatches vs live
```

---

## 8. STATUS

**NO PRODUCTION CHANGE — AUDIT PACKAGING ONLY.**

- Nė vienas production/source failas nebuvo pakeistas šio closure metu —
  tik nukopijuoti esami failai į `source-snapshot/` ir sugeneruoti audit artefaktai.
- Testai NEKARTOJAMI (testų nekeitėme).
- STRICT STOP: Red-Team audit nepradedamas, Stage 20C nepradedamas.
- Laukiame nepriklausomo ChatGPT audito.
