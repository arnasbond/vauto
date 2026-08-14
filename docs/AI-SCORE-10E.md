# VAUTO Score — Etapas 10E (v1.0)

## Status

**PASS (implementation)** — Explainable, deterministic VAUTO Score 1.0 (0–100).  
**10F Buyer Match — NOT STARTED.**

## Formula

```
VERIFIED DATA + MARKET INTELLIGENCE (10D) + LISTING QUALITY
  + SELLER/TRANSACTION SIGNALS + DEMAND SIGNALS
  → DETERMINISTIC COMPONENTS → VAUTO SCORE → AI EXPLANATION
```

**Critical:** All component scores and `totalScore` are computed only by deterministic code. LLM never invents scores — it only verbalizes allowlisted `reasonCodes` (with math guard).

## Module layout

`server/src/vauto-score/`

| File | Role |
|------|------|
| `version.ts` | `VAUTO_SCORE_VERSION = "1.0"` |
| `types.ts` | Weights, allowlist, input types |
| `score-schema.ts` | Zod `VautoScoreResult` |
| `price-value.ts` | Asking vs 10D market range |
| `listing-quality.ts` | Photos / attributes / description |
| `seller-trust.ts` | Verify / age / txs / deliveries / disputes |
| `demand.ts` | Normalized demand + spam filters |
| `transaction-confidence.ts` | Escrow / Omniva / buyer protection |
| `score-engine.ts` | Weighted aggregate |
| `explanation.ts` | Template + LLM guard |
| `index.ts` | Public API |

## Weights (`SCORE_WEIGHTS`)

| Component | Weight |
|-----------|--------|
| priceValue | 0.28 |
| listingQuality | 0.22 |
| sellerTrust | 0.22 |
| demand | 0.12 |
| transactionConfidence | 0.16 |

Missing components are **excluded and renormalized** — never filled with fake `50`.

## Missing-data policy

- `ScoreComponent.score = null` means **N/A**
- `INSUFFICIENT_DATA` ⇒ `totalScore = null` when weight coverage &lt; 0.35
- **NO HISTORY ≠ BAD HISTORY:** new sellers get `NEW_SELLER_NO_HISTORY` and sellerTrust N/A (not a low score)

## Score vs confidence

- `totalScore` — attractiveness / quality estimate (0–100 or null)
- `confidence` — how reliably the score could be computed from available signals (0–1)

## Manipulation resistance

Demand normalizer drops:

- self-interactions (actor = listing owner)
- rapid duplicate refresh from same actor/session
- session floods (cap per hour)

## Tests

```bash
npm run test:vauto-score --prefix server
```

180+ scenarios: automotive 50, electronics 35, generic 25, missing-data 20, new-seller 15, manipulation 15, stability 10, adversarial 10 (+ unit/perf).

## Explicit non-goals

- **10F Buyer Match** — not implemented in this stage
- Discriminatory seller features (name, gender, age, ethnicity, social status) — not accepted in input types
