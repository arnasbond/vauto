# STAGE 18.1 — HARDENING DELTA

**Status:** IMPLEMENTED — READY FOR INDEPENDENT AUDIT
**Date:** 2026-08-19
**Branch:** audit/stage16-security-ops (Stage 18.1 delivered as working-tree delta on top)
**Scope:** Siaura hardening delta. Jokio redesign, jokio naujo feature, jokio frozen-core liecimo.

---

## 1. Audit findings addressed

| ID | Finding | Verdict |
|----|---------|---------|
| MEDIUM-1 | Stage 18 AI interpretacijos sluoksnyje buvo vietinis `detectVerticalFn()` su rankomis aprašytais kategorijų raktažodžiais → semantic-drift rizika | **Fixed** |
| MEDIUM-2 | `SHIPPABLE_VERTICALS` `listing-capabilities.ts` → antras capability registry | **Fixed** |
| TEST 18N-9 | `if (cardCount > 0)` gali PASS net su 0 real-estate kortelių | **Fixed** |
| TEST 18N-14 | Chip count paimtas netinkamu momentu; klaviatūros accessibility neįrodyta | **Fixed** |
| TEST 18N-17 | Tik `#listing-results` egzistavimas → per silpnas Back/Forward įrodymas | **Fixed** |
| TEST LIGHT/DARK | `await toggle.isVisible().catch(() => true)` klaidą paverčia TRUE | **Fixed** |
| SPECIAL MEDIA/MAP | Tušti media plotai ir neužpildytas map screenshotuose | **Triage: fixture/test-env** |

---

## 2. MEDIUM-1 — REMOVE DUPLICATED VERTICAL SEMANTICS

**Audit finding:** `detectVerticalFn()` Stage 18 AI interpretacijos sluoksnyje buvo
nepriklausomas kategorijų tiesos šaltinis (rankomis aprašyti raktažodžiai), nors
Stage 13A turi canonical marketplace domain registry.

**Root cause:** vietinis vertikalės detektorius kartojo kategorijų semantiką, kuri
jau apibrėžta 13A domain promaine. Bet koks raktažodžių nukrypimas nuo canonical
modelio kurtų semantic-drift (funkcija ir registry nesutaptų).

**Fix:** vietinis `detectVerticalFn()` pašalintas. Vietoje jo Stage 18 AI
interpretacija naudoja `resolveAiVertical()` iš naujo adapterio
`shared/…` canonical registro pagrindu. Adapteris yra **grynas NL→canonical
sinonimų adapteris** ir **NEdeklaruoja** kategorijų struktūros ar capability
taisyklių — jis tik:
- atpažįsta natūralios kalbos sinonimą,
- rezoliuoja į canonical `VerticalId` per `resolveVerticalId()`,
- verčia į canonical listing category per `listingCategoriesForVertical()` /
  `VERTICAL_TO_LISTING_CATEGORY()`,
- grąžina `ListingCategory` → `MarketplaceFilterState.category`.

**Canonical source, dabar naudojamas:**
- `shared/marketplace-domain/registry.ts` → `CANONICAL_VERTICALS` (vertikalių rinkinys)
- `shared/marketplace-domain/legacy.ts` → `resolveVerticalId()`
- `shared/marketplace-domain/listing-flow.ts` → `VERTICAL_TO_LISTING_CATEGORY`
- `shared/marketplace-domain/facet-query.ts` → `listingCategoriesForVertical()`
- `MarketplaceFilterState` (`src/lib/marketplace-view.ts`) yra vienintelis filtro target'as

**Pataisyti komentarai:** `ai-facet-interpretation.ts` docstring aiškiai nurodo,
kad vertikalė rezoliuojama `resolveAiVertical` (adapteris virš canonical registro),
t. y. nėra antro tiesos šaltinio.

**NL supratimo užtikrinimas (audito pavyzdžiai):**
- `"2 kambarių butas Vilniuje iki 120000"` → `real_estate`
- `"MacBook Pro M3 Max"` → `electronics`
- `"ekonomiškas dyzelinis universalas iki 7000"` → `vehicles`
- `"ekskavatoriaus nuoma Kaune"` → `services` (sureguliuota: „nuoma“ be
  gyvenamojo daiktavardžio = paslauga/įranga; „butas/namas/sklypas nuomai“ = NT)

---

## 3. MEDIUM-2 — REMOVE DUPLICATED CAPABILITY TRUTH

**Audit finding:** `SHIPPABLE_VERTICALS` konstanta `listing-capabilities.ts` galėjo
tapti antru capability registry.

