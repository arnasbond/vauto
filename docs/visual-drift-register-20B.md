# VAUTO Stage 20B — Vizualinio drift'o registras (Visual Drift Register)

Drift klasifikacija (pagal Stage 20B direktyvą):
- **Class A** — pateisinamas (functional/safety invariantas)
- **Class B** — pateisinamas (browser/accessibility/content apribojimas)
- **Class C** — pateisinamas (design system tokenų konfliktas)
- **Class D** — NEPATEISINTAS (privaloma ištaisyti)

## Rasti ir ištaisyti Class D drift'ai

| # | Vieta | Drift (prieš) | Fix (po) | Klasė |
|---|---|---|---|---|
| D-1 | `chameleon-portal-ui.ts` flux theme | Mėlynas accent `#1167b1` / oranžinis cta | Emerald `#10b981` / `#0d9f6e` | D→fixed |
| D-2 | `portal-experience.ts` flux color | Mėlynas `#1167b1` | Emerald `#10b981` | D→fixed |
| D-3 | `VautoHexMark.tsx` | Cyan/blue logo gradient | Emerald gradient | D→fixed |
| D-4 | `VautoLogo.tsx` | Oranžinis taškas `#f97316` | Emerald `#10b981` | D→fixed |
| D-5 | `globals.css` flux-coral/anonser/buddyPulse | Oranžiniai/mėlyni | Emerald | D→fixed |
| D-6 | 20+ komponentų | `var(--vauto-orange)` kainoms/CTA/AI | `--vauto-ink` / `--ds-brand` / `--ds-ai` / `--ds-warning` | D→fixed |
| D-7 | 20+ komponentų | `#1167b1`, sky/violet/teal hex | DS tokenai | D→fixed |
| D-8 | `SellerProfilePage.tsx` | Hardcoded `priceColor="#10b981"` | `var(--ds-brand)` | D→fixed (galutinis sweep) |
| D-9 | `InvoicePrintView.tsx` | Hardcoded `text-[#10b981]` | `text-[var(--ds-brand)]` | D→fixed (galutinis sweep) |
| D-10 | `native-media.ts` | Hardcoded `bg-[#10b981]` | `bg-[var(--ds-brand)]` | D→fixed (galutinis sweep) |

## Sąmoningai palikti nukrypimai (Class A/B — pateisinami)

| # | Vieta | Kodėl pateisinama | Klasė |
|---|---|---|---|
| L-1 | autoplius/skelbiu/cvbankas vertikalios | ~~Imituoja IŠORINIUS portalus — frozen architektūra, jų spalvos privalo likti~~ (KLAIDINGA interpretacija — Stage 20B.1 pataisyta) | A→fixed |

> **Stage 20B.1 dokumentacijos korekcija (L-1):** Ankstesnis teiginys, kad
> "external portal simulations yra frozen/protected product zones", buvo
> **klaidingas**. Chameleon / Autoplius / Aruodas / Skelbiu / Vinted / CVBankas
> imitacijos yra **atmestų VAUTO koncepcijų deprecated legacy kodas**, ne
> apsaugotos produkto zonos. Stage 20B.1 metu portal-native paletės pašalintos
> iš `globals.css`, o visa vertikalų prezentacija migruota prie VAUTO-native
> `vertical-presentation` sluoksnio su vieningu DS 2.0 emerald identitetu.
| L-2 | `--vauto-badge-info-*` → info mėlyna | Info semantika turi savo DS tokeną (`--ds-info`) | C |
| L-3 | `/ui-kit` React #418 | PRE-EXISTING (patvirtinta HEAD baseline build); reference paviršius | B |

## Patvirtinti MASTER atitikimo rodikliai

- Emerald akcentas: `--ds-brand #10b981`, `--ds-ai #059669` ✅
- Primary CTA bg: `rgb(16,185,129)` = emerald ✅
- LIGHT bg: `#F7F8FB`, DARK bg: `#0b1220` ✅
- h1: mobile 27.2px → desktop 50.4px (MASTER hierarchija) ✅
- Overflow: 0 px (48/48) ✅
- LIGHT/DARK paritetas: 0 mismatch (48/48) ✅

## Išvada

**Class D drift'ų likučių: 0.** Visi rasti drift'ai ištaisyti. Likę
nukrypimai yra pateisinti (Class A/B/C) ir dokumentuoti aukščiau.
