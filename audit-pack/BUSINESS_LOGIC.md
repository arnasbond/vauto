# BUSINESS_LOGIC.md
Source: `src/lib/b2b-plans.ts`, `monetization-engine.ts`, `buyer-protection.ts`, `referral.ts`, server billing routes.

## Monetization points
| Revenue stream | Price (code) | Trigger | File |
|----------------|--------------|---------|------|
| B2B Starter plan | €29/mo (2900 cents) | Stripe subscription | `stripe-plans.ts` |
| B2B Pro plan | €99/mo (9900 cents) | Stripe subscription | `stripe-plans.ts` |
| B2B Growth/Enterprise (client) | €99 / €249 mo | `b2b-plans.ts` labels | client display |
| Business monthly pro | €199 | `monetization-engine.ts` | client |
| PPC listing click | €0.08 | Click tracking | `b2b-plans.ts` |
| PPC call click | €0.35 | Click tracking | `b2b-plans.ts` |
| Safe buy start | €0.20 | Escrow funnel | `b2b-plans.ts` |
| Service lead open | €1.20 server / €14.99 client engine | `POST service-leads/:id/open` | `b2b-plans.ts`, `monetization-engine.ts` |
| Smart boost C2C | €2.99 | `monetization-engine.ts` | client |
| Smart boost B2B | €29.99 | `monetization-engine.ts` | client |
| Listing promotion | Wallet debit | `POST /api/listings/:id/promote` | `api.ts` |
| Buyer protection fee | 5% of item price | Escrow checkout | `buyer-protection.ts`, escrow route |
| VAT on B2B checkout | 21% | `buildB2BCheckout()` | `b2b-plans.ts` |

## Premium logic
| Feature | Gate | File |
|---------|------|------|
| `role === pro` | Pro dashboard, business cabinet | `profile/page.tsx`, `DashboardPage.tsx` |
| `profileType === business` | Business portal integrations | `profile-type.ts` |
| `billingPlan` starter/pro | B2B credits, job listings | `b2b-plans.ts` |
| `wardrobePowerUser` | Spinta premium | `types.ts` UserProfile |
| Homepage logo | Growth+ plan | `b2b-plans.ts` |
| AI CV filter | Growth+ plan | `b2b-plans.ts` |
| Job listing credits | Plan-based limits | `b2b-plans.ts` |

## Subscriptions
- Stripe Checkout → `billing_subscriptions` table.
- Webhook updates plan on `checkout.session.completed`.
- `customer.subscription.deleted` → downgrade handling in `billing.ts`.
- Customer portal: `POST /api/billing/portal`.

## Fees
- Buyer protection: 5%, min €0.01, waivable via `free_protection_credits`.
- Payment provider fee constants (demo only): Montonio 1.2%, Kevin 0.8%, Bank Link 1% — `payment-provider.ts` **MOCK ONLY**.

## Revenue triggers (server-side)
| Event | Revenue action |
|-------|----------------|
| Stripe subscription completed | Plan revenue |
| Escrow checkout completed | 5% platform fee via `application_fee_amount` |
| Service lead opened | Wallet debit `lead_price` (default 1.2) |
| Listing promoted | Wallet debit |
| Referral completed on escrow delivery | Credit grant (`referral service`) |

## Referral program
- `referral_code` on users (VAUTO-XXXXX format).
- `POST /api/growth/referral/apply`, `/validate`.
- Rewards applied on escrow delivery confirm — server `referral` service.

## Escrow business rules
- Manual capture — funds held until buyer confirms delivery.
- Express 24h escrow — simulated auto-confirm (`order-agent.ts`).
- Free protection credits consumed before fee charged.

## NOT IMPLEMENTED (monetization)
- Automated invoicing (UI mentions auto invoices — generation **NOT IMPLEMENTED** as PDF pipeline in audit scope).
- Outbound portal listing fees.
- Dynamic pricing / A-B price tests.

## Demo vs live
- Wallet top-up — **MOCK ONLY**, prod blocked.
- Payment provider intents — **MOCK ONLY** on client.
- Shipping labels — no carrier charge (simulated).
