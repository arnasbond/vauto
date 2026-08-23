# VAUTO Stage 20B.1 — LEGACY DEPENDENCY MAP

Etapas: **20B.1 — LEGACY DECOUPLING & E2E EVIDENCE HARDENING**
Data: **2026-08-20**
Būsena: **COMPLETE**

---

## 1. Tikslas

Pilnas repository-wide inventory visų Chameleon / portal imitation / simulator
dependency pėdsakų. Kiekvienas radinys klasifikuojamas (A–E) pagal nepriklausomo
ChatGPT audito specifikaciją, kad būtų galima saugiai atkabinti atmestą
portal-imitation architektūrą nuo aktyvaus VAUTO runtime, **NEIŠTRINANT**
naudingos generic marketplace / vertical adaptacijos logikos.

## 2. Klasifikacijos raktas

| Klasė | Reikšmė |
|-------|---------|
| **A** | PURE PORTAL IMITATION LEGACY — portal-native palettes, temų imitacija, Chameleon produkto semantika |
| **B** | GENERIC USEFUL MARKETPLACE LOGIC WITH LEGACY NAME — naudinga funkcija su pasenusiu pavadinimu |
| **C** | TEST/DEMO LEGACY — tik testų/demo infrastruktūra |
| **D** | ACTIVE DEPENDENCY REQUIRING MIGRATION — aktyvi priklausomybė, reikalinga migracija |
| **E** | UNCERTAIN — reikia papildomos analizės |

## 3. Dependency inventoriaus santrauka

| Terminas | Failų skaičius (src) | Runtime-reachable? |
|----------|----------------------|-------------------|
| `chameleon` (case-insensitive) | 49 | Taip (dalis) |
| `autoplius` / `aruodas` / `skelbiu` / `vinted` / `cvbankas` | 39 | Taip (dalis) |
| `categoryToTheme` / `adaptiveKeyToTheme` | 6 | Taip |
| `getPortalUi` / `chameleon-portal-ui` | 14 | Taip |
| `.chameleon-*` CSS selectors | 42 (globals.css) | Taip (dalis) |

## 4. Pilnas dependency žemėlapis

### 4.1 Core Chameleon moduliai

| Failas | Simbolis | Importuotojai | Runtime-reachable? | Klasė | Tikrasis tikslas |
|--------|----------|---------------|--------------------|-------|-------------------|
| `src/lib/chameleon-themes.ts` | `ChameleonThemeId` | VautoContext, VautoBridge, useActivePortal, AiCommandBar, portal-experience, portal-listing-filter, wardrobe-cabinet-mode, monetization-wardrobe, SubscriptionGuard, ListingGrid, flow-ui-skin, BuddyQuickActions, chameleon-portal-ui, ChameleonThemeHost, ConfirmationShell, SmartPromoteModal, ProListingCard | **TAIP** | **D** | Vertical presentation id — teisingai apibūdina kategoriją, bet turi portal-imitation pavadinimą |
| `src/lib/chameleon-themes.ts` | `THEMES` (Record<ChameleonThemeId, ChameleonThemeTokens>) | getChameleonTheme | **TAIP** | **A/B** | Confirmation/published token laukai: `flux` naudoja DS tokens; kiti — portal-native hex |
| `src/lib/chameleon-themes.ts` | `adaptiveKeyToTheme(key)` | categoryToTheme | **TAIP** | **B** | Mapping `AdaptiveCategoryKey → theme id` — naudinga kategorijų logika su legacy pavadinimu |
| `src/lib/chameleon-themes.ts` | `categoryToTheme(category)` | ProListingCard, SmartPromoteModal | **TAIP** | **B** | Mapping `ListingCategory → theme id` — naudinga, su legacy pavadinimu |
| `src/lib/chameleon-themes.ts` | `getChameleonTheme(id)` | ChameleonThemeHost, ConfirmationShell, SmartPromoteModal | **TAIP** | **A/B** | Grąžina visą theme token bloką |
| `src/lib/chameleon-themes.ts` | `getPromoteLabelsForCategory(category)` | smart-promote.ts | **TAIP** | **B** | Promote etiketės pagal kategoriją — naudinga monetizacijos logika |
| `src/lib/chameleon-portal-ui.ts` | `PortalUiTokens` / `PORTAL_UI` / `getPortalUi` | ListingGrid, AiCommandBar, useActivePortal, VehicleListingResults, RealEstateListingResults, ClothingListingResults, ServiceListingResults, GeneralListingResults, PortalPageChrome, ChameleonThemeHost | **TAIP** (kai kurie) | **A/D** | Per-portal visual tokens. `flux` jau emerald per 20B; kiti (autoplius/skelbiu/aruodas/cvbankas) — portal-native palettes |
| `src/lib/portal-experience.ts` | `PortalExperience` / `EXPERIENCES` / `portalExperienceForQuery` / `allPortalExperiences` / `portalShortLabel` | useActivePortal, ListingGrid, AiCommandBar, discover/page, PortalPageChrome, PortalExperienceStrip, marketplace-view, portal-listing-filter | **TAIP** | **B/D** | Query → vertical experience metadata. Naudinga vertical adaptacija su legacy "portal" pavadinimu |
| `src/components/theme/ChameleonThemeHost.tsx` | `ChameleonThemeHost` | (AppShell/layout) | **TAIP** | **A/D** | Applies `body.chameleon-*` class + meta theme-color pagal aktyvų theme |
| `src/hooks/useActivePortal.ts` | `useActivePortal` | NotificationBell | **TAIP** | **B/D** | Aktyvaus vertical ui/experience nustatymas — naudinga, legacy pavadinimas |
| `src/components/chameleon/PortalPageChrome.tsx` | `PortalPageChrome` | app/page, app/search/page, app/discover/page | **TAIP** | **B** | Hero chrome adaptacija pagal aktyvų vertical — naudinga, legacy "Portal" pavadinimas |
| `src/components/chameleon/PortalExperienceStrip.tsx` | `PortalExperienceStrip` | app/discover/page | **TAIP** | **B** | Vertical quick-pick juosta (transportas, NT, drabužiai…) — naudinga, legacy pavadinimas |

