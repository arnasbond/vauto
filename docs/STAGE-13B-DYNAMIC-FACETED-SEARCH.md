# Stage 13B — Dynamic Faceted Search & Filters

**Status:** `ETAPAS 13B IMPLEMENTED — AWAITING INDEPENDENT AUDIT`

13B yra end-to-end grandinė, ne UI dekoracija:

13A canonical schema → dynamic facet UI → URL state → server-side validation → authoritative query → teisingi rezultatai → URL hydration / reload.

13A registras `shared/marketplace-domain/` naudojamas **read-only**. Šiame etape **nekeista** atributų semantika ir capabilities.

Sertifikuotos ribos (neliesta): ETAPAS 11J (`server/src/payments/`, ledger, Stripe webhook / provenance, migracijos 058–061), 12A terminija, 12B tuščios paieškos validacija, 13C Universal Deal Room.

## 1. Canonical facet generation

UI: `src/components/marketplace/FacetFilterPanel.tsx`

Šaltinis: `getFilterableAttributes(verticalId)` iš 13A (`shared/marketplace-domain/queries.ts`).

Generuojama tik kai `filterable === true`. `searchable` vienas pats filtro nekūria.

| Tipas | Kontrolė |
| --- | --- |
| `enum` | `Select` |
| `multi_enum` | checkbox grupė |
| `number` / `range` | min / max |
| `boolean` | checkbox |
| `location` / `string` | tekstinis laukas, tik jei filterable |

Desktop: sidebar `DesktopHomeLayout` + `MarketplaceFilterBar surface="desktop"`.  
Mobile (~375 px): drawer / `Modal` su CTA **„Taikyti filtrus“**.

## 2. Server-side validation

Parseris (vienas autoritetas): `shared/marketplace-domain/facet-query.ts` → `parseFacetSearchParams`.

HTTP: `server/src/marketplace/facet-http.ts` → `GET /api/search/listings`.

Žingsniai: resolve `VerticalId` → `getFilterableAttributes` → key / type / enum / range → normalizacija → query. Frontend validacija nėra autoritetas.

## 3. URL serialization (viena forma visur)

```
?vertical=real_estate&rooms=2&area_min=45&sort=newest&q=butas
```

- Vertikalė: `vertical={uiSlug}` (`real_estate`, `electronics`, …).
- Multi-select: **pakartoti raktai** (`fuelType=Benzinas&fuelType=Dyzelinas`), ne kablelių sąrašas.
- Rėžiai: `{key}_min` / `{key}_max`.
- Rezervuoti: `vertical`, `verticalId`, `q`, `sort`, `page`, `limit`.
- Helperiai: `serializeFacetSearchParams` / `parseFacetSearchParams` / `src/hooks/useCanonicalFacetUrl.ts`.

## 4. Invalid facet policy

**API:** HTTP **400** `{ ok: false, issues }` — nežinomas raktas, nesuderinamas raktas (pvz. JOBS + `mileage`), blogas enum, min>max, NaN, schema min/max pažeidimas, `invalid_sort`.

**UI hydration:** netinkami raktai nuimami; paliekami `vertical` ir `q`, kad deep-link vis tiek atsidarytų.

Nežinomas facet **niekada** netampa SQL identifikatoriumi.

## 5. Range validation

Fail-closed 400:

- `area_min=100&area_max=20` → `range_order`
- `mileage_max=-1` → `min` (schema `min: 0`)
- `salaryMin=abc` → `invalid_type`
- `year_min=999999999` → `max` (schema `max: 2100`)

SQL fragmentas negeneruojamas, kol parseris ne `ok`.

## 6. Enum validation

Reikšmės tik iš 13A `options` allowlist.

- Electronics `condition`: `Naujas` \| `Naudotas` \| `Patenkinama`
- `condition=HACKED` ir `condition=USED` → `invalid_enum` (400)

## 7. Query mapping

Facet key visada parametras: `attributes->>$n`, niekada `WHERE ${facetKey}`.

Kategorijos: `listingCategoriesForVertical` (`TRANSPORT` → `transport` + `vehicles` — tai listing-category alias, ne 13A semantikos keitimas).

Tekstas `q`: `ILIKE` su escape, AND su facetais.

## 8. SQL / injection guardrail

- `ORDER BY` tik iš `FACET_SORT_SQL` literalų: `created_at DESC` | `price ASC` | `price DESC`.
- Sort allowlist: `relevance` | `newest` | `price_asc` | `price_desc` (alias `cheapest` → `price_asc`).
- Direction nėra laisvas string.
- `LIMIT` / `OFFSET` parametrizuoti. `MAX_FACET_PAGE_SIZE = 50`.
- Vienas `SELECT` + `COUNT(*) OVER()` — nėra N+1.

## 9. Pagination policy

