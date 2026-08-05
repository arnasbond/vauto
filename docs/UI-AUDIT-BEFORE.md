# VAUTO Premium UI 2.0 — Etapas 0: UI inventorizacija (BEFORE)

**Data:** 2026-08-05  
**Repo būsena:** `master` @ `d9c3d0f` (Stage 2–4 security/CI jau uždaryti)  
**Taisyklė:** šis dokumentas fiksuoja **esamą** UI — jokia logika, stiliai ar komponentai šiame etape **nekeičiami**.  
**Stack:** Next.js App Router · Tailwind CSS **v4** (`src/app/globals.css`, be klasikinio `tailwind.config`) · ~**29** `page.tsx` · ~**262** `.tsx` komponentai

---

## 1. Tikslas

Užfiksuoti bazinę UI būseną prieš Design System 2.0 (Etapas 1):

1. Ekranų ir komponenčių žemėlapis  
2. Vizualinės skolos katalogas (dubliavimas, spacing, radius/shadow, CTA hierarchija, empty/loading, spalvos / AI identitetas)  
3. Prioritetai Etapui 1–N (be implementacijos)

---

## 2. Ekranų inventorizacija

### 2.1 Pradinis puslapis (`/`)

| Blokas | Šaltinis | Pastaba |
|---|---|---|
| Hero / AI command | `HomeAiHero`, `AiCommandBar`, `AgentChatStrip` | Compact vs full; slepiamas pagal shell chrome |
| Header (mobile) | `Header` | Desktop naudoja `DesktopHeader` per `VautoAdaptiveLayout` |
| „Kaip veikia“ | `HowItWorksSection` | Kortelės: `rounded-2xl` + custom soft shadow |
| Vertės juosta | `HomeAiValueBand` | Marketing strip |
| Paieška / rezultatai | `ListingGrid`, `SearchResultsFocus`, `SearchEmptyAssistantBanner` | Empty → assistant banner |
| Portal chrome | `PortalPageChrome`, `PortalExperienceStrip` | Chameleon / portal sluoksnis |
| Zero-UI režimai | `ZeroUiListingPreview`, `ZeroUiBusinessDashboard`, `ZeroUiAdminPanel` | Home screen switch |

### 2.2 Marketplace katalogas

| Paviršius | Route | Komponentai |
|---|---|---|
| Home feed | `/` | `ListingGrid` → `MarketplaceGridCard` / `MarketplaceListRow` |
| Discover | `/discover` | `AppShell` + `HeroSection` + `ListingGrid` |
| Search | `/search` | `TopAiCommandChrome` + `ListingGrid` |
| Fashion | `/fashion` | `GuestFashionCabinet` |
| Filtrai | — | `MarketplaceFilterBar`, `FilterBubbles` |
| Žemėlapis | — | `ListingMapView` |
| Kategorijų rezultatai | — | `vehicle/*`, `clothing/*`, `real-estate/*`, `jobs/*`, `services/*`, `general/*` ListingResults |

**Kortelių šeima (6+):**  
`ui/ListingCard` · `MarketplaceListingCards` · `DashboardListingCard` · `PrivateListingCard` · `ProListingCard` · `PrePublishListingCard`

### 2.3 Skelbimo detalės

| Route | Komponentas |
|---|---|
| `/listing` | `ListingDetailPage` |
| Galerija | `ListingImageGallery`, `ListingImage` |
| Kaina / AI | `PriceAdviceCard`, `PriceRangeBar` |
| Pirkėjas / pardavėjas | CTA stack inline + `SellerRatingBadge`, `VerifiedSellerBadge` |
| Susiję | `SimilarListingsSection` |
| Dalijimasis | `ShareListingButton` / Modal / Panel |

**CTA pastaba:** detail puslapyje pirminiai mygtukai stilizuoti **inline** (`rounded-xl` + `shadow-md shadow-[rgba(27,77,255,0.2)]`), ne per `BrandButton` — vizualinis svoris dubliuojasi su kitomis primary CTA.

### 2.4 Skelbimo kūrimas / redagavimas

