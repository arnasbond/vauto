# AI Market Intelligence — Etapas 10D (v1.0)

## Status

**PASS (implementation)** — Deterministic Market Intelligence Engine 1.0.  
**10E VAUTO Score — NOT STARTED.**

## Pipeline

```
DATA → NORMALIZE → SELECT COMPARABLES → REMOVE/CONTROL OUTLIERS
  → CALCULATE STATISTICS → CONFIDENCE → VALUATION RANGE → OPTIONAL AI EXPLANATION
```

**Critical rule:** LLM never invents market prices. Math/statistics come only from deterministic code + trusted observations. LLM may only verbalize a finished `ValuationResult` (with number guard).

## Module layout

`server/src/market-intelligence/`

| File | Role |
|------|------|
| `types.ts` | `MARKET_INTELLIGENCE_VERSION = "1.0"`, price sources, subjects |
| `valuation-schema.ts` | Zod `ValuationResult` |
| `normalizer.ts` | Foundation domain normalizer |
| `comparable-selector.ts` | Expansion ladder |
| `comparable-policy.ts` | Minimum sample thresholds |
| `outlier-control.ts` | Median / IQR fences + audit counters |
| `deduplication.ts` | Republish / duplicate filter |
| `statistics.ts` | Time-decay weights, oriented range rounding |
| `confidence.ts` | Multi-criteria confidence |
| `valuation-engine.ts` | Automotive / electronics / generic adapters |
| `explanation.ts` | LLM explanation + reject guard |
| `index.ts` | Public API |

## Price source distinction

Every observation carries:

- `ASKING_PRICE` — listing ask (not a closed deal)
- `TRANSACTION_PRICE` — verified transaction
- `VERIFIED_EXTERNAL` — licensed external only (`externalApproved: true`)

`ValuationResult.priceBasis` is `ASKING_PRICE | TRANSACTION_PRICE | MIXED`.

## Comparable Expansion Ladder

1. `LOCAL_STRICT` (factor 1.0) — same locality + tight brand/model/year  
2. `LOCAL_RELAXED` (0.85)  
3. `CATEGORY_RELAXED` (0.70)  
4. `APPROVED_EXTERNAL` (0.55) — licensed only; **no scraping**  
5. Else `INSUFFICIENT_DATA` → `estimatedRange: null` (N/A)

Widening the set **must** reduce the level confidence factor.

## Minimum Sample Policy

| Level | Min accepted comps |
|-------|--------------------|
| LOCAL_STRICT | 5 |
| LOCAL_RELAXED | 5 |
| CATEGORY_RELAXED | 8 |
| APPROVED_EXTERNAL | 10 |

Below threshold → abstention (`INSUFFICIENT_DATA`).

## Outliers, dedupe, time decay

- Tukey IQR fences (k=1.5); extreme €1 / €92k-style noise removed  
- Audit: `originalComparableCount`, `acceptedComparableCount`, `excludedOutlierCount`  
- Dedup by `dedupeKey` (keep newest)  
- Exponential time decay (half-life 45 days) on weighted median / percentiles  
- **No false precision:** orientation rounding (e.g. €18,400 not €18,437)

## Integrations

- **10C SellDraft:** `adviseSellDraftPrice` / optional `marketAdvice` — recommendation only, `overwriteUserPrice: false`  
- **10B Search:** optional `askingPriceVsMarket`: `BELOW_RANGE | WITHIN_RANGE | ABOVE_RANGE | UNKNOWN`

## Tests

```bash
npm run test:ai-market --prefix server
```

Golden + invariants: 150+ scenarios (auto 45, electronics 30, generic/unsupported 20, sparse 15, outliers 10, duplicates 10, stale 10, adversarial 10, plus ladder/latency).

## Explicit non-goals (this stage)

- **10E VAUTO Score** — not implemented  
- Scraping / unlicensed external market pulls  
- Overwriting seller-entered prices