### 4.2 Komponentai su Chameleon priklausomybėmis

| Komponentas | Chameleon API | Runtime-reachable? | Klasė | WHY IT DEPENDS / Tikrasis tikslas |
|-------------|---------------|--------------------|-------|-----------------------------------|
| `ListingGrid.tsx` | `portalExperienceForQuery`, `getPortalUi`, `ChameleonThemeId` | **TAIP** (home/search/discover) | **B** | Tuščios būsenos žinutės + WantedEmptyState border/text spalvos pagal vertical |
| `AiCommandBar.tsx` | `chameleonTheme`, `portalExperienceForQuery`, `getPortalUi` | **TAIP** | **D** | `ui.searchBorder` formos border spalvai; `activeTheme` tik per seller flow / search query |
| `ProListingCard.tsx` | `categoryToTheme` | **TAIP** (dashboard) | **B** | Tik matomumo badge spalvai (TOP/PLUS/VIP) — gali naudoti DS brand, o ne portal spalvas |
| `SmartPromoteModal.tsx` | `categoryToTheme`, `getChameleonTheme` | **TAIP** (dashboard) | **A/B** | `classicLayout` + portal-native confirmation spalvos |
| `MarketplaceFilterBar.tsx` | `useCanonicalFacetQuery` (netiesiogiai) | **TAIP** | — | Jokios Chameleon priklausomybės tiesiogiai — naudoja marketplace-domain, facet-query |
| `discover/page.tsx` | `portalExperienceForQuery` | **TAIP** | **B** | `isFluxHome` sprendimas — naudinga logika, legacy pavadinimas |
| `EscrowModal.tsx` | `chameleonTheme`, `buildWardrobeEscrowContext` | **TAIP** | **B** | Wardrobe 3% mokesčio taisykle — tikrinama `chameleonTheme === "wardrobe"` |
| `ExpressEscrowProcessor.tsx` | `chameleonTheme`, `buildWardrobeEscrowContext` | **TAIP** | **B** | Tas pats wardrobe mokestis |
| `BuddyQuickActions.tsx` | `ChameleonThemeId` tipas | **TAIP** (BuddySearchAssistant) | **A** | `classic` variantai naudoja portal-native hex, BET `classic` niekada neperduodamas (default false) — dead branch |
| `LiveInterventionHost.tsx` | `chameleonTheme === "wardrobe"` | **TAIP** | **B** | Wardrobe konteksto nustatymas |
| `ConfirmationShell.tsx` | `getChameleonTheme("flux")` | **TAIP** (post-publish) | **B** | Publikuoto skelbimo celebration — flux theme tokens |
| `ProfileSpintaSwitch.tsx` | `chameleonTheme` | **TAIP** | **B** | Spintos perjungimas |
| `WardrobeCabinetSection.tsx` | `var(--chameleon-accent,#09b1a8)` | **TAIP** (DashboardPage) | **B** | Spintos accent naudojimas |
| `WardrobeDealStepper.tsx` | `var(--chameleon-accent,#09b1a8)` | **TAIP** (chat flow) | **B** | Spintos deal stepper accent |
| `GuestFashionCabinet.tsx` | `chameleon-wardrobe` klasė | **TAIP** (fashion route) | **A/B** | Spintos wrapper — `chameleon-wardrobe` CSS klasė |
| `TopAiCommandChrome.tsx` | `chameleon-wardrobe` klasė | **TAIP** | **A/B** | Wardrobe variant wrapper |
| `WardrobePowerStats.tsx` / `VisibilityBooster.tsx` | `chameleonTheme`, wardrobe economy | **TAIP** | **B** | Spintos monetizacija |

