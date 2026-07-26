# VAUTO Phase B — Verslas light

**Status:** GREEN (2026-07-26)  
**Prerequisite:** [PHASE_A_CLOSEOUT.md](./PHASE_A_CLOSEOUT.md) = GREEN  
**Constitution:** PVM eilutė · after-hours FAQ · paprastas multi-draft (ne ERP)

## Finish line

Verslo pardavėjas mato **PVM** prieš publish ir skelbime; ne darbo metu pirkėjas gauna **FAQ** pagal tikras valandas; privatus/Pro gali turėti **iki 3** juodraščių be antro publish kelio.

| Ship | Done means | Status |
|------|------------|--------|
| B1 | PrePublish + publish + listing detail: `su PVM` / `be PVM` kai `vatCode` | GREEN |
| B2 | Profile redaguoja `businessHours` → server after-hours FAQ naudoja jas | GREEN |
| B3 | Iki 3 localStorage juodraščių + dashboard „Tęsti“ → agentas | GREEN |

## Anti-scope (still frozen)

- Live Omniva / partner (Phase C)
- Pilnas FAQ library / ERP twin
- Sandėlis, masinis admin, portal sync
- Stripe refund/dispute expansion

## Canonical paths

```
B1: shared/vat-pricing → PrePublishModal → publishListing priceLabel → ListingDetailPage
B2: BusinessIdentityCard hours → PUT /api/users/:id → api.ts after-hours inject
B3: listing-draft-storage multi (max 3) → SellerDraftsStrip → applyAgentListingDraft
```

## Release check

```bash
npm run test:ai-golden
```

Smoke (manual): Pro with `vatCode` → PrePublish shows both VAT lines → publish → detail shows them.  
Smoke: set hours to closed now → buyer message → FAQ auto-reply.  
Smoke: save 2 drafts → dashboard resume → PrePublish.

## Sign-off

| Check | Evidence |
|-------|----------|
| A still green | `docs/PHASE_A_CLOSEOUT.md` |
| B1–B3 shipped | PrePublish/detail VAT · BusinessHoursEditor · SellerDraftsStrip |
| Golden | `npm run test:ai-golden` PASS |
| Hero sentence | Taip — verslui patikimesnis (PVM + tikros valandos); juodraščiai greitesni be antro kelio |

**Next:** [PHASE_C_PARTNER.md](./PHASE_C_PARTNER.md) — twin audit first; live Omniva only with partner.
