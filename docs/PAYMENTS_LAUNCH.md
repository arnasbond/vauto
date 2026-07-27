# VAUTO mokėjimai — paleidimo kontrolinis sąrašas

## Kas jau veikia kode

| Srautas | Kur | Kaip |
|--------|-----|------|
| B2C iškėlimas | Profilis / skelbimas | Stripe Checkout (`card` + `Link`; Apple/Google Pay per Dashboard) |
| B2B planai | Verslo skydelis / registracija (Verslas) | Stripe Checkout → webhook + `/api/billing/confirm` |
| Escrow (pokalbiai) | `EscrowModal` | Stripe Checkout (manual capture) + `EscrowReturnToast` |
| Prenumeratos valdymas | Nustatymai | Stripe Customer Portal |
| PVM sąskaitos | Webhook → `billing_invoices` + istorija UI | 21% PVM skaičiavimas |

## Stripe Dashboard (privaloma production)

1. Įjunkite **Apple Pay** ir **Google Pay** (Settings → Payment methods).
2. Pridėkite ir patvirtinkite domeną `www.vauto.lt` (ir `vauto.lt`) Apple Pay.
3. Nustatykite `APP_ORIGIN=https://www.vauto.lt` ir webhook į `https://<api>/api/billing/webhook`.
4. Įrašykite įmonės rekvizitus (žemiau).

## Env (Render + Next)

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_ORIGIN=https://www.vauto.lt
STRIPE_CHECKOUT_PAYMENT_METHODS=card,link

VAUTO_LEGAL_NAME=UAB …
VAUTO_COMPANY_CODE=…
VAUTO_VAT_CODE=LT…
VAUTO_LEGAL_ADDRESS=…
VAUTO_BILLING_EMAIL=saskaitos@…

NEXT_PUBLIC_VAUTO_LEGAL_NAME=…
NEXT_PUBLIC_VAUTO_COMPANY_CODE=…
NEXT_PUBLIC_VAUTO_VAT_CODE=…
NEXT_PUBLIC_VAUTO_LEGAL_ADDRESS=…
NEXT_PUBLIC_VAUTO_BILLING_EMAIL=…
```

## Bankiniai mokėjimai LT

Stripe Checkout su `card` + `link` dengia korteles ir wallet’us. Tikras LT bank-link (Montonio/Kevin) — atskiras PSP; UI demo mygtukai lieka tik kai Stripe nepasiekiamas.

## Stripe Connect (pardavėjų išmokos)

Escrow jau siunčia `transfer_data` jei pardavėjas turi `stripe_connect_account_id`. Trūksta Connect onboarding UI — kitas etapas.