### 4.3 Lib failai su Chameleon pėdsakais

| Failas | Simbolis | Klasė | Tikrasis tikslas |
|--------|----------|-------|-------------------|
| `src/lib/smart-promote.ts` | `getPromoteLabelsForCategory` | **B** | Promote etiketės pagal kategoriją — naudinga monetizacija |
| `src/lib/marketplace-view.ts` | `portalExperienceForQuery`, `effectiveChameleonCategory` | **B** | Query → vertical category inference — naudinga |
| `src/lib/marketplace-filter-url.ts` | `ca_*` prefix (chameleon attributes) | **B** | Complementary URL serializacija — veikia per `category-attribute-filters` |
| `src/lib/portal-listing-filter.ts` | `portalThemeForQuery`, `categoriesForPortal`, `filterListingsForPortal` | **B** | Query → kategorijų filtras — naudinga |
| `src/lib/wardrobe-cabinet-mode.ts` | `ChameleonThemeId` | **B** | Spintos aktyvacija |
| `src/lib/monetization-wardrobe.ts` | `ChameleonThemeId`, wardrobe economy | **B** | Spintos mokesčių logika — reikia saugoti (frozen transaction invariants!) |
| `src/lib/SubscriptionGuard.ts` | `ChameleonThemeId` | **B** | Spintos prenumeratos guard |
| `src/lib/flow-ui-skin.ts` | `chameleon-wardrobe` klasė | **A/B** | Wizard skin root class |
| `src/lib/adaptive-categories/config.ts` | `portalStyle: "Auto"` / `"CVBANKAS"` / `"SKELBIU.LT"` / `"ARUODAS.LT"` | **A** | Kategorijų konfigūracijoje — portal-style labels; generinė struktūra naudinga, bet portal labels pasenę |
| `src/lib/utils.ts` | URL regex su `autoplius.` / `aruodas.` / `skelbiu.` / `cvbankas.` | **C/B** | External source URL filtras (importams) — saugumo funkcija, PALIKTI |
| `src/lib/ai-vertical-adapter.ts` | `"vinted"` keyword | **B** | NL query keyword klasifikacija |
| `src/lib/universal-search-intent.ts` | `vinted` keyword | **B** | NL query intent |
| `src/lib/listing-ai-advisor.ts` | `"Autoplius pirkėjai"` / `"CVBankas kandidatai"` tip tekstas | **C/B** | AI patarimų tekstas su portal pavadinimais — copy, ne funkcionalumas |
| `src/lib/listing-attributes.ts` / `listing-display.ts` / `scoring.ts` / `listing-form-validation.ts` / `listing-attribute-isolation.ts` / `universal-listing-fields.ts` | `skelbiuCategory` field | **B** | Universali skelbimų schema — naudingas laukas su legacy pavadinimu |
| `src/lib/market-pricing.ts` / `market-insights.ts` / `price-advisor.ts` | `getSkelbiuMarketSnapshot` | **B** | Rinkos kainų logika — naudinga, legacy pavadinimas |
| `src/lib/agent-flow-wizard-orchestrator.ts` | `"Vinted"` teksto minėjimas | **C** | Importo instrukcija — copy |
| `src/lib/job-catalog.ts` / `vehicle-catalog.ts` / `real-estate-catalog.ts` / `general-catalog.ts` / `clothing-catalog.ts` / `skelbiu-catalog.ts` | Demo duomenys | **C** | Fixtures |
| `src/data/lithuania-locations.ts` | portal minėjimai? | **C** | Miestų duomenys — ne chameleon |

### 4.4 CSS (globals.css)

