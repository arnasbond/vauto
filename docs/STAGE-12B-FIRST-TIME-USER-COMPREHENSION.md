# Stage 12B — First-Time User Comprehension Readiness

**Status:** `ETAPAS 12B.1 IMPLEMENTED — AWAITING INDEPENDENT AUDIT`

Šis dokumentas **neįrodo**, kad žmonės supranta VAUTO. Jis fiksuoja techninį
**First-Time User Comprehension Readiness**: UI suteikia pakankamą ir
neprieštaringą informaciją realiam usability testui.

Tikras žmogaus comprehension reikalautų atskiro moderated / unmoderated user test.

Sertifikuotos ribos (neliesta): ETAPAS 11J (`server/src/payments/`, ledger,
Stripe webhook / provenance, transaction core invariantai, 11J migracijos).
ETAPAS 12A universal marketplace terminija išlaikyta.

Pagrindinis principas: **AI padeda. Žmogus sprendžia.**

## Playwright suite

`e2e/stage12b-user-comprehension.spec.ts` + `e2e/helpers/stage12b-comprehension.ts`

```
npx playwright test e2e/stage12b-user-comprehension.spec.ts
```

Konfigūracija: `playwright.config.ts` — `webServer` stato `out/` per
`scripts/build-e2e-static.mjs` ir servina `http://127.0.0.1:4173`.

**Aplinka:** statinis export. JWT / test DB **nereikia**. Test 3 ir Test 10
naudoja tą patį localhost agent stub šabloną kaip smoke
(`runtime-config.json` `conductorEnabled: false` + `**/api/vauto-agent**`),
kad paieška pasiektų rezultatų arba tuščią būseną be gyvo backend.

SKIP testų nebuvo.

| # | Scenarijus | Presence | Discoverability | Action | Mental model | Rezultatas |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Kas yra VAUTO | H1 / paantraštė / CTA, ne `<title>` | first viewport | Ieškoti skelbimų / Parduoti su AI | universali platforma + AI padeda | PASS |
| 2 | Universal marketplace | 6 vertikalės | desktop + 375px, lygus dydis | — | nė viena ne „tikroji“ | PASS |
| 3 | NL search | 4 chip’ai kelioms vertikalėms | search landmark | fill → Enter → `#listing-results` + MacBook | ne tik placeholder | PASS |
| 4 | Noriu parduoti | `/add` funnel | kategorijos prieš laukus | Elektronika / MacBook kelias | nėra VIN / markė / rida | PASS |
| 5 | AI role boundary | hero + vizualus srautas + DUK | first-time puslapiai | — | padeda, nesprendžia, neapžiūri | PASS |
| 6 | Score nėra garantija | „analitinė rekomendacija“ | HomeValueProp + kortelės `title` | — | signalas, ne pažyma | PASS |
| 7 | Deal flow | Rask → Susitark → Sandorio eiga | how-it-works + visual flow | CTA ne „saugų sandorį“ | ne vienas mygtukas = saugumas | PASS |
| 8 | No false guarantee | home / add / DUK / apie | klasifikuotas kontekstas | — | nėra „VAUTO garantuoja“ | PASS |
| 9 | Fee terminology | 12A „platformos paslaugos mokestis“ | first-time + listing | — | nėra pirkėjo apsaugos mokesčio | PASS |
| 10 | Empty / auth | tuščia paieška + svečio `/add` | CTA „Laukiu šio daikto“ / Prisijungti | kita veiksmo pasiūlymas | ne auto-only, ne backend žargonas | PASS |
| 10C | Blank / whitespace input | hint prie paieškos | desktop + 375px + klaviatūra | Enter be navigacijos / API | kas negerai + ką daryti toliau | PASS |
| 11 | Mobile 375px | Hero, kategorijos, search, CTA, `/add` | visos 6 vertikalės | overflow ≤ 1px | — | PASS |
| 12 | Keyboard | Tab → search → kategorija → Parduoti su AI | focus + Enter | accessible name ≠ auto-only | label ir name neprieštarauja | PASS |

## Static copy audit (`src/`)

### Auto-only terminai

