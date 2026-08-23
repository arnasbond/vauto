# VAUTO Stage 20B.1 — DECOUPLING REPORT

Etapas: **20B.1 — LEGACY DECOUPLING & E2E EVIDENCE HARDENING**
Data: **2026-08-20**
Būsena: **COMPLETE**

---

## 1. Santrauka

Šiame etape Chameleon / portal imitation architektūra buvo **saugiai atkabinta**
nuo aktyvaus VAUTO runtime laikantis principo:

> **SUPRASTI → ATSKIRTI → IŠSAUGOTI NAUDINGĄ LOGIKĄ → PAŠALINTI ATMESTĄ
> PORTAL IMITATION SEMANTIKĄ → ĮRODYTI ZERO REGRESSION.**

Naudinga generic marketplace / vertical adaptacijos logika buvo **išsaugota**
ir perkelta į VAUTO-native modulius. Portal-native paletės, portal imitation
UI tekstai ir dead selectors buvo pašalinti. MASTER LIGHT / MASTER DARK
vizualinis etalonas **nepakeistas**.

---

## 2. Architektūra prieš (Chameleon dependency graph)

```
                    ┌──────────────────────────────┐
                    │  chameleon-themes.ts         │
                    │  ChameleonThemeId, THEMES,   │
                    │  categoryToTheme,            │
                    │  getChameleonTheme,          │
                    │  getPromoteLabelsForCategory │
                    └──────────┬───────────────────┘
                               │
          ┌────────────────────┼───────────────────────┐
          │                    │                       │
  ┌───────▼───────┐  ┌─────────▼─────────┐  ┌──────────▼──────────┐
  │ chameleon-    │  │ portal-experience │  │ portal-listing-     │
  │ portal-ui.ts  │  │ .ts               │  │ filter.ts           │
  │ PORTAL_UI,    │  │ EXPERIENCES,      │  │ categoriesForPortal,│
  │ getPortalUi   │  │ portalExperience  │  │ filterListings...   │
  └───────┬───────┘  │ ForQuery          │  └──────────┬──────────┘
          │          └─────────┬─────────┘             │
          ▼                    ▼                       ▼
   ┌────────────────────────────────────────────────────────┐
   │  AKTYVŪS KOMPONENTAI                                    │
   │  AiCommandBar, ListingGrid, ProListingCard,             │
   │  SmartPromoteModal, discover, ChameleonThemeHost,       │
   │  useActivePortal, PortalPageChrome, PortalExperience    │
   │  Strip, Vehicle/RealEstate/Clothing/Service/General     │
   │  ListingResults, ConfirmationShell, BuddyQuickActions,  │
   │  NotificationBell, EscrowModal, LiveInterventionHost,   │
   │  ProfileSpintaSwitch, Wardrobe* (4×)                    │
   └────────────────────────────────────────────────────────┘
```

Papildomai: `globals.css` turėjo portal-native paletes
(`--chameleon-accent` autoplius mėlyna `#1167b1`, skelbiu mėlyna `#1664b1`,
aruodas raudona `#c62828`, paslaugos, cvbankas, `#ffc107` geltona ir kt.),
priskirtas per `body.chameleon-*` class'us.

---

## 3. Kas pašalinta (portal imitation semantics)

### 3.1 CSS — portal-native paletės

| Selector / token | Veiksmas |
|------------------|----------|
| `body.chameleon-autoplius` / `-skelbiu` / `-aruodas` / `-paslaugos` / `-cvbankas` spalvų blokai | Pašalintos portal-native paletės — visos vertikalės dabar naudoja DS 2.0 tokenus |
| `--chameleon-accent` (autoplius mėlyna) | Remapinta į `var(--vauto-primary, #10b981)` (emerald) |
| `.chameleon-aruodas-media img`, `.chameleon-wardrobe-media img` | Pašalinti (DEAD selectors — įrodytas runtime unreachability) |
| `.chameleon-details-panel` | Pašalintas (DEAD) |
| `.portal-listing-card:hover` | Pašalintas (DEAD) |
| `.nt-wizard-chip:hover` (raudona `#c62828`) | Migruota prie emerald |
| `.nt-wizard-option-row-selected` | Migruota prie emerald |
| `.nt-wizard-next-btn` (`#ffc107` geltona) | Migruota prie emerald |
| `.chameleon-wizard-shell` | Pašalintas (DEAD) |

Išliko: `chameleon-flux` ir `chameleon-wardrobe` body class'ai — tačiau jie
dabar abu nukreipia į DS 2.0 tokenus (`--chameleon-accent: var(--vauto-primary)`).
Tai funkcionaliai reikalinga (fashion/Spinta vertical body class), bet be
jokios portal-native paletės.

### 3.2 Komponentų portal imitation šakos

