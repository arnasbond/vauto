# Stage 11F.4 — Funds Hold, Seller Transfer & Refund 1.0

## Status

**Implemented — awaiting audit PASS.**  
Stripe Connect **Separate Charges and Transfers** — not a fake bank escrow.  
**Stage 11F.5 NOT started.**

`fundsTransferVersion`: **`1.0`**

## Terminology

- UI / docs: „Pinigai laikomi iki sandorio užbaigimo“, „Lėšos išmokamos pardavėjui“
- DB `HELD_IN_ESCROW` = internal VAUTO product marker for held funds

## Invariants

```
grossAmountCents === platformFeeCents + sellerNetCents  (integer EUR cents)
```

- Gross from `vauto_deal_snapshots.amount_cents`
- Platform fee = 5% floor of gross
- Destination Connect account from server DB only (`users.stripe_connect_account_id`)
- Client cannot send `destinationAccountId`, `transferAmount`, `platformFee`, `sellerNet` → **400**

## 2-phase release

1. **TX1** — DELIVERED/COMPLETED, seller onboarded, fee split, `TRANSFER_PENDING` → COMMIT  
2. **Stripe** `transfers.create` with key `vauto:transaction:{id}:seller-transfer:1`  
3. **TX2** — attach `stripe_transfer_id`, `TRANSFERRED`, `RELEASED_TO_SELLER`, ledger `SELLER_TRANSFERRED`

If seller has no Connect account → `TRANSFER_BLOCKED` + LT message.

## Refund

| Timing | Stripe | Ledger |
|--------|--------|--------|
| Before transfer | Charge refund | `BUYER_REFUNDED` |
| After transfer | Transfer reversal + refund | `TRANSFER_REVERSED` + `BUYER_REFUNDED` |

## HTTP

- `POST /api/transactions/:id/payment/release-to-seller`
- `POST /api/transactions/:id/payment/refund-to-buyer`

## Migration

`047_funds_transfer_ledger_1.0.sql`

## Tests

```bash
npm run test:funds-transfer --prefix server
```

## Explicit stop

**Do not start Stage 11F.5** until auditor PASS.
