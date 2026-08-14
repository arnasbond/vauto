# Stage 11G.1 — Delivery & Shipping Integration 1.0

## Status

**Implemented — STRICT STOP before Stage 11H (Dispute Resolution).**  
`deliveryIntegrationVersion`: **`1.0`**

## Authority rule

**DELIVERED** (carrier-verified or buyer explicit „Patvirtinti gavimą“) is the gate for **11F.4 `releaseToSeller`**.  
Never from chat / AI alone.

## Flow

> Superseded by **11G.2** hardening — see `docs/DELIVERY-HARDENING-11G2.md`.  
> Label creation must **not** mark `SHIPPED`; physical carrier scan is required.

```
PAID → (label) SHIPPING_PENDING + LABEL_CREATED
     → (carrier scan) SHIPPED → (confirm|carrier) DELIVERED → releaseToSeller
```

## HTTP

| Method | Path | Who |
|--------|------|-----|
| POST | `/api/transactions/:id/delivery/label` | Seller |
| POST | `/api/transactions/:id/delivery/confirm` | Buyer |
| POST | `/api/transactions/:id/delivery/sync-status` | Buyer/Seller |
| GET | `/api/transactions/:id/delivery/tracking` | Buyer/Seller |

## Module

`server/src/delivery/` — FakeCarrierAdapter (tests), delivery-service, migration `049`.

## Tests

```bash
npm run test:delivery-shipping --prefix server
```

## Explicit stop

**Do not start Stage 11H** until auditor approval.
