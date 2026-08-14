# Stage 11D — Negotiation Copilot 1.0

## Status

**PASS** — Read-only / recommendation-only AI deal assistant.  
**AI write authority = 0.** Stage 11E Deal Room **not started**.

`copilotVersion`: **`1.0`** (`NEGOTIATION_COPILOT_VERSION`)

## Chain

```
SERVER-AUTHORITATIVE CONTEXT
  → DETERMINISTIC SIGNALS / COUNTER BOUNDS
  → AI / TEMPLATE EXPLANATION
  → USER REVIEW
  → USER EXPLICIT CONFIRMATION
  → EXISTING 11B / 11C ENDPOINTS
```

## Hard rules

| Rule | Enforcement |
|------|-------------|
| `executableAction: null` | Schema + engine invariant |
| `requiresUserConfirmation: true` | Schema literal |
| Client body | Only `goal`, optional preferences note, version expectations — **no** prices / sellerMin / buyerMax |
| Context | Loaded server-side from 11A / 11B / chat + optional 10D/10E ports |
| Numbers | `deterministic-signals.ts` only; LLM explains, does not invent deltas |
| Privacy | Role-isolated context; `containsSecretBoundLeak` scrub |
| Chat | `UNTRUSTED_USER_CONTENT` + Stage 10 prompt-injection guards |
| Stale state | `transactionVersion` / `activeOfferVersion` → **409** on mismatch |

## Recommendation types (allowlist)

`HOLD` · `ACCEPT_MAY_BE_REASONABLE` · `COUNTER_MAY_BE_REASONABLE` · `REJECT_MAY_BE_REASONABLE` · `ASK_FOR_MORE_INFO` · `NO_RECOMMENDATION`

Forbidden action commands: `EXECUTE_*`, `SEND_COUNTER`, etc.

## Modules

`server/src/negotiation-copilot/`

- `version.ts` — `NEGOTIATION_COPILOT_VERSION = "1.0"`
- `types.ts` / `schema.ts`
- `context-loader.ts`
- `deterministic-signals.ts`
- `recommendation-engine.ts`
- `explanation-guard.ts`
- `copilot-service.ts`

## HTTP

- `POST /api/transactions/:id/copilot/recommend`
- `POST /api/transactions/:id/copilot/draft-message`

Auth: `requireAuth`. Rate limit: `negotiationCopilotRateLimiter` (per-user + per-transaction key).

## Tests

```bash
npm run test:negotiation-copilot --prefix server
```

Coverage includes:

- **1000× DB NO-WRITE** invariant (`vauto_transactions` / `vauto_offers` / `vauto_transaction_messages`)
- Buyer / seller scenarios
- Missing / limited market data
- Prompt injection via 11C chat (0 successful injections)
- Stale version **409**
- Privacy / role isolation
- Provider failure / timeout → safe template fallback

CI: `.github/workflows/ci.yml` step **Stage 11D Negotiation Copilot**.