| Komponentas | Pašalinta |
|-------------|-----------|
| `BuddyQuickActions.tsx` | `classic` + `themeId` props ir portal-native hex šakos (dead branch — niekada neperduodama `classic=true`) |
| `ProfileSpintaSwitch.tsx` | Fuchsia/violet (Vinted-imitation) paletė → DS2 emerald tokenai; tekstas "Kelių portalų sinchronizacija" → "Vieninga skelbimų sinchronizacija" |
| `WardrobeCabinetGrid.tsx` | `ACCENT #09b1a8` konstanta → `var(--vauto-primary, #10b981)` |
| `WardrobeDealStepper.tsx`, `VisibilityBooster.tsx`, `SecretaryWarmGreeting.tsx` | `ACCENT #09b1a8` → `var(--vauto-primary, #10b981)` |

---

## 4. Kas generalizuota (preserve function, remove wrong semantics)

| Legacy semantika | VAUTO-native pakaitalas | Kodėl |
|------------------|-------------------------|-------|
| `chameleon-themes.ts` (`ChameleonThemeId`, `THEMES`, `categoryToTheme`, `adaptiveKeyToTheme`, `getChameleonTheme`) | `vertical-presentation.ts` (`VerticalPresentationId`, `verticalPresentationForCategory`, `verticalIdToLegacyTheme`) | Category → presentation metadata yra naudinga logika; portal-imitation pavadinimas pašalintas. `chameleon-themes.ts` liko kaip **compatibility bridge** frozen moduliams (monetization-wardrobe, wardrobe-cabinet-mode, VautoContext state) |
| `chameleon-portal-ui.ts` (`getPortalUi`, `PORTAL_UI`) | `vertical-presentation.ts` (`getVerticalUi`, `VerticalUiTokens`) | Per-portal visual tokens → per-vertical UI tokens, visos vertikalės emerald. Bridge išlaiko `portalName` deprecated lauką |
| `portal-experience.ts` (`portalExperienceForQuery`, `EXPERIENCES`) | `vertical-presentation.ts` (`verticalExperienceForQuery`, `VERTICAL_EXPERIENCES`) | Query → vertical metadata naudinga; pavadinimas generalizuotas. Bridge išlaiko `theme`/`portalName` deprecated laukus |
| `portal-listing-filter.ts` (`categoriesForPortal`, `filterListingsForPortal`, `sanitizeSearchQuery`, `inferStrictCategory`) | `vertical-listing-filter.ts` (`categoriesForVertical`, `filterListingsForVertical`, `sanitizeSearchQuery`, `inferStrictCategory`) | Vertical listing filtering — naudinga; modulis pervadintas, senasis — bridge |
| `useActivePortal.ts` | `useActiveVertical` (hook viduje; failas išlaikytas kaip re-export) | Aktyvaus vertical nustatymas — naudinga |
| `PortalPageChrome.tsx` | `VerticalPageChrome` (eksportuojamas iš to paties failo) | Hero chrome adaptacija |
| `PortalExperienceStrip.tsx` | `VerticalExperienceStrip` | Vertical quick-pick juosta |
| `ChameleonThemeHost.tsx` | Naudoja `getVerticalPresentation`/`getVerticalUi`/`verticalExperienceForQuery`; body class'ai susiaurinti į `VERTICAL_BODY_CLASSES` (`flux`, `wardrobe`) | Body class nustatymas — funkcionaliai reikalingas |
| `effectiveChameleonCategory` (marketplace-view) | `effectiveVerticalCategory` | Vertical inference |
| `getPromoteLabelsForCategory` | `verticalPromoteLabels` (per vertical-presentation) | Promote etiketės pagal kategoriją |
| `smart-promote.ts` | Importuoja iš `vertical-presentation` | Promote monetizacijos logika |
| `ConfirmationShell.tsx` | `getVerticalPresentation("marketplace")` vietoje `getChameleonTheme("flux")` | Post-publish celebration |
| `ProListingCard.tsx` | `bg-[var(--ds-brand)]` badge spalva | Badge spalva be portal temų |
| `ListingGrid.tsx` | `getVerticalUi`/`verticalExperienceForQuery` + `VerticalPresentationId` switch | Tuščios būsenos žinutės |
| `AiCommandBar.tsx` | `getVerticalUi`/`verticalExperienceForQuery` | Search border spalva |
| `VehicleListingResults` ir kt. (5 vertikalės) | `getVerticalUi("transport")` / `("real_estate")` / `("fashion")` / `("services")` / `("goods")` | Fixed portal → fixed vertical |
| `marketplace-filter-url.ts` | Komentarai "chameleon attr" → "category attr" | URL `ca_<key>` prefix yra **persistence kontraktas** — NEKEISTAS (deep-link compat) |

---

## 5. Kas sąmoningai palikta ir kodėl

