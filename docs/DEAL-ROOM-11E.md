# Stage 11E — Deal Room 1.0

## Status

**PASS** — Unified transaction aggregator / agreement snapshot.  
Deal Room is a **read model + action orchestration surface**, not a new state authority.  
**Stage 11F (Escrow/Payments) NOT started.**

`dealRoomVersion`: **`1.0`**

## Formula

```
TRANSACTION + ACTIVE OFFER + PARTICIPANTS + CHAT TIMELINE
  + ALLOWED ACTIONS + FUTURE PLACEHOLDERS (NOT_AVAILABLE)
  → DEAL ROOM SNAPSHOT
```

## Immutable agreement snapshot

Table: `vauto_deal_snapshots` (migration `042_deal_room_snapshots_1.0.sql`)

- Created inside the same TX as 11B `acceptOffer` when status becomes **AGREED**
- Stores amount (cents), accepted offer id, listing title/attrs/image freeze, buyer/seller, `snapshot_hash`
- **UPDATE/DELETE forbidden** via DB triggers
- Later listing price/title edits **do not** change the snapshot
- **Fail-closed (11E.1 M-01):** if listing facts cannot be loaded, AGREED TX rolls back (no empty snapshot)

## Payment authority (11F foreshadow — 11E.1 M-03)

Financial authority for future escrow = `vauto_deal_snapshots.amount_cents` + accepted `vauto_offers.amount_cents` (integer cents).  
`vauto_transactions.current_price` is UI-only.

## HTTP

`GET /api/transactions/:id/deal-room` (`requireAuth`)

- Participants only; strangers → **404** (no existence leak)
- Optional query: `expectedTransactionVersion`, `expectedActiveOfferVersion` → **409** on mismatch
- `transactionSummary.paymentStatus|shippingStatus|protectionStatus` = **`NOT_AVAILABLE`**
- No privileged `/deal-room/action` endpoint — UI calls existing 11B/11C/11D routes

## Modules

`server/src/deal-room/` — version, types, schema, loader, allowed-actions, timeline-adapter, snapshot-writer, service

## Tests

```bash
npm run test:deal-room --prefix server
```
