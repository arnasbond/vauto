# AI Watch — Etapas 10H (v1.0)

## Status

**PASS (implementation)** — Event-driven AI Watch Engine 1.0.  
**10I Full Red Team — NOT STARTED.**

## Formula

```
USER SEARCH / INTENT → STRUCTURED WATCH CRITERIA → STORE WATCH
  → LISTING_CREATED / LISTING_UPDATED → PREFILTER → HARD CONSTRAINTS
  → OPTIONAL SCORE / MATCH THRESHOLDS → DEDUP → NOTIFICATION
```

**Critical:** No cross-user leakage. No spam. Event-driven (not full-table scan). Matching is 100% deterministic. LLM only formats notification text with mandatory template fallback. No auto-expansion of criteria.

## Module layout

`server/src/ai-watch/`

| File | Role |
|------|------|
| `version.ts` | `AI_WATCH_VERSION = "1.0"` |
| `types.ts` | Events, thresholds, reason allowlist |
| `schema.ts` | Zod AiWatchRule / MatchResult / Notification |
| `db-schema.ts` | SQL migration string |
| `migrations/2026-08-09-ai-watch-1.0.sql` | PostgreSQL DDL |
| `watch-store.ts` | CRUD + ownership + fingerprint ledger |
| `evaluator.ts` | Prefilter + 10B hard match + thresholds |
| `price-drop.ts` | Deterministic drop % / below |
| `meaningful-change.ts` | Ignore punctuation / photo order |
| `notification-dedup.ts` | Cooldown, daily cap, fingerprint |
| `explanation.ts` | Template + LLM guard |
| `watch-engine.ts` | Race-safe processWatchEvent |

## DB tables

- `ai_watches` — rules with `user_id` isolation  
- `ai_watch_notifications` — unique `(user_id, event_fingerprint)`

## Policies

| Policy | Value |
|--------|-------|
| Cooldown | 6h per rule+listing |
| Daily cap | 20 notifications / user / UTC day |
| Private/hidden/banned | `shouldNotify = false` |
| PAUSED/DELETED | no evaluation notifications |

## Invariants

- `shouldNotify === true` only if `isMatch && cooldownPassed` (and dedup/cap allow)  
- Ownership: all store mutations require `id + user_id`  
- Duplicate fingerprint → max 1 notification (race-locked)

## Tests

```bash
npm run test:ai-watch --prefix server
```

220+ cases: search, price, hard constraints, score/match thresholds, dedup, daily cap, IDOR, race/adversarial.

## Explicit non-goals

- **10I Full Red Team** — not started  
- Auto-expanding user search criteria  
- Notifying on punctuation-only / photo-order edits
