# Stage 20B.1 — AUTHENTICATED DEAL ROOM VISUAL EVIDENCE

Etapas: **20B.1 — LEGACY DECOUPLING & E2E EVIDENCE HARDENING**
Data: **2026-08-20**
Statusas: **COMPLETE — REAL, AUTHENTICATED DEAL ROOM, LIGHT + DARK**

---

## 1. Tikslas

Uždaryti 20B.1 vizualinės regresijos spragą: esamas `stage20b1-visual-regression.spec.ts`
atidarydavo `/sandoriai/` **BE autentifikacijos** ir **BE seeded transakcijos**, todėl jo
kadrai negalėjo įrodyti realaus Deal Room. Šis spec naudoja sertifikuotą Stage 13C harness
flow ir fiksuoja **tikrą, autentifikuotą Deal Room** su realia transakcija.

**Griežtai jokio production source pakeitimo** — tik fixture / harness / test setup.

---

## 2. Kaip buvo pasiektas determinizmas

1. **Stage 12A harness** paleistas ant `127.0.0.1:4013` — tikri routeriai + PGlite DB.
2. **Listing seed**: `POST /api/test/seed-listing` → `L-20B1-EVIDENCE`
   (Citroën C4 1.6 HDi, 1000 €, TRANSPORT verticale).
3. **Transakcija**: `POST /api/listings/L-20B1-EVIDENCE/transactions` su `mintHarnessToken`
   (pirkėjas) → gaunamas `txId`.
4. **Autentifikuotas session**: `seedHarnessUser` + `mintHarnessToken` → localStorage
   `vauto_access_token_v1` + `vauto_auth_v1`.
5. **Tema**: `vauto_app_theme_v1` (kanoninis raktas, kurį skaito `AppThemeProvider`) +
   `data-app-theme` atributas + `emulateMedia({ colorScheme })`.
6. **Atidaryta**: `/sandoriai/?id=<txId>` — autentifikuota sesija, reali transakcija.

---

## 3. Deal Room autentiškumo proof (DOM lygmuo, kiekvienam kadrui)

Visi teiginiai assertinti kode (`e2e/stage20b1-deal-room-evidence.spec.ts`):

| Proof | Rezultatas |
|-------|-----------|
| `[data-deal-room]` visible + `data-deal-state` truthy | ✅ |
| „Pirkėjo kambarys" tekstas visible | ✅ |
| `[data-deal-status-stepper]` attached | ✅ |
| `#offer-cents` (pasiūlymo kainos įvedimas) visible | ✅ |
| `[data-submit-offer]` (pasiūlymo mygtukas) visible | ✅ |
| `[data-open-deal-help]` (pagalbos mygtukas) visible | ✅ |
| `.vauto-auth-overlay` count = 0 (jokio auth modal) | ✅ |
| „Prisijungti" NOT visible (jokio login UI) | ✅ |
| URL path = `/sandoriai` (jokio auth-gate redirect) | ✅ |
| **Horizontal overflow = 0** | ✅ |

### Known quirk

`/sandoriai/?id=<txId>` query parametras gali išnykti iš URL po hydration
(Next.js static export quirk — dokumentuota `stage12a-deal-room-flows.spec.ts`).
Deal Room lieka mounted, nes `useSearchParams` išlaiko stale id — todėl content proof
vyksta per DOM, ne per URL. Tai **ne produkto defektas** — patvirtinta, kad room veikia.

---

## 4. Vizualinis proof (pixel lygmuo)

| Kadras | Dydis | Background | Surface | Hash (MD5) |
|--------|-------|-----------|---------|------------|
| `deal-room-light-1440.png` | 77697 | `#EEF1F6` | `#FFFFFF` | `af38d6a4…` |
| `deal-room-dark-1440.png` | 74567 | `#0B1220` | `#121A2B` | `2a6f0e2f…` |
| `deal-room-light-390.png` | 70775 | šviesus | `#FFFFFF` | `b7e2ad6f…` |
| `deal-room-dark-390.png` | 67970 | tamsus | `#121A2B` | `5e34ed27…` |

- Dark surface `#0B1220` = Stage 20A certifikuota dark page surface.
- Dark card `#121A2B` = Stage 20A certifikuota dark card surface.
- Light/dark hash'ai skiriasi → **temos tikrai veikia** (ne identiški kadrai).
- Desktop portal dark re-map veikia per `[data-app-theme="dark"] .vauto-desktop-portal`.

---

## 5. Rezultatai

| Temos | 1440px | 390px | Overflow |
|-------|--------|-------|----------|
| LIGHT | ✅ | ✅ | **0** |
| DARK | ✅ | ✅ | **0** |

- **4/4 kadrai**: tikras, autentifikuotas Deal Room.
- **Jokio login/auth redirect** — nė vienas kadras nėra auth modal.
- **Horizontal overflow = 0** abiejose temose, abiejuose viewportuose.
- **Production source NEPALIESTAS** — pataisytas tik test setup (neteisingas
  localStorage raktas `vauto_theme_v1` → kanoninis `vauto_app_theme_v1`).

---

## 6. Failai

- Spec: `e2e/stage20b1-deal-room-evidence.spec.ts`
- Evidence: `docs/audit/stage20b1/visual-deal-room/*.png`
- Harness: `e2e/helpers/stage12a-harness.ts` (nepakeistas)
- Harness server: `server/src/test/stage12a-http-app.ts` (nepakeistas)

**STATUS: NO PRODUCTION CHANGE — EVIDENCE PACKAGING ONLY.**