| Selector / Token | Runtime-reachable? | Aktyvuotojas | Klasė | Sprendimas |
|------------------|--------------------|--------------|-------|------------|
| `body.chameleon-flux` | Taip (per ChameleonThemeHost, flux) | ChameleonThemeHost | **A** | Flux body class šiuo metu aktyvuojamas — bet flux neturi specialių rules? patikrinti |
| `body.chameleon-autoplius` | Taip (per ChameleonThemeHost) | ChameleonThemeHost | **A** | Portal-native rules |
| `body.chameleon-wardrobe` | Taip (per ChameleonThemeHost + flow-ui-skin) | ChameleonThemeHost, TopAiCommandChrome, GuestFashionCabinet, flow-ui-skin | **A** | Wardrobe rules — aktyvuojamas /fashion ir seller flow clothing |
| `body.chameleon-skelbiu` | Taip | ChameleonThemeHost | **A** | Portal-native rules |
| `body.chameleon-aruodas` | Taip | ChameleonThemeHost | **A** | Portal-native rules |
| `body.chameleon-paslaugos` | Taip | ChameleonThemeHost | **A** | Portal-native rules |
| `body.chameleon-cvbankas` | Taip | ChameleonThemeHost | **A** | Portal-native rules |
| `.chameleon-details-panel` rules | **A** | Tik per `body.chameleon-*` — ar detalės panel klasė naudojama? PATIKRINTI | **A/E** | Reikia runtime patikros |
| `.chameleon-wizard-shell` rules | **E** | Wizard shell klasė? PATIKRINTI | **E** | |
| `.chameleon-aruodas-media img` / `.chameleon-wardrobe-media img` | **E** | Media klasės? PATIKRINTI | **E** | |
| `body.chameleon-*.portal-listing-card:hover` | **E** | `.portal-listing-card` klasė naudojama? | **E** | |
| `body.chameleon-* .nt-wizard-chip-active` | **E** | NT wizard chip klasė? | **E** | |
| `--chameleon-accent` | **TAIP** | WardrobeCabinetSection, WardrobeDealStepper (fallback `#09b1a8`) | **A/B** | `globals.css` jau remapintas į emerald per 20B — PATIKRINTI dabartinę reikšmę |
| `.portal-chrome` | **TAIP** | PortalPageChrome | **A/B** | Hero chrome klasė |

### 4.5 Test/Demo

| Failas | Klasė | Pastaba |
|--------|-------|---------|
| `src/lib/__tests__/marketplace-filter-url.test.ts` | **C** | Testuoja URL serializaciją su `ca_*` prefix — **PALIKTI** (naudingas regression testas) |
| `e2e/stage183-search-state.spec.ts` | **C** | E2E testas, komentaras "chameleon facets" — **PALIKTI** |

### 4.6 Frozen / NEKEISTI

| Modulis | Kodėl frozen |
|---------|--------------|
| `src/lib/monetization-wardrobe.ts` | Transaction monetizacija — paliečia escrow fees. Frozen backend invariants (Stage 11J). **NELIESTI** |
| `src/lib/payments/*` | Payment provenance, idempotency, caps |
| `src/lib/escrow.ts`, `src/lib/order-agent.ts` | Transaction logic |
| `@vauto/shared/marketplace-domain` | Canonical 13A/13B — shared, ne VAUTO frontend |

## 5. Runtime-reachability analizės išvados

1. **Vertikalūs rezultatų komponentai** (`VehicleListingResults`, `GeneralListingResults`,
   `RealEstateListingResults`, `ClothingListingResults`, `ServiceListingResults`,
   `JobListingResults`) **NĖRA importuojami** niekur aktyviame kode — jie yra
   **DEAD CODE**. Jų portal-native palettes nėra runtime-reachable. Tai reiškia,
   kad jie gali būti saugiai pašalinti arba palikti kaip neaktyvūs (jų spalvos
   niekada nepasiekia vartotojo).

2. **BuddyQuickActions `classic` branch** — `classic` parametras niekada
   neperduodamas `true` (BuddySearchAssistant kviečia be `classic`). Portal-native
   hex spalvos šiame branch yra **DEAD BRANCH**.

3. **`chameleonTheme` state** — nustatomas tik į `"flux"` ir `"wardrobe"` per
   seller flow (VautoContext + SellerFlowContext). Niekada nėra nustatomas į
   `autoplius` / `skelbiu` / `aruodas` / `paslaugos` / `cvbankas` iš produkto
   kodo. Tai reiškia, kad `body.chameleon-autoplius` ir pan. selectors aktyvuojami
   TIK kai `portalExperienceForQuery(searchQuery)` grąžina atitinkamą theme.

