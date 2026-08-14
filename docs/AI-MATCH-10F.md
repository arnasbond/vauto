# Buyer Match — Etapas 10F (v1.0)

## Status

**PASS (implementation)** — Deterministic Buyer Match Engine 1.0.  
**10G Compare Engine — NOT STARTED.**

## Formula

```
USER INTENT → HARD FILTERS (10B SearchQuery) → REAL DB CANDIDATES
  → MATCH FEATURES → DETERMINISTIC MATCH SCORE → EXPLANATION
```

**Critical:** Buyer Match cannot bypass 10B hard constraints. Ineligible listings never enter the primary ranking. Match scores are deterministic only; LLM verbalizes allowlisted reason/tradeoff codes and cannot reorder results.

## Search vs Match vs VAUTO Score

| Engine | Question |
|--------|----------|
| 10B Search | What passes filters? |
| 10E VAUTO Score | How strong is listing/transaction quality? |
| 10F Buyer Match | Which eligible listing best fits *this* buyer? |

## Module layout

`server/src/buyer-match/`

| File | Role |
|------|------|
| `version.ts` | `BUYER_MATCH_VERSION = "1.0"` |
| `types.ts` | Weights, allowlists, listing/prefs types |
| `schema.ts` | Zod request/result/response |
| `preference-normalizer.ts` | Hard vs soft prefs; anti-discrimination |
| `hard-constraint-filter.ts` | 10B hard re-check + revalidation |
| `feature-extractor.ts` | Component features |
| `scorer.ts` | Weighted 0–100 matchScore |
| `ranking.ts` | Eligible-only primary ranking |
| `explanation.ts` | Top-N LLM guard |
| `match-engine.ts` | Orchestration |
| `index.ts` | Public API |

## Weights (`MATCH_WEIGHTS`)

| Component | Weight |
|-----------|--------|
| budgetFit | 0.18 |
| ageFit | 0.12 |
| mileageFit | 0.10 |
| distanceFit | 0.14 |
| preferenceFit | 0.16 |
| vautoScoreFit | 0.14 |
| sellerSignalFit | 0.08 |
| deliveryFit | 0.08 |

Missing components are skipped (UNKNOWN ≠ automatic negative). Coverage drives `confidence`.

## Hard vs soft

- **Hard:** `SearchQuery` (budget, year, radius, brand, …) — violation ⇒ `eligible=false`, `matchScore=null`
- **Soft:** `BuyerPreferences` (colors, comfort budget ratio, preferred models, …) — affect score only
- **Forbidden prefs:** age, gender, ethnicity, religion, health, politics, SES

## Revalidation & Top-N

- Price snapshot / critical hash drift ⇒ ineligible before ranking  
- AI explanation sees only top 5 ranked eligible listings  
- `sponsored` / `promoted` do **not** change organic `matchScore`

## Tests

```bash
npm run test:buyer-match --prefix server
```

200+ scenarios across automotive, electronics, generic, hard-constraint, missing-data, conflicts, diversification, adversarial/revalidation.

## Explicit non-goals

- **10G Compare Engine** — not started  
- Inventing listing IDs or widening hard filters