| Srautas | Komponentai |
|---|---|
| Add / redirect | `/add` → `HeroSection` + loader |
| PrePublish | `PrePublishModal`, `PrePublishListingCard`, `PrePublishShippingOptions` |
| Adaptive confirmation | `ConfirmationShell`, `BaseFieldsEditor`, `CategoryFieldsEditor` |
| Edit | `EditListingModal` |
| Foto | `PhotoSourceSheet`, `PhotoClarificationPanel`, `AiProcessingOverlay` |
| AI advisor / promote | `AiListingAdvisorModal`, `SmartPromoteModal` |

Kūrimas stipriai **chat-first** (agentas + overlay), ne klasikinė multi-step forma — UI sluoksnių daug, vieningos form control bibliotekos nėra.

### 2.5 Mano skelbimai ir profilis

| Route | Komponentai |
|---|---|
| `/mano-skelbimai` | `ManoSkelbimaiDashboard`, `TopAiCommandChrome`, `AgentChatStrip` |
| `/profile` | `DashboardShell`, `DashboardPage`, `PrivateSellerDashboard` / Pro / wardrobe |
| `/profile/settings` | Settings cards + `Panel` / `PageHeader` / `SegmentedTabs` |
| Viešas pardavėjas | `/seller`, `/seller/[id]` → `SellerProfilePage` |

### 2.6 Verslo portalas / B2B

| Route | Komponentai |
|---|---|
| `/verslui` | Marketing + `BusinessAccessGateModal` + `BusinessPortalDashboard` |
| Branduolys | `ProBusinessDashboard` (overview / listings / pricing / services) |
| B2B blokai | `B2BAnalyticsPanel`, `B2BBillingCard`, `B2BPlanCreditsCard`, `BulkUploadCard`, `BusinessIdentityCard`, `VisibilityPricingCard`, `VautoWallet`, … |
| Registracija | `/pro-registration` → `ProRegistrationForm` |

### 2.7 Control Center

| Faktas | Detalė |
|---|---|
| **Tikrasis CC** | `/profile/?tab=…` per `AdminProfileShell` |
| Tab’ai | `ops` · `moderation` · `listings` · `agent` · `account` |
| `/admin` | Adminams → redirect į `/profile/?tab=moderation`; kitiems → `AdminMaskedNotFound` |
| `/admin/ai` | `AdminGeminiUploadPanel` |
| Deprecated | `AdminControlCenter` → plonas `AdminReportInbox` alias |

### 2.8 Tuščios / loading / error būsenos

| Tipas | Būklė „BEFORE“ |
|---|---|
| Shared `Skeleton` | **Nėra** (~3 `animate-pulse` pavyzdžiai) |
| Shared `EmptyState` | **Nėra** — daliniai: `WantedEmptyState`, `SearchEmptyAssistantBanner` |
| Loading | Inline `Kraunama…` / `Loader2` / Suspense (~59 failų) |
| App Router | **Nėra** `loading.tsx` / `error.tsx` / `not-found.tsx` po `src/app` |
| Error | `NativeErrorBoundary`, `SyncErrorBanner`, admin 404 mask |

---

## 3. Layout / chrome žemėlapis

Persidengiančios „kriauklės“:

| Shell | Naudojimas |
|---|---|
| `AppShell` | Mobile/plain + dalis marketing puslapių |
| `VautoAdaptiveLayout` | Home / chats / mano-skelbimai / verslui (desktop → portal) |
| `DashboardShell` | Profile / settings / Pro |
| `PortalPageChrome` | Discover / search / chameleon |
| Zero-UI chrome | Home screen variants |

**Rizika Etapui 1:** Design System 2.0 turi apibrėžti **vieną** chrome hierarchiją; dabar mobile / desktop / dashboard / portal / Zero-UI gyvena lygiagrečiai.

---

## 4. Design tokenai (esama paletė)

Šaltinis: `src/app/globals.css` (`:root` + `@theme inline`).

