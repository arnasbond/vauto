# VAUTO Stage 20B.1 — FINDINGS

Etapas: **20B.1 — LEGACY DECOUPLING & E2E EVIDENCE HARDENING**
Data: **2026-08-20**
Būsena: **COMPLETE**

---

## 1. Pagrindiniai radiniai

### 1.1 Chameleon yra deprecated legacy, ne frozen simulation zones

Stage 20B dokumentacija klaidingai interpretavo Chameleon / Autoplius /
Aruodas / Skelbiu / Vinted / CVBankas imitacijas kaip "frozen simulation
zones". Tai yra **atmestų ankstesnių VAUTO koncepcijų legacy kodas**.
Dabartinė produkto kryptis: ONE VAUTO, ONE DS 2.0, MASTER LIGHT/DARK,
EMERALD identity.

**Dokumentacijos korekcija atlikta**: `docs/visual-drift-register-20B.md`
L-1 eilutė pataisyta.

### 1.2 Chameleon semantika buvo persipynusi su aktyviu runtime

Dependency graph parodė, kad Chameleon simboliai pasiekia 10+ aktyvių
komponentų (AiCommandBar, ListingGrid, ProListingCard, SmartPromoteModal,
discover, ChameleonThemeHost, useActivePortal, PortalPageChrome,
PortalExperienceStrip, 5 vertikalės ListingResults, ConfirmationShell,
BuddyQuickActions, NotificationBell, EscrowModal, LiveInterventionHost,
ProfileSpintaSwitch, 4× Wardrobe*). Todėl masinis delete buvo uždraustas —
atlikta surgical decoupling.

### 1.3 Naudinga logika slepiasi po legacy pavadinimais

| Legacy pavadinimas | Realus tikslas | Sprendimas |
|---------------------|----------------|------------|
| `categoryToTheme(category)` | Category → presentation metadata | `verticalPresentationForCategory` |
| `portalExperienceForQuery(query)` | Query → vertical metadata | `verticalExperienceForQuery` |
| `getPortalUi(id)` | Vertical UI tokens | `getVerticalUi(id)` |
| `categoriesForPortal` | Vertical category scoping | `categoriesForVertical` |
| `effectiveChameleonCategory` | Vertical inference | `effectiveVerticalCategory` |

Visa logika **išsaugota** naujuose VAUTO-native moduliuose.

### 1.4 Portal-native paletės buvo runtime pasiekiamos per CSS

`globals.css` turėjo portal-native paletes (autoplius mėlyna `#1167b1`,
skelbiu mėlyna, aruodas raudona `#c62828`, `#ffc107` geltona ir kt.)
per `body.chameleon-*` class'us. Nors `chameleonTheme` state praktiškai
niekada nenustatomas į `autoplius`/`skelbiu`/`aruodas`/`paslaugos`/`cvbankas`
iš produkto kodo, `portalExperienceForQuery(searchQuery)` galėjo grąžinti
atitinkamą theme ir aktyvuoti portal-native spalvas. Pašalinta.

### 1.5 Frozen moduliai lieka nepaliesti

`monetization-wardrobe.ts`, `wardrobe-cabinet-mode.ts`, `SubscriptionGuard.ts`,
`VautoContext.chameleonTheme` state — Stage 11J frozen invariants. Jie
lygina `theme === "wardrobe"` (fashion vertikalės mokesčių taisyklė).
Prieiga išlaikyta per compatibility bridges — backend invariants **nepaliesti**.

### 1.6 E2E evidence gap turėjo dvi atskiras šaknis

1. **Stale results-label assertion** (smoke) — TEST klasė, pataisyta pagal
   produkto contract (`formatResultsLabel` nuo Stage 14).
2. **`real_estate` kortelių dingimas** (stage183) — FIXTURE/SERVER klasė:
   neteisingas build (`npm run build` be `NEXT_PUBLIC_SHOW_DEMO_CATALOG=true`).
   Su `npm run build:e2e` — 13/13 PASS.

### 1.7 Ankstesni non-pass testai turėjo tris atskiras priežastis

- `payment-methods-settings`: TEST (responsive contract + ambiguūs lokatoriai)
- Stage 13B/C rerun'uose: SERVER (static serverio kritimas dėl disko pilnumo)
  ir ENVIRONMENT/FIXTURE (stale harness su persistavusia būsena)
- `ops-guard`: ENVIRONMENT (production rate-limit 429)

---

## 2. Pakeitimų įtaka MASTER UI

**Nulis.** MASTER LIGHT / MASTER DARK etalonas nepakeistas. Visi pakeitimai
buvo: (a) portal-native paletės → DS2 emerald (visos vertikalės dabar
vienodai emerald), (b) legacy importai → VAUTO-native moduliai (tas pats
render), (c) dead selectors pašalinti. 18P + 20B.1 visual evidence patvirtina
0 overflow ir 0 theme mismatch.

---

## 3. Žinomas likęs skolos (Known debt)

| Skola | Pastaba |
|-------|---------|
| `chameleon-*` pavadinimai compatibility bridges | `@deprecated` žymėti; bus pašalinti kai frozen moduliai migruos (Stage 11J rewrites — NE šio etapo darbas) |
| `chameleonTheme` runtime state pavadinimas | Persistence kontraktas su seller flow / VautoContext; perrašymas reikalautų state migracijos |
| `ca_<key>` URL prefix | Persistence kontraktas (deep-link); keitimas — DB/URL migracija |
| `skelbiuCategory` / `getSkelbiuMarketSnapshot` pavadinimai | Naudinga logika su legacy pavadinimais; kosmetinė renaming ateityje |
| `portalName`/`theme` deprecated laukai `VerticalExperience`/`VerticalUiTokens` | Laikini compatibility tiltai su `@deprecated` žyme |
| `ops-guard.spec.ts` priklausomybė nuo live production API | Testas teisingas pagal paskirtį (production guard), bet nestabilus local CI dėl rate-limit |
| Screenshot file-lock flakiness (Windows) | ENVIRONMENT; retry pavieniui deterministiškas |

---

## 4. Ko NEbuvo padaryta (pagal STRICT SCOPE)

- NEkurta: AI Tool Registry, Visual Search, Wanted Matching, Business
  Cabinet, Voice, nauji AI agentai.
- NEperrašyti: frozen backend (Stage 11J–11J.5), canonical facet model,
  URL ownership, search state, Stage 13A/13B domain registry.
- NEkeista: MASTER vizualinis etalonas, emerald identitetas, tema.
- Jokios DB migracijos — migration observability liko READ-ONLY.
