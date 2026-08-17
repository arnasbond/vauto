# Stage 13B.1 — Facet Input & Query Hardening

**Status:** `ETAPAS 13B.1 IMPLEMENTED — AWAITING INDEPENDENT AUDIT`

Pataisos ant sertifikuojamo 13B. **13C nepradėtas.** 13A registras read-only. 11J nepaliestas.

## 1. Controlled text / location trim

`FacetFilterPanel.tsx` `TextFacetInput`:

- `onChange` saugo **`e.target.value`** (be `.trim()`).
- Tarpas rašant `Naujoji Akmenė` / `Kazlų Rūda` lieka inpute.

## 2. Kur vyksta trim / normalizacija

| Boundary | Elgsena |
| --- | --- |
| Klavišas | raw draft; URL atnaujinamas tik jei **trim()** reikšmė pasikeitė (nėra trailing-space spam) |
| `blur` | `raw.trim()` į predicate + input |
| `serializeFacetSearchParams` | `contains` / `location` trim |
| `parseFacetSearchParams` | location/string trim (kaip anksčiau) |
| SQL ILIKE | `pred.value.trim()` |

## 3–7. Testai M–Q

Žr. QA lentelę žemiau ir `facet-query.test.ts` / E2E.

## 4. Invalid vertical canonicalization

`canonicalizeFacetSearchParams`:

1. Jei `parseFacetSearchParams` `ok` — serialize parsed query.
2. Kitu atveju `resolveVerticalId(vertical)`. Jei `null` — **`vertical` iš URL pašalinamas**.
3. Facetai (`mileage_max`, …) **nekopijuojami** be sėkmingo parse.
4. `q` paliekamas, jei yra.

UI hydration (`useHydrateFacetUrl`) visada eina per šį helperį. `vertical=hacked` nėra authoritative state.

API vis dar **400** `unknown_category` / `unknown_facet`, jei kas nors siunčia žalią `?vertical=hacked&mileage_max=100`.

## 6. Numeric JSON cast

`jsonNumericAttrExpr($n)`:

```sql
CASE WHEN (attributes->>$n) ~ '^[+-]?[0-9]+([.][0-9]+)?$'
     THEN (attributes->>$n)::numeric
     ELSE NULL END
```

`mileage: "unknown"` → NULL → filtras ne match, ne 500. Raktas vis tiek bound parametras.

## 8. SKIP 1 — EXPLAIN / TEST_DATABASE_URL

**SKIP ≠ PASS.**

| | |
| --- | --- |
| Kodėl skip | Lokaliai nėra `TEST_DATABASE_URL`, todėl `it.skip`. Jei URL yra, bet nėra `listings` schemos — `t.skip` su priežastimi. |
| Ką tikrina | `EXPLAIN` ant `buildFacetSqlPlan` (vienas `SELECT`, `LIMIT`/`OFFSET`, fail-safe numeric CASE). |
| Stage 14 | Prieš Production Release Gate šis testas **turi būti paleistas** prieš production-compatible test DB. Naujos DB infrastruktūros šiame etape **nekuriame**. |

## QA (šis paleidimas)

| Komanda | Rezultatas |
| --- | --- |
| `npm run test:category-domain` | PASS 14 |
| `npm run test:faceted-search` | PASS 23, SKIP 1 (EXPLAIN be `TEST_DATABASE_URL`) |
| `npx playwright test e2e/stage13b-faceted-filters.spec.ts` | PASS 11 (A–D, G, J, K, M, N, O, P) |
| `npm run test:adaptive` | PASS 23 |
| `npx tsc --noEmit` | PASS |
| `npx tsc --noEmit -p server/tsconfig.json` | PASS |
| `npm run lint` | PASS (seni VautoAgent/VautoContext warning'ai) |
| `npm run build` | PASS |
| `npm run server:build` | PASS |
| 12B Playwright | Nepaleista — `AiCommandBar` / blank-search neliesta |

Test M/N/O/P: E2E PASS. Test Q: unit + HTTP PASS (malformed = non-match; SQL CASE WHEN).

