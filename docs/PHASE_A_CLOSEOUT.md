# VAUTO Phase A — Hero closeout

**Status:** GREEN (2026-07-26)  
**Finish line:** Constitution **Phase A** (S1–S4). Next: [PHASE_B_LIGHT.md](./PHASE_B_LIGHT.md) → [PHASE_C_PARTNER.md](./PHASE_C_PARTNER.md).

## Hero DoD

*Per ≤60 s privatus žmogus Lietuvoje: nuotrauka → kaina → publikuota → gauna pranešimą, kai kas nors rašo.*

| Ship | Done means | Status |
|------|------------|--------|
| S1 | Intent → SM → PrePublish → **Patvirtinti ir publikuoti** | GREEN |
| S2 | Vision enriches description | GREEN (live wheels soak) |
| S3 | City/phone from profile/GPS municipality; re-ask ≈0 | GREEN (Kaišiadorys geo fix) |
| S4 | Push/in-app on new message | GREEN (realtime local + live path) |

## Anti-micro-fix rules (still active)

1. **Prompt freeze** — no new “DRAUDŽIAMA” walls unless golden/live Vision fails.
2. **One PR = one hero step.**
3. **Post-process facts only** — no description regex surgery expansion.
4. **Simulation = simulation** for Omniva until Phase C partner.
5. **No god-object refactors** without measured KPI red.
6. After every PR: *Ar hero sakinys greitesnis / patikimesnis? Taip/Ne + kodėl.*

## Canonical seller AI path

```
User (auth JWT required)
  → apiVautoAgentStream  (conductor OFF)
  → runVautoAgentInner
       listing SM / process_photos
       Vision early_ack → Pass-1 → Pass-2
       [SKIP when SM active] secretary / sell-intent-fallback
  → PrePublish → physical publish button
```

## Release ritual

```bash
npm run release:hero
```

Always: `test:ai-golden` + restore + smoke.  
Live Vision: before promote when Gemini key present.

## Sign-off evidence

| Check | Evidence |
|-------|----------|
| Instant start + unlocked chat | Live soak + e2e restore 24/24 |
| Wheels → DALYS not full car | Live soak + `b0ea120` |
| GPS municipality not hub | Live Kaišiadorys audit + `609504b` |
| Omniva oversize → local/courier | Live soak |
| AI auth + conductor OFF | `c196c13` |
| KPI events | `hero-kpis.ts` + behavior-events |
| Realtime offline | `test:realtime:local` PASS |

**A-green commits:** `c196c13` … `609504b`  
**Signed:** code + live soak audits (Arnoldas / chief architect) — 2026-07-26

## Frozen until Phase B/C plans

- Stripe refund/dispute (B/C boundary)
- Live Omniva/DPD keys (C)
- God-object splits, portal sync, new verticals
