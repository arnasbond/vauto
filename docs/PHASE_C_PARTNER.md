# VAUTO Phase C — Logistika / twin+

**Status:** GREEN (2026-07-26) — C1–C4; Omniva OMX live verified on Render  
**Prerequisite:** Phase A + B GREEN

## Finish line

| Ship | Done means | Status |
|------|------------|--------|
| C1 | Twin audit log durable + `template_id` + message meta | GREEN |
| C2 | Panel twin toggle sync → listing attrs (server path works) | GREEN |
| C3 | PrePublish Omniva honesty follows health (live vs sim) | GREEN |
| C4 | Live Omniva OMX (`OMNIVA_USERNAME`+`PASSWORD`) + UX | GREEN |

## Evidence (C4)

```
npm run verify:carriers
→ omniva: live_configured | mode=live | key=yes
→ shippingCarrierLive: true (omniva)
```

## FORBID (still)

- Claim live Omniva when health says simulated / keys missing
- Free-form LLM twin negotiation
- ERP inventory / portal sync

## Canonical paths

```
C1: migrations/027 → negotiation-audit.ts → bargain-twin → api.ts chat meta
C2: ChatContext.updateNegotiationTwin → PATCH listing attributes
C3–C4: PrePublish follows /api/health; pastomatas-agent uses live mode + real lockers
```

## KPI

- Twin escalate rate (constitution ≥40%): `negotiation_audit_log.escalated` + client `twin_escalate`
- Helper: `computeTwinEscalateRate` in `negotiation-audit.ts`

## Sign-off (C1–C4)

| Check | Evidence |
|-------|----------|
| Table + template_id | `027_negotiation_audit_template.sql` |
| Audit on template reply | `logNegotiationAudit` + golden/smoke |
| Listing sync | panel save writes `isAiTwinActive` |
| Omniva live | `verify:carriers` → mode=live |
| UX | PrePublish Live badge; `/apie` live copy |

**Hero:** Taip — twin + Omniva live lipdukai (Escrow) patikimesni po publish.
