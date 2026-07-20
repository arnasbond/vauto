# VAUTO v1 — produkto konstitucija

**Autorius:** Arnoldas · **Produktas:** Kelrodė žvaigždė (VAUTO)  
**Statusas:** vienintelė tiesa v1 laikotarpiui. Bet koks AI / žmogus / PR privalo paklusti šiam puslapiui.  
**Hero sakinys (DoD):** *Per ≤60 s privatus žmogus Lietuvoje: nuotrauka → kaina → publikuota → gauna pranešimą, kai kas nors rašo.*

---

## 1. Kas mes esame

VAUTO — AI-first skelbimų rinka. Ne „dar viena forma“.  
Vartotojas sako **„noriu parduoti“** (arba įkelia nuotrauką) — ir yra vedamas pokalbiu iki sėkmingo įkėlimo.  
Po įkėlimo — gyvas pokalbis su pirkėju; jei pardavėjas nepasiekiamas — ribotas AI dvynys.

**Lengviau nei Skelbiu forma.** Ne „lengviau nei ChatGPT visur“.

---

## 2. SHIP (v1 — daryti dabar)

| # | Privaloma | Apibrėžimas „done“ |
|---|-----------|-------------------|
| S1 | Parduok per agentą | Vienas srautas: Intent → SM (`DRAFTING_TEXT` → `AWAITING_PHOTOS` → `AWAITING_CONFIRMATION`) → PrePublish kortelė → fizinis **Patvirtinti ir publikuoti** |
| S2 | Nuotraukos + Vision | Iki 6 foto; AI praturtina aprašymą (ne „nuotrauka įdėta“) |
| S3 | Profilio autoritetas | Miestas / telefonas iš profilio; trūksta → `/profile`, ne klausinėti chate kaip formos laukų |
| S4 | Po publish — signalas | Push / in-app: nauja žinutė; galima atsakyti realiu laiku (SSE + push pakanka) |
| S5 | AI dvynys MVP | Tik šablonai: „Dar aktualu?“, kainos riba, „Perduoti žmogui“. Jokio „pilno pardavėjo“ |
| S6 | Spinta = ta pati SM | `?vertical=fashion` tik oda / kategorija `clothing`, ne antras publish kelias |

**v1 sėkmė:** 10 pažįstamų be instrukcijos įkelia skelbimą; ≥70% baigia be „užstrigau“.

---

## 3. FORBID (v1 — draudžiama)

- Antras publish kelias (forma, wizard, Zero-UI confirmation kaip tiesa, „įkelti ranka“ be agento).
- Naujas didelis refaktorius / monorepo / „išvalyti visą SellerFlow“ be hero metriku.
- Live Omniva / pastomatas kaip „veikia“ (leidžiama tik aiškiai pažymėta **simuliacija**).
- WebSocket religija, kol SSE + push dengia chatą.
- Pilnas verslo ERP: sandėlis, masinis admin agentas, sudėtingas B2B dashboardas.
- Neribotas AI derybose (kainų išradinėjimas, teisiniai pažadai, „parduodu už tave“).
- Naujos vertikalės / portalų sinchronizacija (Vinted, Facebook auto) prieš S1–S4 žalius.
- Purple redesign, antras dizaino sistema, „dar vienas overlay“.

Jei užduotis nepadeda **hero sakiniui** — **NE**.

---

## 4. PENKI KPI (matuoti kas savaitę)

1. **Time-to-publish (P50)** — nuo pirmo „parduoti“ / pirmos foto iki publikuoto skelbimo. Tikslas: **≤60 s** tipiniam case (2–3 foto, kaina žinoma).  
2. **Completion rate** — pradėjo listing flow → sėkmingai publikavo. Tikslas: **≥70%**.  
3. **Re-ask rate** — agentas paklausė miesto/telefono, nors profilis turi. Tikslas: **≈0%**.  
4. **First-response latency** — pirkėjo žinutė → pardavėjas gavo signalą (push/in-app). Tikslas: **≤30 s** median.  
5. **Twin escalate rate** — AI dvynio sesijos, kuriose žmogus perėmė per 24 h. Tikslas: **≥40%** (dvynys padeda, ne slepia žmones).

Be šių skaičių „padariau architektūrą“ ≠ progress.

---

## 5. Fazių tvarka (griežta)

| Fazė | Kada | Turinys |
|------|------|---------|
| **A — Hero** | Dabar | S1–S4 stabilūs, KPI 1–4 matuojami |
| **B — Verslas light** | Po A žalio | PVM eilutė, after-hours FAQ, paprastas multi-draft (ne ERP) |
| **C — Logistika / twin+** | Po B | Live pastomatas tik su partneriu; platesnis twin su audit log |

Negalima lygiagrečiai „užbaigti C“, kol A raudonas.

---

## 6. Taisyklės AI agentams (Cursor / Gemini / ChatGPT)

1. Pirmiausia perskaityk šį failą. Jei konfliktas su senu planu — **laží šis**.  
2. Vienas PR = vienas hero žingsnis. Nesiūlyk B/C scope.  
3. Kritinis veiksmas = UI kontrolė (mygtukas/kortelė), ne vien chat „tinka“.  
4. Simuliaciją vadink simuliacija.  
5. Po darbo atsakyk: *Ar hero sakinys greitesnis / patikimesnis? Taip/Ne + kodėl.*

---

## 7. Vienas testas sau (Arnoldai)

Atidaryk telefoną inkognito mintyse:  
„Turiu dviratį Kaune, 150 €, 3 foto.“  

Jei negali per minutę iki „publikuota“ ir žinutės — v1 dar nebaigtas. Visa kita — triukšmas.