| Šeima | Pavyzdžiai | Problema |
|---|---|---|
| Semantic | `--background #f7f8fb`, `--primary #1b4dff`, `--radius 0.75rem` | Geras branduolys |
| VAUTO | `--vauto-primary`, `--vauto-orange/#ff7a1a`, `--vauto-ink`, surfaces | Dalinai naudojama |
| Flux (legacy) | `--flux-teal/cyan/indigo/coral` | Dublikatas su brand blue |
| Anonser (desktop) | `--anonser-*` | Antroji „B2B light“ sistema |
| Temų režimai | `data-app-theme`: `vauto-original` / `dark` / `light-minimal` | Chameleon override’ai gausūs |

**Šriftai:** Geist Sans / Mono + Outfit (display) per `layout.tsx`.  
**Viewport themeColor:** `#F4F7FC`.

---

## 5. Vizualinės skolos katalogas

### 5.1 Komponentų dubliavimas

| Domenas | Rasta | Poveikis |
|---|---|---|
| Listing cards | **6** atskiros implementacijos + 6 kategorijų results wrapper’iai | Skirtingas aspect ratio, badge, shadow, tipografija |
| Mygtukai | `BrandButton` + `.vauto-btn-*` + dešimtys ad-hoc CTA | Nėra vienos CTA hierarchijos |
| Kortelės / panelės | `ui/surface/Panel` (kanonas dokuose) + **~30** `*Card.tsx` | Settings/B2B/admin dar neperėjo į Panel |
| Inputai | Nėra shared `Input` / `TextField` | Kiekvienas modalas stilizuoja `rounded-xl border bg-white` lokaliai |
| Badge’ai | `AiModeBadge`, `ui/AiBadge`, `FeedTierBadge`, trust badges | AI / feed / trust ženklai skirtingi |

### 5.2 Spacing inconsistency

- Sisteminis Tailwind spacing (`p-3`…`p-6`, `gap-2`…`gap-4`) dominuoja — **nėra** masinio `19px`/`27px` chaosas.  
- Vis dėlto **ad-hoc** reikšmės: `rounded-[14px]` (NotificationBell), `rounded-[15px]` / `p-[1px]` (Buddy), `rounded-[28px]` + `p-7` (AuthModal), skirtingi `mt-3` vs `mb-2` hero compact režimuose.  
- Desktop vs mobile naudoja skirtingus container / max-width (`--anonser-desktop-max: 80rem` vs mobile full-bleed) be vienos spacing skalės dokumentacijos.  
- **Whitespace:** home hero + AI strip + listing grid dažnai „plaukia“ — tarpai tarp sekcijų (`mb-2`, `mt-3`, `p-6` how-it-works) nesusieti su 4/8pt skale.

### 5.3 Border-radius ir shadows

| Pattern | Kur | Pastaba |
|---|---|---|
| Token `--radius: 0.75rem` | Dauguma `rounded-xl` | Bazė OK |
| `rounded-2xl` | Kortelės, how-it-works, prepublish | Antras „standartas“ be taisyklės kada xl vs 2xl |
| `rounded-[28px]` | Auth luxury modal | Trečias „premium“ radius |
| `shadow-sm` / `md` / `lg` | Mixed | CTA dažnai `shadow-md` + custom blue glow |
| Custom `shadow-[0_8px_30px_…]` | Detail sticky panel, showcase | Soft elevation be tokeno |
| Globals CSS elevation | Portal / auth / FAB | Trečia šešėlių sistema |

**Išvada:** radius ir shadow turi **3–4 lygiagrečias sistemas** (token · Tailwind utility · arbitrary · globals CSS).

### 5.4 Mygtukų vizualios hierarchijos trūkumai

1. **Primary vs secondary** dažnai skiriasi tik border/bg, bet abu `font-semibold`/`font-bold` + panašus dydis (`min-h-11` / `py-2.5` / `py-3.5`).  
2. Listing detail: keli full-width primary stiliaus mygtukai (rašyti / skambinti / escrow) — **vienodo svorio** eilutė.  
3. Buddy / orange CTA (`--vauto-orange`) konkuruoja su brand blue primary — AI akcentas kartais atrodo kaip „antrasis primary“.  
4. `BrandButton` ghost ≈ secondary (abu border + light hover) — ghost beveik be skirtumo.  
5. FAB / install / bottom-nav CTA neįeina į tą pačią hierarchiją.