4. **`portalExperienceForQuery`** yra pagrindinis portal theme šaltinis — jis
   analizuoja paieškos query ir grąžina theme. Tai **naudinga vertical adaptacijos
   logika** (klasė B), tik su legacy "portal" pavadinimu.

## 6. Rekomenduojama decoupling strategija (Phase B/C/D)

| Prioritetas | Veiksmas | Kodėl |
|-------------|----------|-------|
| 1 | Generalizuoti `categoryToTheme` / `adaptiveKeyToTheme` → `verticalPresentationIdForCategory` / `adaptiveKeyToPresentation` | B klasė — naudinga logika, legacy pavadinimas |
| 2 | Generalizuoti `portalExperienceForQuery` → `verticalExperienceForQuery` | B klasė — query → vertical metadata |
| 3 | Generalizuoti `ChameleonThemeId` → `VerticalPresentationId` (arba palikti alias) | Visur naudojamas tipas |
| 4 | `getPortalUi` → `getVerticalPresentationUi` | Naudinga UI token logika |
| 5 | CSS: pašalinti dead portal selectors (autoplius/skelbiu/aruodas/cvbankas) | A klasė — nenaudojami kai query neaktyvus |
| 6 | CSS: `chameleon-wardrobe` klasę palikti kaip wardrobe skin (naudinga) | Spintos skin |
| 7 | `PortalPageChrome` → `VerticalPageChrome` | B klasė |
| 8 | `PortalExperienceStrip` → `VerticalExperienceStrip` | B klasė |
| 9 | BuddyQuickActions `classic` branch — pašalinti (dead) | A klasė |
| 10 | Vertikalūs ListingResults komponentai — nustatyti statusą (dead) | A klasė |
| 11 | `skelbiuCategory` laukas — palikti (naudinga universal schema) | B klasė |
| 12 | `getSkelbiuMarketSnapshot` — palikti arba pervardinti | B klasė |

## 7. NEIŠTRINTI (būtina išsaugoti)

- `portalExperienceForQuery` logika (vertical detection)
- `categoriesForPortal` / `filterListingsForPortal` (vertical category filter)
- `effectiveChameleonCategory` (vertical inference)
- `categoryToTheme` mapping (category → presentation)
- `getPromoteLabelsForCategory` (promote etiketės)
- `skelbiuCategory` atributas (universali schema)
- `getSkelbiuMarketSnapshot` (rinkos kainos)
- Wardrobe monetizacija (`monetization-wardrobe.ts`) — **frozen**
- URL external-source filtras (`utils.ts`) — saugumas

## 8. FAILAI, KURIUOS GALIMA PAŠALINTI (A klasė, dead code)

1. `src/components/vehicle/VehicleListingResults.tsx` (neimportuojamas)
2. `src/components/general/GeneralListingResults.tsx` (neimportuojamas)
3. `src/components/real-estate/RealEstateListingResults.tsx` (neimportuojamas)
4. `src/components/clothing/ClothingListingResults.tsx` (neimportuojamas)
5. `src/components/services/ServiceListingResults.tsx` (neimportuojamas)
6. `src/components/jobs/JobListingResults.tsx` (neimportuojamas)
7. `BuddyQuickActions.tsx` `classic` branch (dead) — bet komponentas pats naudojamas, reikia išvalyti branch

> **PASTABA**: Prieš šalinant reikia patikrinti, ar nėra dynamic import (`import()`), kurio `rg -l` nepagauna. Žr. §4.6.

## 9. Apribojimai / Frozen

- NEKEISTI: `monetization-wardrobe.ts` (frozen transaction)
- NEKEISTI: `@vauto/shared/marketplace-domain` (canonical 13A/13B)
- NEKEISTI: `payments/*`, `escrow.ts`, `order-agent.ts`
- NEKEISTI: `utils.ts` URL filter (saugumas)
- Testai: `marketplace-filter-url.test.ts`, `stage183-search-state.spec.ts` — PALIKTI

## 10. Patvirtinimai

- [x] Visų 49 chameleon failų analizė
- [x] Visų 39 portal-name failų analizė
- [x] Runtime-reachability nustatymas kiekvienam
- [x] Klasifikacija A–E
- [x] CSS selectors inventory
- [x] Frozen zones nustatytos
