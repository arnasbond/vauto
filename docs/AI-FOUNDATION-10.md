# VAUTO AI Foundation — Etapas 10-FOUNDATION

**Data:** 2026-08-09  
**Status:** Atlikta (tik infrastruktūra)  
**Scope:** Provider-agnostic AI routing, telemetry, quality, confidence, LT domain normalizer, comparable policy.

> **Neįgyvendinta šiame etape:** Intent Engine (10A), Market Intelligence (10D), marketplace UI / Auth / Stripe / DB verslo logikos keitimai.

## Principai

1. AI **nėra** autoritetingas šaltinis finansams, teisėms, kainoms ar DB būsenoms — tik interpretuoja ir rekomenduoja.
2. Faktai ateina iš kodo / DB; HITL patvirtinimas prieš gamybinius side-effect’us.
3. Verslo kodas **nekoduotia** Gemini/Claude/OpenAI modelių vardų — naudoja `resolveAiModel(taskClass)`.
4. Production telemetrijoje **draudžiama** loguoti promptus, OCR, telefonus, el. paštus ir kitą PII.

## Katalogas

```
server/src/ai/foundation/
  index.ts
  model-router.ts
  telemetry.ts
  quality.ts
  confidence.ts
  comparable-policy.ts
  domain-normalizer/
    index.ts
    types.ts
    automotive.ts
    commerce.ts
    locations.ts
  *.test.ts
```

Importas:

```ts
import {
  resolveAiModel,
  recordAiTelemetry,
  applyConfidencePolicy,
  normalizeLithuanianDomainText,
  resolveComparableExpansion,
} from "../ai/foundation/index.js";
```

## Env kintamieji

| Kintamasis | Task class | Paskirtis |
|------------|------------|-----------|
| `AI_MODEL_FAST` | `FAST` | Greiti klasifikatoriai / routing |
| `AI_MODEL_VISION` | `VISION` | Nuotraukos / OCR |
| `AI_MODEL_REASONING` | `REASONING` | Sudėtingas reasoning |
| `AI_MODEL_FALLBACK` | bet kuri (kai primary nėra) | Atsarginis modelis |

Pavyzdys (`.env` — necommitinti secret’ų):

```bash
AI_MODEL_FAST=gemini-2.5-flash-lite
AI_MODEL_VISION=gemini-2.5-flash
AI_MODEL_REASONING=claude-sonnet-4
AI_MODEL_FALLBACK=gpt-4.1-mini
```

### Router pavyzdys

```ts
const route = resolveAiModel("VISION");
// { provider, model, taskClass: "VISION", fallbackUsed, sourceEnv }
```

Jei `AI_MODEL_VISION` nenustatytas, naudojamas `AI_MODEL_FALLBACK` ir `fallbackUsed: true`.

## Telemetrija

`recordAiTelemetry({ taskType, taskClass, provider, model, latencyMs, … })` rašo tik agreguotus laukus + `requestId`.

Draudžiami raktai: `prompt`, `ocr`, `phone`, `email`, `body`, `messages`, … (`AI_TELEMETRY_FORBIDDEN_KEYS`).

## Confidence / abstention

| Score | Tier | Elgesys |
|------:|------|---------|
| ≥ 0.90 | HIGH | Rekomendacija gali būti užpildyta (vis tiek ne finansinis faktas) |
| 0.70–0.89 | MEDIUM | Privalomas vartotojo patvirtinimas |
| < 0.70 | ABSTAIN | `value = null`, `abstained = true` |

```ts
const result = applyConfidencePolicy(draftFields, 0.82);
if (result.requiresUserConfirmation) { /* HITL */ }
if (result.abstained) { /* nekurti kaip faktą */ }
```

## Domain normalizer (LT)

```ts
normalizeLithuanianDomainText("automatas, dyzelis, quattro, PVM sąskaita");
```

- `automatas` → `transmission: automatic`
- `mechanas` / `mechaninė` → `manual`
- `dyzelis` → `diesel`; `benzas` → `petrol`; `elektra` → `electric`
- `quattro` → AWD + Audi; `xDrive` → AWD + BMW
- `PVM sąskaita` → `commerce: vat_invoice` (**ne** auto parametras)
- Visada grąžinamas `originalText`

## Comparable expansion

Lygiai: `LOCAL_STRICT` → `LOCAL_RELAXED` → `CATEGORY_RELAXED` → `APPROVED_EXTERNAL` → `INSUFFICIENT_DATA`.

Plečiant imtį confidence **mažėja**. Jei trūksta duomenų — `INSUFFICIENT_DATA` / N/A, **ne** spėjamas skaičius.

## Quality metrics

`computeAiQualityMetrics(samples)` → accuracy, latency p50/p95, fallback/abstention/user-correction rates, estimated cost.  
`passesAiQualityGate(metrics, thresholds)` — soft promotion gate.

## Testai

```bash
npm run test:ai-foundation --prefix server
```

## Kas toliau (NE šiame etape)

- **10A** Intent Engine produkto logika  
- **10D** Market Intelligence  
- Wiring į esamus `llm-provider.ts` / agent routes (tik po atskiro nurodymo)