- Default `page=1`, `limit=24`.
- Faceto / vertikalės keitimas UI: `resetFacetPage` → `page=1`.
- `page=4` URL + naujas facetas: `page` iškrenta (serialize nerašo `page=1`).
- „Išvalyti filtrus“: nuima vertical-specific predicatus, **palieka** `vertical` ir paieškos tekstą `q`, resetina `page`.

## 10. Sort policy

Veikia kartu su facetais (neinumeta filtrų). Neteisingas sort → 400 `invalid_sort`.

## 11. Result correctness

Deterministiniai fixture: `shared/marketplace-domain/facet-fixtures.ts`.

| Filtras | Grąžina | Negrąžina |
| --- | --- | --- |
| `vertical=real_estate&rooms=2` | `nt-a`, `nt-c` | `nt-b` |
| `vertical=electronics&condition=Naudotas` | `el-used` | `el-new` |
| `vertical=transport&mileage_max=100000` | `tr-low` | `tr-high` |

HTTP fixtures: `FACET_SEARCH_FIXTURES=1`. Production: tas pats parseris + `buildFacetSqlPlan`.

## 12. Mobile drawer

375 px: atidaryti → pasirinkti → **Taikyti filtrus** → uždaryti. `Modal` turi focus trap ir Escape. Uždarius fokusas grįžta į `[data-facet-drawer-trigger]`. Horizontal overflow ≤ 1 px (E2E Test D).

## 13. Performance

- Filtravimas server-side (arba fixture apply tam pačiam kontraktui).
- Bounded `LIMIT`/`OFFSET`.
- Nėra atskiro query kiekvienam facetui.
- Facet count'ai **neatidėti kaip fake** — šiame etape **nerodomi** (atidėti). Aktyvių filtrų skaičius = `predicates.length`.

## 14. QA rezultatai (šis paleidimas)

| Komanda | Rezultatas |
| --- | --- |
| `npm run test:category-domain` | PASS (14) |
| `npm run test:faceted-search` | PASS 18, SKIP 1 (EXPLAIN be `TEST_DATABASE_URL`) |
| `npx playwright test e2e/stage13b-faceted-filters.spec.ts` | PASS (7) |
| `npx playwright test e2e/stage12b-user-comprehension.spec.ts` | PASS (16), įskaitant Test 10C blank search |
| `npm run test:adaptive` | PASS (23) |
| `npx tsc --noEmit` | PASS |
| `npx tsc --noEmit -p server/tsconfig.json` | PASS |
| `npm run lint` | PASS (esami VautoAgent/VautoContext hook warning'ai, ne 13B) |
| `npm run build` | PASS |
| `npm run server:build` | PASS |

## 15. SKIP sąrašas

| Kodas | Priežastis | SKIP ≠ PASS |
| --- | --- | --- |
| Test L EXPLAIN | Be `TEST_DATABASE_URL` testas `it.skip`. Jei URL yra, bet nėra `listings` schemos — `t.skip` su priežastimi. Production DB benchmark **nedaromas**. | Taip |
| E2E Test G result-set | Statinis `out/` katalogas nėra 13B fixture DB. Aibės įrodymas: unit + HTTP fixtures. E2E G tikrina URL/UI hydration `rooms=2`. | Deklaruota |
| Facet counts | Atidėti. Fake skaičiai draudžiami. | Atidėta, ne PASS |

## 16. 11J

13B failai **nėra** `server/src/payments/`. Migracijos 058–061 neliestos. Unit Test E skaito 13B šaltinius.

## 17. 13A registry

Read-only. Šiame etape nekeisti `attributes.ts` / `capabilities.ts` / `registry.ts` semantikos.

### 13A schema gaps (nedaryti tylaus lauko)

1. Electronics `condition` enum yra lietuviškas (`Naujas` / `Naudotas` / `Patenkinama`), ne `USED` / `NEW`. Deep-link `condition=USED` yra **invalid_enum**.
2. TRANSPORT `vin` yra `filterable: false` — VIN facetas **negeneruojamas** (tik searchable).
3. Nėra atskiro `shipping` faceto JOBS izoliacijai — shipping yra capability, ne filterable attribute. JOBS vis tiek negauna vehicle-only raktų.

## 18. LOW radiniai

- Marketplace `FilterFields` kaina/vietovė lieka šalia 13A facetų (12B geo/kaina). Tai ne 13A atributai.
- `TRANSPORT` listing-category alias `vehicles` yra query-layer suderinamumas, ne naujas 13A vertikalės ID.
- Client pipeline filtruoja turimą katalogą; production search autoritetas yra `GET /api/search/listings`.

## Playwright

`e2e/stage13b-faceted-filters.spec.ts` — Tests A, B, C, D, J, K, G (hydration).  
Konfigūracija: `playwright.config.ts`, `http://127.0.0.1:4173`.
