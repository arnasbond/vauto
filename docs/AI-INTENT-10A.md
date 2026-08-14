# VAUTO Universal Intent Engine — Etapas 10A

**Data:** 2026-08-09  
**Status:** Atlikta  
**Foundation:** `AI_FOUNDATION_VERSION = "1.0"`

> **10B Search DAR NEPRADĖTAS.** Šis etapas tik klasifikuoja intentą / entities — **0 action execution** (nepaieška DB, nekuria listingų).

## Tikslas

Vienas provider-agnostic sluoksnis tekstui ir STT transkripcijai:

`SELL | BUY | SEARCH | VALUE | COMPARE | WATCH | HELP | UNKNOWN`

## Failai

```
server/src/ai/intent/
  index.ts
  intent-schema.ts      # Zod + IntentResult
  intent-rules.ts       # deterministiniai LT/EN heuristics
  intent-engine.ts      # classifyIntent() + FAST route + telemetry
  __tests__/
    corpus.ts           # 150 golden cases
    intent-engine.test.ts
```

## Zod / schema

`IntentResultSchema` (strict):

| Laukas | Tipas |
|--------|------|
| `intent` | enum VautoIntent |
| `confidence` | 0…1 |
| `entities` | `IntentEntitiesSchema` (bounded numbers) |
| `missing` | string[] |
| `requiresConfirmation` | boolean |
| `abstained` | boolean |
| `reasonCode?` | string |
| `originalText` | raw įvestis (atskirai) |
| `normalizedText` | working text |
| `foundationVersion` | `"1.0"` |
| `modelRoute?` | `{ taskClass:"FAST", provider, model, fallbackUsed }` |

LLM payload validuojamas su `IntentLlmPayloadSchema` — netinkamas JSON **atmetamas**, nefailinamas į veiksmus.

Skaitinės ribos (`INTENT_BOUNDS`): kaina 0…10M €, metai 1950…current+1, radius 1…500 km.

## Pipeline

1. Išsaugoti `originalText`
2. Domain Normalizer (auto slang, PVM sąskaita ≠ auto param, locations)
3. `getAiModel("FAST")` — modelio vardas tik iš env (`AI_MODEL_FAST` / fallback)
4. Rules klasifikacija (+ optional Zod-validated LLM refine)
5. `applyConfidencePolicy` → HIGH / MEDIUM (HITL) / ABSTAIN→UNKNOWN
6. Telemetrija: tik metaduomenys + `foundationVersion` (be prompt/PII/body)

## Naudojimas

```ts
import { classifyIntent } from "../ai/intent/index.js";

const result = await classifyIntent({ text: sttOrText });
// result.intent, result.entities, result.requiresConfirmation, result.abstained
// NIEKADA netraktuoti kaip DB/finance fakto be HITL
```

Optional FAST LLM:

```ts
await classifyIntent({
  text,
  llmCaller: async ({ route, userText }) => callYourProvider(route.model, userText),
});
```

## Corpus (150)

| Bucket | N |
|--------|--:|
| SEARCH/BUY | 25 |
| SELL | 25 |
| VALUE | 20 |
| COMPARE | 15 |
| WATCH | 15 |
| HELP | 10 |
| UNKNOWN / ambiguous | 20 |
| Adversarial / injection | 20 |
| **Total** | **150** |

## QA rezultatai (offline)

```bash
npm run test:ai-intent --prefix server
npm run test:ai-foundation --prefix server
```

| Metrika | Rezultatas | Gate |
|---------|------------|------|
| Intent accuracy | **100%** | ≥95% |
| Required-entity accuracy | **100%** | ≥92% |
| Schema-valid | **100%** | 100% |
| Adversarial → UNKNOWN/abstain | **100%** | 100% |
| Action execution | **0** | 0 |
| Telemetry PII/prompt leak | **0** | 0 |
| Latency p50 / p95 | ~0–2 ms (rules) | n/a |

## Žinomi ribojimai

- Offline PASS remiasi deterministiniais rules + Zod; live LLM refine priklauso nuo `llmCaller` ir env modelių.
- Ambiguous mišiniai (pvz. help+sell) gali grįžti UNKNOWN (saugu).
- STT klaidos toleruojamos per slang maps; labai sugadintas tekstas → UNKNOWN.
- Intent Engine **nejungia** paieškos / create listing API.

## Kas toliau (ne šiame etape)

- **10B** Search orchestration  
- Wiring į produkto chat routes / UI
