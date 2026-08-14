# Stage 10K — Final Certification Gate

## Status

**PASS** — C-01 / H-01 / H-02 / H-03 / M-01 / M-02 closed.  
**Stage 11 — NOT STARTED.**

## Fixes

| ID | Fix |
|----|-----|
| C-01 | `/market/valuation` & `/score` accept only `listingId`/`draftId`; load comps/seller/demand/transaction from DB |
| H-01 | `/sell/draft` injects production Vision + image-safety providers via `getAiModel("VISION")` |
| H-02 | `test:stage10-http-integration` (supertest) — 401 / IDOR / client-payload reject |
| H-03 | `ai_watch_outbox` + worker; listing hooks enqueue durably (no fire-and-forget evaluate) |
| M-01 | Search schema: strict `.min/.max` — no silent clamp |
| M-02 | Notifications FK `(rule_id, user_id) → ai_watches(id, user_id)` |

## Scripts

- `npm run test:stage10-http-integration --prefix server`