| Modulis | Kodėl palikta |
|---------|---------------|
| `chameleon-themes.ts`, `chameleon-portal-ui.ts`, `portal-experience.ts`, `portal-listing-filter.ts` | **Compatibility bridges** su `@deprecated` žymėmis. Frozen moduliai (`monetization-wardrobe.ts`, `wardrobe-cabinet-mode.ts`) ir runtime state (`VautoContext.chameleonTheme`, `VautoBridge`) lygina `theme === "wardrobe"` — jų perrašymas pažeistų Stage 11J frozen transaction invariants |
| `monetization-wardrobe.ts`, `wardrobe-cabinet-mode.ts`, `SubscriptionGuard.ts` | **Frozen backend / trust boundary** (Stage 11J–11J.5). Neliesta — dependency atkabinta iš UI pusės, ne iš backend |
| `VautoContext.chameleonTheme` runtime state | Sėklinė state reikšmė (`"flux"`/`"wardrobe"`) naudojama seller flow ir fashion/Spinta kontekstui. Palikta kaip runtime state per bridge |
| `chameleon-flux` / `chameleon-wardrobe` body class'ai | Funkciškai reikalingi body class'ai (fashion/Spinta). Paletės jau suvienodintos su DS2 emerald |
| `skelbiuCategory` schema laukas | Universali skelbimų schema — naudingas laukas su legacy pavadinimu; DB/persistence kontraktas |
| `getSkelbiuMarketSnapshot` ir kt. | Rinkos kainų logika — naudinga |
| `utils.ts` external URL filtras (autoplius./aruodas./skelbiu./cvbankas.) | **Saugumo funkcija** — importo URL filtras; pašalinus būtų saugumo regresija |
| `ca_<key>` URL prefix | **Persistence kontraktas** — deep-link/URL serializacija; keitimas reikalautų DB/URL migracijos (ne šio etapo tikslas) |

---

## 6. NAUDINGA LOGIKA, KURI NEPRARASTA (inventorius)

- Query → vertical detection (`verticalExperienceForQuery`)
- Category → presentation mapping (`verticalPresentationForCategory`)
- Vertical listing filtering (`verticalRankedListings`, `filterListingsForVertical`)
- Vertical UI tokens (`getVerticalUi`)
- Promote etiketės (`verticalPromoteLabels`)
- AI facet interpretacija (`ai-facet-interpretation.ts`) — nepaliesta
- Canonical facets / URL ownership (`useCanonicalFacetUrl`, `marketplace-filter-url`) — nepaliesta
- Search state (Stage 18.3) — nepaliesta
- Deal Room / escrow / transaction UI — nepaliesta (frozen)
- Fashion/Spinta wardrobe monetizacija — nepaliesta (frozen)

---

## 7. Prieš / po dependency evidence

### Prieš (Stage 20B pabaiga)

```
rg -c "chameleon" src/  →  49 failai
rg -c "autoplius|aruodas|skelbiu|vinted|cvbankas" src/  →  39 failai
getPortalUi() vartotojai: ListingGrid, AiCommandBar, useActivePortal,
  VehicleListingResults, RealEstateListingResults, ClothingListingResults,
  ServiceListingResults, GeneralListingResults, PortalPageChrome,
  ChameleonThemeHost
categoryToTheme vartotojai: ProListingCard, SmartPromoteModal
```

### Po (Stage 20B.1 pabaiga)

```
rg -c "chameleon" src/  →  likę TIK:
  - compatibility bridges (chameleon-themes, chameleon-portal-ui)
  - frozen moduliai (monetization-wardrobe, wardrobe-cabinet-mode)
  - runtime state (VautoContext, VautoBridge, SubscriptionGuard)
  - body class naudojimai (flow-ui-skin, TopAiCommandChrome, GuestFashionCabinet)
rg "getPortalUi|categoryToTheme|portalExperienceForQuery" src/  →  0 aktyvių naudojimų
rg "getVerticalUi|verticalExperienceForQuery|verticalPresentationForCategory" src/  →  aktyvūs naudojimai
```

Pilnas žemėlapis: `LEGACY-DEPENDENCY-MAP.md` §4.

---

## 8. Regresijos įrodymai

| Gate | Rezultatas |
|------|-----------|
| `npm run build` | **PASS** (85 puslapiai) |
| `npm run lint` | **PASS** (tik 4 pre-existing hook dependency warnings) |
| `npx tsc --noEmit` | **PASS** |
| Frontend unit testai | **66/66 PASS** |
| Targeted E2E (search-state, smoke, payments, UI snapshots, 17/18 rinkiniai) | **PASS** (žr. `E2E-FAILURE-CLASSIFICATION.md`) |
| Critical regression suites (12A/12B/13A/13B/13C) | **PASS** |
| Pilnas `e2e-legacy` run | **172 passed**, 5 failed (visi ENVIRONMENT/TEST klasės — žr. klasifikaciją), 3 skipped |
| Visual regression (LIGHT/DARK × 1440/390, HOME/SEARCH/DETAIL/DISCOVER/DEAL ROOM/AI SEARCH) | **PASS** — 0 horizontal overflow |
