# VAUTO Voice & Language Guide

**Principas:** «AI padeda. Žmogus sprendžia.»

Šis dokumentas yra produkto kalbos šaltinis. Visi vartotojui matomi tekstai (UI, onboarding, DUK, AI atsakymai, meta aprašymai) privalo atitikti **realiai kode egzistuojančias** galimybes. Draudžiama žadėti funkcijas, garantijas ar autonomiją, kurios backend techniškai neatlieka.

Etapas 12B (First-Time User Comprehension Test) **nepradedamas** šiuo dokumentu — tai 12A kalbos addendumas.

## 1. Brand principas

VAUTO yra išmanioji skelbimų ir sandorio eigos platforma, ne autonominis brokeris.

- AI paruošia, atrenka, siūlo ir paaiškina.
- Žmogus tvirtina publikavimą, kainą, mokėjimą, siuntą, gavimą ir atsiliepimą.
- Naršyklė niekada nėra tiesos šaltinis sandorio būsenai (`PAID`, `SHIPPED`, `COMPLETED`).

### Formulė (homepage / „Kaip tai veikia“)

| Kelias | Formulė |
| --- | --- |
| Parduodu | Parodau arba papasakoju → VAUTO paruošia → aš patvirtinu. |
| Perku | Pasakau, ko ieškau → VAUTO atrenka → palyginu ir pasirenku. |
| Sandoris | Susitariame → VAUTO padeda aiškiai pereiti visą sandorio eigą. |

Skirtumas nuo paprasto skelbimų portalo: Deal Room (pasiūlymas, Stripe mokėjimas, Omniva sekimas, ginčas, patvirtintas atsiliepimas), o būsenas tvirtina serveris.

## 2. Vieninga terminologija

Naudokite šiuos terminus lietuviškai. Angliški kodiniai vardai — tik docs / API.

| Produktas | UI (LT) | Reikšmė (sąžininga) |
| --- | --- | --- |
| AI Search | Paieška su AI | Atrenka ir rikiuoja skelbimus pagal užklausą. |
| Visual Sell | Skelbimas iš nuotraukos | Juodraštis iš nuotraukos; publikuoja vartotojas. |
| Voice Sell | Skelbimas balsu / sakiniu | Juodraštis iš pasakojimo; publikuoja vartotojas. |
| VAUTO Score | VAUTO Score | Analitinis įvertis, **ne** garantuota rinkos vertė ir **ne** būklės pažyma. |
| Buyer Match | Pirkėjo atitiktis | Rekomendacija palyginimui, ne garantuotas pirkėjas. |
| Compare | Palyginimas | Padeda palyginti; pasirinkimą daro žmogus. |
| AI Watch | Stebėjimas | Praneša apie atitikmenis; negarantuoja, kad atsiras skelbimas. |
| Negotiation Copilot / Twin | Derybų asistentas | Siūlo šabloninius atsakymus pagal pardavėjo ribas. Nesudaro sandorio. |
| Deal Room | Sandorio kambarys | Šalių eiga: pasiūlymas → mokėjimas → siunta → gavimas → užbaigimas. |
| Verified Review | Patvirtintas atsiliepimas | Tik po **COMPLETED** sandorio, kuriame dalyvavote. |
| Escrow / payment | Mokėjimas per VAUTO | Suma iš sutarties kopijos; apmokėjimą fiksuoja pasirašytas Stripe webhook. |

Kainos rašymas: visada tarpas prieš simbolį — `105 €`, niekada `105€`.

## 3. Tone of voice

- **Aiškus:** kas vyksta, ką tai reiškia, ką galima daryti toliau.
- **Konkretus:** būsenos, mygtukai, sumos. Be „magijos“.
- **Žmogiškas:** lietuviškai, be dirbtinio AI žargono („agentas orkestruoja“, „autonominis twin 24/7“).
- **Sąžiningas:** jei funkcija beta / demo / neprijungta — taip ir parašyti (`feature-readiness`).

Venkite: „super-AI“, „garantuoja pardavimą per minutes“, „100 % saugu“, angliškų kodų (`ECONNREFUSED`, SQL) vartotojo ekrane.

## 4. Forbidden Claims

Griežtai draudžiama teigti, kad AI arba VAUTO:

