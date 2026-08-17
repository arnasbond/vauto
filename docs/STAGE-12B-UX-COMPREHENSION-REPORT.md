# Stage 12B — First-time user comprehension & UX validation

Stage 11 backend and Stage 12A Deal Room wiring remain frozen. This stage only polishes first-screen meaning, funnel entry, and trust microcopy. **No production deploy.**

## 10–15 s comprehension answers

### 1. Kas yra VAUTO?

VAUTO yra skelbimų ir sandorio platforma: AI padeda paruošti paiešką arba skelbimo juodraštį, o kainą, publikavimą, mokėjimą ir gavimą tvirtina žmogus.

| Signalas | Komponentas |
| --- | --- |
| H1 «VAUTO / AI padeda. Žmogus sprendžia.» | `src/components/home/HomeAiHero.tsx` (`[data-home-h1]`) |
| Paantraštė: skelbimai + sandorio eiga, ne paprasta lenta | `[data-home-subtitle]` tame pačiame faile |
| Badge «AI Copilot · Skelbimas · Paieška · Sandorio eiga» | `HomeAiHero` |

### 2. Kuo VAUTO skiriasi nuo paprasto skelbimų portalo?

Skirtumas yra trys žingsniai iki sandorio kambario: AI atrenka arba paruošia, jūs deratės, mokėjimas laikomas iki gavimo patvirtinimo (Omniva sekimas Deal Room). Tai nėra «100 % saugu» ar garantuota kaina.

| Signalas | Komponentas |
| --- | --- |
| Compact 3 žingsniai viršuje (be slinkimo) | `HomeAiHero` `[data-home-how-it-works]` — Rask / Paruošk → Susitark → Saugus sandoris |
| Pilnas paaiškinimas žemiau | `src/components/home/HomeVisualFlow.tsx` (`#home-visual-flow-heading`) |
| Escrow, ne draudimas | `DealRoomPage` `[data-escrow-hint]`; `buyerProtectionExplanation()` |

### 3. Ką vartotojas čia gali padaryti?

Du keliai nuo pirmo ekrano: ieškoti (pirkėjas) arba parduoti su AI (pardavėjas).

**Pirkėjas**

| Veiksmas | Komponentas |
| --- | --- |
| CTA «Ieškoti automobilio» | `[data-buyer-cta]` → fokusuoja paiešką ir slenka į `#listing-results` |
| Paieškos juosta + pavyzdžiai | `AiCommandBar` (`AI_FIRST_SEARCH_PLACEHOLDER`); chip'ai `[data-search-examples]` |
| Filtrai ir sąrašas | `ListingGrid` `#listing-results`, `MarketplaceFilterBar` |
| Pasiūlymas / Deal Room | `ListingDetailStickyPanel` ir mobili juosta `[data-start-deal-cta]` → `/sandoriai/` |

**Pardavėjas**

| Veiksmas | Komponentas |
| --- | --- |
| CTA «Parduoti su AI» | `[data-seller-cta]` → `/add/` |
| 4 žingsniai (nuotrauka → AI juodraštis → peržiūra → publikacija) | `SellerListingSteps` `[data-seller-steps]` / `[data-seller-funnel]` |
| Svečiui: paaiškinimas + «Prisijungti ir pradėti» | `src/app/add/page.tsx` |
| Prisijungus: 4 žingsnių asistentas pokalbyje | `openAiSellerListingChat` (publikacija tik po mygtuko) |

### 4. Kodėl vartotojas gali pasitikėti platforma?

Pasitikėjimas kyla iš proceso, ne iš šūkių: lėšos laikomos iki gavimo, atsiliepimai tik po sandorio, siuntos būsena iš vežėjo.

| Signalas | Komponentas |
| --- | --- |
| Depozitas iki gavimo / ginčo | `DealRoomPage` `[data-escrow-hint]`; mokėjimo kortelė |
| «Patvirtintas atsiliepimas po sandorio» | `VerifiedReputationBadge`; Deal Room `[data-verified-review-hint]`; `VerifiedReviewForm` |
| Omniva sekimo būsena | `carrierStatusHint()` → `[data-omniva-hint]` Deal Room ir skelbimo skydelyje |
| Pirkėjo apsauga (ne visų rizikų draudimas) | `src/lib/payments/buyer-protection.ts` |

## Playwright

`e2e/stage12b-user-comprehension.spec.ts`

1. First-screen: H1, abu CTA, «Kaip veikia» pirmame 1280×800 kadre.
2. Buyer CTA → `#listing-results` matomas.
3. Seller CTA → `/add/` su 4 žingsniais ir prisijungimo vartais.
4. 375×812: CTA pasiekiami, `scrollWidth` neviršija lango.

CI: `.github/workflows/ci.yml` žingsnis `Run Stage 12B user comprehension E2E` (JWT nereikia).

## Stop

12B baigia pirmą suvokimą. Galutinis production deploy ir naujos funkcijos — tik atskiru nurodymu.