| Radinys | Klasifikacija |
| --- | --- |
| `adaptive-categories/config.ts` VIN / rida / markė placeholderiai | **Teisėta** — tik `vehicles` kategorijos laukai |
| `VehicleListingResults.tsx` empty: „Transporto skelbimų nerasta“ | **Teisėta** — transporto rezultatų tuščia būsena |
| `ListingGrid.tsx` chameleon `autoplius` empty | **Teisėta** — tema įsijungia po transporto užklausos |
| `agent-flow-wizard-orchestrator.ts` VIN po `category === "vehicles"` | **Teisėta** — tik pasirinkus transportą |
| DUK: „Specifiniai laukai (markė, plotas, dydis) atsiranda tik pagal kategoriją“ | **Teisėta** — paaiškina, kad tai ne universalūs laukai |
| Hero / `/add` / paieškos placeholderiai be markės/VIN | **Universalios vietos švarios** |

### Rizikinga platformos terminija

| Radinys | Klasifikacija |
| --- | --- |
| DUK: „Nenaudojame teiginių 100 % saugu“ | **Leistina** — neiginys |
| Hero / vizualus srautas: „ne garantuota rinkos kaina“ | **Leistina** — ribų paaiškinimas |
| `buyerProtectionExplanation()` / DUK: „nėra visų rizikų draudimas“ | **Leistina** — riba, ne draudimo produktas |
| DUK: „VAUTO neužtikrina pardavimo…“ | **Leistina** — neiginys, ne pažadas |
| Job catalog: „Sveikatos draudimas“ kaip darbo nauda | **Leistina** — prekės / darbo atributas |
| „Pirkėjo apsaugos mokestis“, „AI saugumo garantija“, „Saugus sandoris“, „Pradėti saugų sandorį“, „Ieškoti automobilio“ | **Nerasta** vartotojo UI |
| `ListingCard` „Gera kaina“ / „AI įvertinta“ | **LOW** — vizualus signalas; `title`: analitinis, ne garantija ir ne pirkimo rekomendacija |

### Universalaus UI pažeidimai

HIGH/MEDIUM auto-only prielaidų universaliose vietose **nerasta**.

## Minimalūs UI pakeitimai 12B metu

- `HomeCategoryGrid`: `data-vertical-id` (discoverability / E2E).
- `ListingCard`: `data-ai-price-signal` + `title` (score ≠ garantija).
- `/add`: pasirinktos vertikalės patvirtinimas (Elektronika / MacBook kelias).

## 12B.1 — Empty search input hardening

**Prieš:** `commitSearch()` darė `if (!q) return;` po `sanitizeSearchQuery(..., "final")` (`.trim()`). Homepage `handleSubmit` visada kviesdavo `inputRef.current?.blur()`. Tuščia arba tik tarpų įvestis → tylus return → blur → jokio paaiškinimo.

**Po:**
- `isBlankMarketplaceQuery()` — tas pats `trim()` kelias.
- Invalid submit: hint „Įveskite, ko ieškote, arba pasirinkite vieną iš pavyzdžių.“, focus grąžinamas, `aria-invalid="true"` + `aria-describedby` (be `role="alert"`).
- Nėra navigacijos ir nėra search API / `trackEvent`.
- Hint nuimamas pradėjus rašyti arba pasirinkus pavyzdžio frazę.
- Validi užklausa eina senu keliu.

12B.1 copy (`AiCommandBar.tsx`): nėra „pirkėjo apsaugos“, „saugaus sandorio“, „VAUTO garantuoja“, „100% saugu“, auto-only paieškos instrukcijų.

12A copy principai nepakeisti. 11J neliestas.

## QA (faktiniai rezultatai, 2026-08-14, 12B.1)

| Komanda | passed | failed | skipped | Exit |
| --- | --- | --- | --- | --- |
| `npx tsc --noEmit` | — | — | — | **0** |
| `npm run lint` | — | — | — | **0** (esami `react-hooks/exhaustive-deps` warning’ai ne 12B.1 failuose) |
| `npm run build` | — | — | — | **0** |
| `npx playwright test e2e/stage12b-user-comprehension.spec.ts` | **16** | **0** | **0** | **0** |
| `npm run test:adaptive` | **23** | **0** | **0** | **0** |

Playwright webServer: `node scripts/build-e2e-static.mjs && npx --yes serve@14.2.6 out -l 4173`.
Gyvo API / test DB šiam suite **nereikia**. SKIP testų nebuvo.