1. **Garantuoja kainą ar automobilio būklę.** VAUTO Score / kainos rėžis = analitinė rekomendacija.
2. **Garantuoja pardavimą, pirkėją ar pristatymo terminą.**
3. **Savarankiškai sudaro sandorį** arba priima finansinius sprendimus (moka, paleidžia lėšas, keičia būseną naršyklėje).
4. **Pakeičia profesionalią fizinę automobilio (ar prekės) patikrą.**
5. Naudoti absoliutus saugumo teiginius: „100 % saugu“, „garantuotas pardavėjas“, „garantiškas grąžinimas visais atvejais“.
6. Žadėti, kad derybų asistentas veikia **24/7 kaip autonominis agentas**, kuris pats sudaro sandorį.
7. Neįrodyti rinkodaros teiginiai: „Pirmoji Lietuvoje“, fiksuotas publikavimo laikas („per 10 s“), „oficialus OMX live API“, „Regitra dokumentų techniniai duomenys“ kaip garantija, kodiniai vardai (`Social Engine`, `b2bTrustBoost`, „ROI analytics“), „TOP dovana“ / nemokamas TOP iškėlimas, „0 € 3 mėnesius“ jei tai nėra aktyvi, kode įjungta ir vartotojui matoma billing būsena.

Leidžiama: „padeda“, „paruošia juodraštį“, „atrenka“, „rekomenduoja“, „veda eigą“, „Omniva siuntų sekimo integracija“, „greitas skelbimo paruošimas su AI asistentu“, „mokėjimas laikomas, kol patvirtinate gavimą arba sprendžiamas ginčas“.

## 5. Trust / Verified Reviews

- „Patvirtintas atsiliepimas“ = susietas su realiai įvykusiu **COMPLETED** sandoriu.
- VAUTO parenka, ką vertinate (`revieweeId` nesiunčiamas iš kliento).
- Tuščia reputacija **nėra** „0 žvaigždučių“ — tekstas: „Dar nėra patvirtintų atsiliepimų“.
- Vidurkis rodomas dviem skaičiais po kablelio.
- „Paskyra patvirtinta“ = tapatybės / kontakto signalas, **ne** „garantuotas pardavėjas“.

## 6. UI rašymo taisyklės

### CTA

- Veiksmažodis + objektas: „Pateikti pasiūlymą“, „Priimti pasiūlymą“, „Apmokėti saugiai“, „Sukurti lipduką“, „Patvirtinti gavimą“.
- „Saugiai“ mokėjimo CTA reiškia *per platformos eigą*, ne visų rizikų draudimą. Paaiškinimas šalia mygtuko.

### Klaidos

Struktūra: **kas vyksta → ką tai reiškia → ką daryti**.

- 401: „Prisijungimas nebegalioja. Prašome prisijungti iš naujo.“
- 403 (atsiliepimas): „Atsiliepimą galima palikti tik užbaigtam sandoriui, kuriame dalyvaujate.“
- 404 (sandoris): „Sandoris nerastas.“ (IDOR — ne 403)
- 409 (atsiliepimas): „Jūs jau įvertinote šį sandorį“
- 5xx: „Laikinai nepavyko. Bandykite dar kartą.“ Be SQL, stack, vidinių kodų.

### Empty

- Sandorių sąrašas: nėra aktyvių sandorių + kaip pradėti (iš skelbimo).
- Reputacija: nėra patvirtintų atsiliepimų (ne 0.00).

### Loading

- „Kraunamas sandorio kambarys…“, „Kraunama reputacija…“ — kas vyksta, be spinnerio be konteksto.

### Confirmation dialogs

- Ginčas, gavimas, užbaigimas: paaiškinti, kad sprendimą / būseną tvirtina serveris, ne AI.
- Publikavimas visada lieka rankinis mygtukas.

## 7. FAQ (produkto DUK)

Gyvas puslapis: `/duk/`. Privalomos temos: skirtumas nuo skelbimų portalo, pardavimas, pirkimas, sandorio eiga, mokėjimas, Omniva, ginčai, patvirtinti atsiliepimai, ką VAUTO daro ir ko **negarantuoja**.

## 8. AI atsakymai

Sistemos instrukcijos ir greitieji atsakymai privalo kartoti šį principą. Jei modelis siūlo derybų asistentą — pasakyti, kad tai šabloniniai atsakymai pagal ribas, o sandorį tvirtina pardavėjas.
