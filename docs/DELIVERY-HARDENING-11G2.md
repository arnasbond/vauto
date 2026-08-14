# Stage 11G.2 — Delivery Authority & Payout Eligibility Hardening

## Status

**Implemented — STRICT STOP before Stage 11H (Dispute Resolution).**  
`deliveryIntegrationVersion`: **`1.1`**

Surgical logistics / payout-boundary fixes only — no Dispute Resolution product work.

## Auditor fixes

| ID | Fix |
|----|-----|
| **C-01** | `createLabel` advances deal **only** to `SHIPPING_PENDING` with delivery `LABEL_CREATED`. **Never** `SHIPPED`. `SHIPPED` requires first physical carrier scan (`CARRIER_ACCEPTED` / `IN_TRANSIT`) via authoritative sync. |
| **H-02** | `confirmDelivery` (and carrier `DELIVERED` sync) require **exactly** `SHIPPED` plus no open dispute, no `REFUND_PENDING`/`REFUNDED`, no `SYSTEM_FINANCIAL_LOCK` (`TRANSFER_BLOCKED`). Failures → **409** / **403**, **0** payouts. |
| **H-01 / H-03** | Production (`NODE_ENV === 'production'`) without a real carrier mode → **503** fail-closed (no Fake). `SYSTEM` SM transitions only from authoritative carrier adapter or signed webhook / trusted server source. |
| **M-01** | Migration `050` + repository: monotonic delivery ranks (`PENDING_LABEL → LABEL_CREATED → IN_TRANSIT → DELIVERED`); regression (e.g. `DELIVERED → IN_TRANSIT`) rejected. |

## Flow (hardened)

```
PAID → (label) SHIPPING_PENDING + LABEL_CREATED
     → (carrier scan) SHIPPED + IN_TRANSIT
     → (buyer confirm | carrier DELIVERED) DELIVERED → releaseToSeller
```

## Migrations

- `049_delivery_shipping_1.0.sql` — base `vauto_deliveries`
- `050_delivery_authority_hardening_1.1.sql` — monotonic status trigger

## Tests

```bash
npm run test:delivery-shipping --prefix server
```

Includes concurrent `sync-status` + `confirmDelivery` (exactly-once release) and dispute / refund / financial-lock blocks.

## Explicit stop

**Do not start Stage 11H** until auditor approval.