**Root cause:** siuntimo/delivery capability buvo apibrėžta lokaliai, nors Stage
13A canonical capability modelis (`VERTICAL_CAPABILITIES[vertical].supportsShipping`)
jau yra vienintelis siuntimo politikos šaltinis.

**Fix:** lokali `SHIPPABLE_VERTICALS` pašalinta. `isShippableGoods()` ir
`hasDeliveryCapability()` dabar tiesiogiai vartoja **`canUseShipping(category)`**
iš `@vauto/shared/marketplace-domain` (fail-closed — nežinoma kategorija ⇒ false).

**Canonical source, dabar naudojamas:**
- `shared/marketplace-domain/capabilities.ts` → `VERTICAL_CAPABILITIES` /
  `FAIL_CLOSED_CAPABILITIES`
- `shared/marketplace-domain/queries.ts` → `canUseShipping()`

**Užtikrinta UX (be pokyčių vartotojui):**
- REAL ESTATE → location-oriented, jokio klaidingo Omniva/shipping CTA.
- SERVICES → location / remote pagal capability.
- JOBS → location / remote / hybrid pagal capability.
- PHYSICAL GOODS (ELECTRONICS / HOME_GARDEN) → delivery/shipping tik kai canonical
  `supportsShipping` leidžia; clothing/tools fail-closed false.

Stage 11J transaction semantics nepaliestos.

---

## 4. TEST HARDENING

### 18N-9 — deterministinis RE kortelės + „jokio Omniva“ įrodymas
- **Pataisyta:** `re` stub dabar deterministiškai pina `lt-nt-004`
  („1 kambario butas studentams“, Telšiai, canonical REAL_ESTATE/Butas) su užklausa
  `"butas Telšiai"`. Tai canonical 13A/13B **tikras match** — kortelė VISADA privalo
  renderintis.
- **Asertuojama:** `realEstateCardCount > 0` (niekada NEpasiduoda su 0 kortelių),
  tada `cards.getByText(/Omniva|Pristatymas/i)` = 0.
- **Root cause buvo:** ankstesnė užklausa `"butas Vilnius"` canonical filtru nieko
  neatitiko (Vilniuje kataloge nėra „Butas“ — tik Sodyba ⇒ 0 rezultatų ireguliaru).

### 18N-14 — klaviatūra realiai pašalina AI facet chip
- Fiksuoja `BEFORE` = chip skaičių, **fokusuoja** remove valdiklį klaviatūra,
  spaudžia **Enter**, fiksuoja `AFTER`, asertuoja `AFTER == BEFORE - 1`,
  tikrina, kad `location` chip dingęs ir `MarketplaceFilterState/URL/UI`
  atitinkamai atnaujinti. Jokių mouse-only veiksmų.

### 18N-17 — Back/Forward išsaugo realų search/facet/view state
- Prieš navigaciją užfiksuota: vertikalė (chipo `Nekilnojamasis` tekstas), AI facet
  (location), classic facet (`propertyType`), view mode (`Tinklelis`/`Sąrašas`)
  — realios DOM reikšmės, ne tik container egzistavimas.
- `grid → list` (pushState) → `goBack()` tikrina State A → `goForward()` tikrina
  State B. Asertuojamos **realios reikšmės** (chips, `aria-pressed`, grid/list DOM).

### LIGHT/DARK — realus theme signalas, ne `.catch(()=>true)`
- Realiai nustato LIGHT (`vauto_app_theme_v1`), tikrina `html[data-app-theme]="light"`,
  perjungia į DARK ir tikrina `"dark"`, grįžta į LIGHT ir tikrina `"light"`,
  patvirtina, kad legacy `vauto-original` normalizuojasi į `light` (nėra trečios temos).
- Jokio assertion, kuris klaidą paverčia TRUE.

### DELTA FIXTURE — determinizmas statiniame harness'e
- **Root cause flakiness:** (1) E2E `webServer` tiekia **stale static build** —
  pradiniai probe'ai testavo seną bundle, kuriame RE pins niekada nerenderino;
  (2) `re` fixture užklausa neatitiko katalogo.
- **Fix:** `re` stub → `lt-nt-004` + `"butas Telšiai"` (tikras match). Stage 18 E2E
  dabar **16/16 deterministiškai** per 3 iš eilės paleidimus.

---

## 5. SPECIAL CHECK — MEDIA / MAP (fixture vs production)

**Verdiktas: TEST-FIXTURE / TEST-ENVIRONMENT problema, NE production regresija.**

Pagrindimas:
- Statinio export harness'o `/search` deep-link (net `?category=real_estate`) rodo
  „Tiesioginių skelbimų dar nėra“ ir 0 kortelių, nes rezultatai užpildomi tik per
  homepage → typed-search → agent-pin eigą; `/search` be tokio konteksto nebūna
  užpildytas. Tai harness architektūra, ne produkcija.