### 5.5 Empty / loading / skeleton spragos

| Scenarijus | Esama | Trūksta |
|---|---|---|
| Tuščia paieška | `SearchEmptyAssistantBanner` / wanted | Vieningas empty layout + iliustracija |
| Tuščias katalogas | Inline LT tekstas | Skeleton grid + empty CTA |
| Dashboard listings | Ad-hoc | Skeleton rows |
| Chat inbox | Inline | Empty conversation art |
| Control Center tables | Loading tekstas | Table skeleton |
| Route transition | Nėra `loading.tsx` | App-level suspense UI |
| Klaidos | Banner / toast | Error page pattern |

### 5.6 Spalvų monotoniškumas ir AI identiteto stoka

- Dominuoja **šalta mėlyna** (`#1b4dff` / `--vauto-primary`) ant šviesaus gray-blue fono (`#f7f8fb`) — saugu, bet plokščia.  
- AI oranžinė (`--vauto-orange`) naudojama neconsistently (Buddy, kai kurie chip’ai) — nėra aiškaus „AI surface“ (gradient / glow / mark) sistemos.  
- Raw hex drift (`#6b7280`, `#374151`, `#1167b1`, `#eef6ff`) — paralelinės gray/blue skalės greta tokenų.  
- Flux / Anonser vardai silpnina VAUTO AI brand signalą desktop’e.  
- Hero dažnai yra **command bar**, ne brand-first vizualinė plokštuma — AI produktas „jaučiasi“ kaip paieška, ne kaip distintyvus brokeris.

---

## 6. Prioritetai Etapui 1 (Design System 2.0) — tik planas

> Implementacija **neprasideda** be patvirtinimo po šio BEFORE audito.

1. **Token consolidation** — viena spalvų / radius / shadow / spacing skalė; deprecate Flux + raw hex.  
2. **Primitive kit** — `Button` (primary/secondary/ghost/destructive + AI accent), `Input`, `Panel`, `EmptyState`, `Skeleton`.  
3. **ListingCard v2** — vienas presentational + variant props (feed / dash / pro / prepublish).  
4. **CTA hierarchy rules** — 1 primary per view; AI accent atskira rolė.  
5. **Chrome map** — App / Adaptive / Dashboard / Portal sujungimas į dokumentuotą layout tree.  
6. **AI visual identity** — Outfit + orange/blue system + hero composition (brand-first).  
7. **Empty/loading coverage** — route `loading.tsx` + shared skeletons.

---

## 7. Failų žemėlapis (greita nuoroda)

```
src/app/page.tsx                          → Home
src/app/search|discover/page.tsx          → Katalogas
src/app/listing/page.tsx                  → Detalės
src/app/mano-skelbimai|profile/…          → Pardavėjas / CC
src/app/verslui|pro-registration/page.tsx → B2B
src/app/globals.css                       → Tokenai + legacy utilities
src/components/ui/{BrandButton,ListingCard,surface/*}
src/components/marketplace/*
src/components/dashboard|business|admin/*
src/components/home/{HomeAiHero,PrePublish*}
```

---

## 8. Etapo 0 apribojimai (įvykdyta)

- [x] Jokios aplikacijos logikos / UI kodo / stilių pakeitimų  
- [x] Inventorizacija ir BEFORE dokumentas (`docs/UI-AUDIT-BEFORE.md`)  
- [x] `npx tsc --noEmit` ir `npm run server:build` — Exit 0 (žr. CI lokalų paleidimą po dokumento)

**Screenshot pastaba:** prod smoke anksčiau patikrino `/`, `/admin/`, `/profile/` gyvai; atskiras BEFORE screenshot rinkinys (vizualinis baseline) gali būti pridėtas Etapo 0.1, jei produktas reikalaus pixel-diff — šiame dokumente bazė yra **komponentų / tokenų auditas**.

---

## 9. Laukia patvirtinimo

**STOP:** nepradėti Etapo 1 (Design System 2.0) be aiškaus go-ahead.

Patvirtinus — siūloma eiti: tokenai → primityvai → ListingCard unifikacija → chrome / AI hero.
