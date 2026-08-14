# Compare Engine — Etapas 10G (v1.0)

## Status

**PASS (implementation)** — Deterministic Compare Engine 1.0 (2–4 listings).  
**10H AI Watch — NOT STARTED.**

## Formula

```
USER SELECTS 2–4 LISTINGS → AUTHORIZED REAL DB RECORDS
  → NORMALIZED COMPARISON FACTS → DETERMINISTIC DELTAS
  → TRADEOFF ENGINE → OPTIONAL AI EXPLANATION
```

**Critical:** LLM is never a fact source and cannot “remember” listings from chat history. All numbers, specs, deltas, and tradeoffs are deterministic. LLM only verbalizes the fact table + allowlisted tradeoffs (math/ID/order guard).

## Module layout

`server/src/compare-engine/`

| File | Role |
|------|------|
| `version.ts` | `COMPARE_ENGINE_VERSION = "1.0"` |
| `types.ts` | Delta keys, tradeoff allowlist, DB record type |
| `schema.ts` | Zod CompareRequest / Response |
| `listing-normalizer.ts` | Snapshots, auth, stale checks |
| `category-adapters/` | automotive / electronics / generic |
| `delta-engine.ts` | Pairwise numeric diffs |
| `tradeoff-engine.ts` | Allowlisted pros/cons |
| `explanation.ts` | Template + LLM guard |
| `compare-engine.ts` | Orchestration |
| `index.ts` | Public API |

## Category attribute maps

- **Automotive:** brand, model, year, mileage, fuel, transmission, drivetrain, bodyType, condition, color, distanceKm, delivery  
- **Electronics:** brand, model, storageGb, condition, color, batteryHealthPercent *(only if verified)*, warrantyMonths, delivery, distanceKm  
- **Generic:** brand, model, condition, color, delivery, distanceKm  

Missing → `null` (N/A). Never guessed.

## Deltas & tradeoffs

**Deltas:** `PRICE_DIFF_EUR`, `MILEAGE_DIFF_KM`, `YEAR_DIFF`, `DISTANCE_DIFF_KM`, `VAUTO_SCORE_DIFF`, `BUYER_MATCH_DIFF`, `STORAGE_DIFF_GB`  
(null on either side ⇒ no numeric delta)

**Pros/cons allowlist:** `LOWER_PRICE`, `NEWER_YEAR`, `LOWER_MILEAGE`, `HIGHER_VAUTO_SCORE`, `HIGHER_BUYER_MATCH`, `HIGHER_PRICE`, `HIGHER_MILEAGE`, `OLDER_YEAR`, `LOWER_MATCH`, …

## Stale snapshot

If `price !== priceSnapshot` or `criticalHash` mismatch → `status: STALE_SNAPSHOT`, empty compare set.

## Buyer context

Without `buyerContext` → `contextualBestListingId = null` (no absolute winner).  
With context → server runs 10F Buyer Match on authorized rows; client scores ignored.

## Security

- 2–4 unique IDs enforced server-side  
- Unknown / hallucinated IDs → `UNAUTHORIZED`  
- Private listings require matching `requestUserId` (IDOR guard)

## Tests

```bash
npm run test:compare-engine --prefix server
```

## Explicit non-goals

- **10H AI Watch** — not started
