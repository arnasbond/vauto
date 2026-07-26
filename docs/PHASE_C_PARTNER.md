# VAUTO Phase C — Logistika / twin+

**Status:** PARTIAL GREEN (2026-07-26) — C1–C3 shipped; C4 live Omniva **frozen** until partner  
**Prerequisite:** Phase A + B GREEN

## Finish line

| Ship | Done means | Status |
|------|------------|--------|
| C1 | Twin audit log durable + `template_id` + message meta | GREEN |
| C2 | Panel twin toggle sync → listing attrs (server path works) | GREEN |
| C3 | PrePublish Omniva labeled **Simuliacija** | GREEN |
| C4 | Live pastomatas with partner keys + product gate | FROZEN |

## FORBID (still)

- Show Omniva / DPD as „Gyvas vežėjas“ without partner-approved flag
- Free-form LLM twin negotiation
- ERP inventory / portal sync

## Canonical paths

```
C1: migrations/027 → negotiation-audit.ts → bargain-twin → api.ts chat meta
C2: ChatContext.updateNegotiationTwin → PATCH listing attributes
C3: PrePublishShippingOptions sim badge
```

## KPI

- Twin escalate rate (constitution ≥40%): `negotiation_audit_log.escalated` + client `twin_escalate`
- Helper: `computeTwinEscalateRate` in `negotiation-audit.ts`

## Sign-off (C1–C3)

| Check | Evidence |
|-------|----------|
| Table + template_id | `027_negotiation_audit_template.sql` |
| Audit on template reply | `logNegotiationAudit` + golden/smoke |
| Listing sync | panel save writes `isAiTwinActive` |
| Omniva honesty | PrePublish sim label |

**Hero:** Taip — post-publish twin patikimesnis (audit + sync); logistika vis dar sim.