- Nuotraukos (`https://images.unsplash.com/…`) ir map tiles statiniame/offline
  harness'e neįkeliamos (network bloque), todėl screenshotuose matomi tušti media
  plotai ir tuščias map. Atvirame statiniame eksporte nuoroda yra, bet testų aplinkoje
  turinys negautas.
- **Nedaryta jokio production architektūros keitimo** — tai leista audito sąlygose
  („Jeigu tik fixture/test-environment problema: dokumentuoti, nekeisti production
  architektūros be reikalo“).
- Tai NEKEIČIA atskiro Media/Image Performance Audit, kuris lieka suplanuotas prieš
  final production release gate.

---

## 6. REGRESSION & DETERMINISM — VYKDYTA IR REZULTATAI

| Patikra | Rezultatas |
|---------|-----------|
| `npx tsc --noEmit` | **PASS** |
| `npm run lint` | **PASS** (tik pre-existing warnings) |
| `npm run test:unit:frontend` | **27/27 PASS** |
| Stage 13A `test:category-domain` | **PASS** |
| Stage 13B `test:faceted-search` | **23 pass / 0 fail** (1 DB-gated EXPLAIN skip) |
| Stage 17 design-system + 17.1 view-state + AI-failure E2E | **15/15 PASS** |
| Stage 17 accessibility E2E | **4/4 PASS** |
| Stage 18 E2E (all 18N) | **16/16 PASS** — 3 kartus iš eilės |
| Production frontend build (`npm run build`) | **PASS** |
| Static export build (`npm run build:e2e`) | **PASS** |

**Nėra** „expected failure“, „probably okay“ ar „passes if data exists“ —
pagrindiniai testai deterministiški.

---

## 7. VISUAL REGRESSION

Stage 18.1 pakeitimai UI **nepakeitė**: MEDIUM-1 yra adapterio refaktorius
(grąžina tas pačias `ListingCategory` reikšmes), MEDIUM-2 yra capability
išvedimas iš canonical (ta pati UX). Visi Stage 17/18 E2E (įskaitant responsive,
LIGHT/DARK, overflow=0, grid columns, keyboard, Back/Forward) PASS —
to pakanka **NO VISUAL REGRESSION** įrodymui. Naujo milžiniško screenshot rinkinio
nesukurta (leidžiama sąlygose: „jeigu pakeitimai nepakeitė vizualo“, pakanka
function-run įrodymo).

---

## 8. STRICT FREEZE — PATVIRTINIMAS

- **Stage 11J frozen core (transaction/payment/webhook/ledger):** NEPALIESTA.
- **DB migracijos:** NĖRA naujų; jokios migracijos nekurtos/neliestos.
- **Stage 13A/13B canonical modelis:** NEPERRAŠYTAS; Stage 18.1 bei Stage 18
  **PRIJUNGIA** prie jo per adapterius.
- **Jokia nauja parallel marketplace/domain sistema** nesukurta.
- **Classic categories/filters/sorting/List-Grid-Map/manual listing/AI search/
  editable AI facets:** visi išlaikyti (16/16 Stage 18 E2E patvirtina).
- **Produkto principas „AI padeda. Žmogus sprendžia.“**: nepakeistas.

---

## 9. DELETE HYGIENE & canonicity

Working-tree delta (Stage 18 + 18.1) atskirtas nuo ankstesnio (pre-existing)
reikšmingo `git diff` foto-darbų (`docs/ui-*.png`). Stage 18.1 **specifiškai** pakeisti:

**Source (MEDIUM-1 / MEDIUM-2):**
- `src/lib/ai-facet-interpretation.ts` — ADAPTER, ne detektorius; canonical 13A.
- `src/lib/listing-capabilities.ts` — capability iš canonical `canUseShipping`; jokio lokalaus registry.
- `src/lib/ai-vertical-adapter.ts` — NL→canonical adapteris (yra darbo medyje).

**Testai (test-evidence hardening):**
- `e2e/helpers/stage12b-comprehension.ts` — `re` fixture deterministinė.
- `e2e/stage18-ai-native.spec.ts` — 18N-9/18N-7/18N-17 tikrosios reikšmės.
- `src/lib/__tests__/ai-vertical-adapter.test.ts` — adapteris + NL pavyzdžiai.

**Canonical šaltiniai (naudojami, nepaliesti):**
- `shared/marketplace-domain/registry.ts`, `legacy.ts`, `listing-flow.ts`,
  `facet-query.ts`, `capabilities.ts`, `queries.ts`, `types.ts`.

---

*ETAPAS 18.1 — READY FOR INDEPENDENT AUDIT.*
