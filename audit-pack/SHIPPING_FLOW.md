# SHIPPING_FLOW.md
Source: `server/src/shipping/carrier-adapter.ts`, `server/src/shipping/providers/carrier-adapters.ts`, `server/src/shipping/carrier-readiness.ts`, `server/src/routes/escrow-billing.ts`, `server/src/shipping/shipping-routing.ts`.

**Audit refresh:** 2026-07-03 — aligned to **v1.6.62** (not v1.6.4).

## Status: **IMPLEMENTED (adapter layer) + SIMULATED (live keys missing)**

| Layer | Status |
|-------|--------|
| Carrier adapter abstraction (`CarrierAdapter`, `createLabel`, `getTrackingStatus`) | **IMPLEMENTED** |
| Omniva live adapter (`OmnivaCarrierAdapter`) | **IMPLEMENTED** — needs `OMNIVA_API_KEY` + `OMNIVA_API_URL` |
| DPD live adapter (`DpdCarrierAdapter`) | **IMPLEMENTED** — needs `DPD_API_KEY` + optional `DPD_API_URL` |
| Simulated fallback (`SimulatedCarrierAdapter`) | **IMPLEMENTED** — active when keys missing |
| LP Express live adapter | **NOT IMPLEMENTED** — simulated only |
| Real carrier webhook tracking | **NOT IMPLEMENTED** |

## Carrier flow
1. Client requests lockers: `GET /api/shipping/lockers?city=...&provider=omniva|dpd|lp_express`.
2. Server returns synthetically generated lockers from `buildNationalLockers()` — one per LT city from `LT_CITY_COORDS`.
3. Route estimate: `POST /api/shipping/route-estimate` — great-circle distance heuristic. **No live carrier API for routing.**
4. Escrow label: `POST /api/escrow-billing/shipping-label`:
   - Resolves adapter via `resolveCarrierAdapter(providerId)`
   - Returns `label.mode: "live" | "simulated"`
   - Updates `escrow_transactions` with tracking + label id
5. Tracking: `GET /api/escrow-billing/shipping-tracking/:trackingCode` — adapter `getTrackingStatus` (simulated summary when no keys).

## Health / readiness
- `/api/health` → `infra.shippingCarriers[]` per provider (`omniva`, `dpd`, `lp_express`)
- `infra.shippingCarrierLive: false` when no keys configured (current production state)
- `scripts/verify-carriers.mjs` — remote health or `--local` adapter probe

## UI honesty
- `EscrowModal` shows amber banner when `label.mode === "simulated"`
- **RISK** if UI omits mode check — user may think label is real

## Retries
- Live Omniva/DPD adapters: single attempt, fallback to simulated on failure
- **NOT IMPLEMENTED** — dead-letter / retry queue for label failures

## Blocker for live shipping
- **BLOCKED:** Omniva/DPD API credentials not yet configured on Render
- When keys arrive: set env vars → run `npm run verify:carriers` → confirm `mode=live` → remove simulated-only UX warnings

## DB fields (escrow_transactions)
`shipping_provider`, `shipping_locker_id`, `shipping_locker_name`, `tracking_code`, `shipping_label_id`, `delivery_status`, `express_escrow_24h`, `delivered_to_locker_at`, `claim_deadline_at`, `courier_status`, `courier_provider`.
