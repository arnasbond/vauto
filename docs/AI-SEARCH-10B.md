# VAUTO Natural Language Search — Etapas 10B

**Data:** 2026-08-09  
**Status:** Atlikta  
**Foundation:** `AI_FOUNDATION_VERSION = "1.0"` · Intent Engine 10A

> **10C Visual/Voice Sell DAR NEPRADĖTAS.**  
> **LLM NIEKADA NEGENERUOJA skelbimų.** Rezultatai = tik realūs katalogo / DB ID.

## Grandinė

```
Prompt → 10A Intent (SEARCH|BUY only)
      → SearchQuery (Zod)
      → Hard-constraint filter
      → Deterministic rank
      → Real Listing IDs
      → Optional async AI Explanation (candidate-set guard)
```

Kiti intentai (`SELL|VALUE|COMPARE|WATCH|HELP|UNKNOWN`) → `blockedReason`, paieška nepaleidžiama.

## Failai

```
server/src/ai/search/
  search-schema.ts
  intent-to-search-query.ts
  catalog-filter.ts
  ranking.ts
  zero-result.ts
  explanation-guard.ts
  nl-search-engine.ts
  index.ts
  __tests__/catalog-fixture.ts
  __tests__/nl-search.test.ts
```

## SearchQuery (Zod)

| Laukas | Ribos / pastabos |
|--------|------------------|
| `category`, `brand`, `model` | string |
| `priceMin` / `priceMax` | 0…10_000_000 |
| `yearMin` / `yearMax` | 1950…current+1 |
| `mileageMax` | 0…2_000_000 |
| `location`, `radiusKm` | radius 1…500; **nežinomas distance → neatitinka radius** |
| `condition[]`, `delivery[]` | optional |
| `fuel`, `transmission` | iš Domain Normalizer |
| `keywords` | sanitized remnant |
| `sort` | relevance \| price_asc \| price_desc \| newest \| distance |

Hard constraints (kaina, metai, radius, category, brand/model) **niekada** tyliai neplečiami.

## Ranking (deterministinis)

1. Brand / model match  
2. Category / fuel / transmission / location fit  
3. Distance (tik jei žinomas)  
4. Recency  
5. Price preference  
6. Verified seller  

**Nenaudojama:** 10E/10F VAUTO Score / Match.

## Zero-result

```ts
{
  results: [],
  zeroResult: true,
  suggestedRelaxations: [{ field, action: "remove"|"widen", label }],
  query, // suprasti filtrai
  hardConstraints
}
```

Automatinio filtrų išplėtimo nėra — tik rankiniai pasiūlymai.

## AI Explanation guard

`validateAiExplanationAgainstCandidates(text, candidateIds)`  
Jei tekste yra `listingId` ∉ candidate set → **REJECT**.  
`scheduleAiExplanation` — progressive / non-blocking.

## Naudojimas

```ts
import { runNaturalLanguageSearch } from "../ai/search/index.js";

const out = await runNaturalLanguageSearch({
  text: userOrStt,
  catalog: { loadCandidates: (q) => repoSearch(q) }, // real DB adapter
});
// out.results[*].id — tik realūs ID
```

## Test corpus (100)

| Bucket | N |
|--------|--:|
| Automotive | 30 |
| Electronics | 20 |
| Generic | 15 |
| Location/radius | 10 |
| Zero-result | 10 |
| Adversarial | 10 |
| Mixed LT/EN | 5 |

```bash
npm run test:ai-search --prefix server
```

### Offline QA (paskutinis run)

| Metrika | Rezultatas |
|---------|------------|
| Hallucinated IDs | **0** |
| Forbidden leak (banned/private/hidden/sold/review) | **0** |
| Hard constraints | **100%** |
| Schema-valid queries | **100%** (searchable) |
| Latency p50 / p95 | **~1 ms / ~6 ms** |
| Security tests | **PASS** |

## Žinomi ribojimai

- Offline testai naudoja trusted fixture katalogą (ne LLM); production turi paduoti DB `loadCandidates`.
- Radius reikalauja žinomo `distanceKm` — kitaip kandidatas atmetamas (ne spėjama).
- Keywords be brand/model yra griežtesni; su brand/model — soft.
- Nėra UI wiring / API route šiame etape.

## Kas toliau

- **10C** Visual/Voice Sell — **nepradėta**
