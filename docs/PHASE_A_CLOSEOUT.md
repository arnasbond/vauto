# VAUTO Phase A — Hero closeout

**Status:** active course document (alongside `VAUTO_V1_CONSTITUTION.md`).  
**Finish line:** Constitution **Phase A** only (S1–S4). Phase B/C stay locked until A is green.

## Hero DoD

*Per ≤60 s privatus žmogus Lietuvoje: nuotrauka → kaina → publikuota → gauna pranešimą, kai kas nors rašo.*

| Ship | Done means |
|------|------------|
| S1 | One stream: Intent → SM → PrePublish → physical **Patvirtinti ir publikuoti** |
| S2 | Up to 6 photos; AI enriches description |
| S3 | City/phone from profile; missing → `/profile`; re-ask ≈0 |
| S4 | Push/in-app on new message; first-response ≤30 s median |

## Anti-micro-fix rules

1. **Prompt freeze** — no new “DRAUDŽIAMA” walls / product few-shots unless `npm run test:ai-golden` or live Vision smoke fails.
2. **One PR = one hero step.**
3. **Post-process facts only** (price, fashion/parts isolation). Description regex surgery — do not expand.
4. **Simulation = simulation** — never market live Omniva without partner + keys.
5. **No god-object refactors** (`VautoAgentContext`, `SellerFlowContext`, `agent-tools`) unless a measured hero KPI is red and the fix is ≤1 ownership file.
6. After every PR answer: *Ar hero sakinys greitesnis / patikimesnis? Taip/Ne + kodėl.*

## Canonical seller AI path (ownership)

```
User (auth JWT required)
  → apiVautoAgentStream  (conductor OFF in Phase A)
  → runVautoAgentInner
       safety shield
       listing SM / process_photos
       Vision early_ack → Pass-1 → Pass-2
       structured-input (contact / prepublish gateway)
       [SKIP when SM active] secretary noise hijack
       [SKIP when SM active] sell-intent-fallback
       supervisor tools (search / non-listing)
  → PrePublish card → physical publish button
```

Client Gemini (`NEXT_PUBLIC_GEMINI` / `clientExtractListing*`) is **not** the seller truth path when server Vision is available.

## Weekly KPI checklist

| KPI | Target | Event (DB / analytics) | Alias |
|-----|--------|------------------------|-------|
| Time-to-publish P50 | ≤60 s | `kpi_listing_flow_start` → `kpi_listing_published` | `time_to_publish_ms` |
| Completion rate | ≥70% | started / published counts | — |
| Re-ask rate | ≈0% | `kpi_contact_reask` (`profileHad: true`) | `profile_reask` |
| First-response | ≤30 s | `kpi_first_response_signal` | `buyer_message_notified_ms` |

Instrumentation: `src/lib/hero-kpis.ts` → console + `POST /api/user/behavior-events`.  
Start mark: `openAiSellerListingChat`. Publish: `SellerFlowContext.publishListing`.

## Release ritual

```bash
npm run release:hero
```

Always: `test:ai-golden` + AI restore e2e (+ smoke).  
Live Vision (`test:e2e:live`): required before promote when Gemini key is present; `SKIP_LIVE_VISION=1` prints a loud warning.  
Live agent auth against a local/API with matching secret: `E2E_MINT_REAL_JWT=1` (static CI keeps `e2e-*` stub tokens).

## Explicitly out of Phase A (FROZEN until A green)

- Stripe refund / dispute automation (B)
- Live Omniva/DPD production labels (C — partner + `verify:carriers`)
- God-object splits, portal sync, new verticals, purple redesign

## Hero soak sign-off (constitution §7)

Automated (2026-07-26 closeout implementation):

1. [x] `npm run test:realtime:local` green  
2. [x] `npm run test:ai-golden` green  
3. [x] Playwright `ai-assistant-restore` + `smoke` = 24/24  
4. [ ] Full `npm run release:hero` with live Vision (Gemini key) — before promote  
5. [ ] Phone inkognito: 3 foto + kaina → PrePublish → publish ≤60 s  
6. [ ] Second user messages seller → toast/push within ~30 s  
7. [x] `/apie` + Escrow `labelMode` show simuliacija  
8. [x] Code: `requireAuth` on `/api/vauto-agent` + `/api/ai` (health public); conductor OFF  

**Code landed:** `c196c13` on master (2026-07-26)  
**A-green date:** pending manual items 4–6 after Render deploy  
**Signed:** code closeout ready — Arnoldas confirms phone soak + live Vision

## PR sequence (implemented)

1. Honest UX + this doc  
2. AI `requireAuth` + conductor OFF  
3. SM-active router guards  
4. `release:hero` + CI golden/restore  
5. KPI telemetry  
6. Realtime verify + hero soak sign-off  
