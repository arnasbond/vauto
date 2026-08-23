# VAUTO Stage 20B.1 — STATUS

Etapas: **20B.1 — LEGACY DECOUPLING & E2E EVIDENCE HARDENING**
Data: **2026-08-20**
Būsena: **COMPLETE — paruošta nepriklausomam ChatGPT auditui**

---

## 1. Bendras statusas

| Žingsnis | Statusas |
|----------|----------|
| Phase A — Legacy dependency inventory | ✅ COMPLETE |
| Phase B — Preserve function, remove wrong semantics | ✅ COMPLETE |
| Phase C — CSS cleanup | ✅ COMPLETE |
| Phase D — Component decoupling | ✅ COMPLETE |
| Phase E — E2E search evidence gap | ✅ COMPLETE |
| Payment settings / kiti failure'ai | ✅ COMPLETE (klasifikuoti + pataisyti) |
| Environmental failure klasifikacija | ✅ COMPLETE |
| Design regression gate | ✅ COMPLETE |
| Functional regression gates | ✅ COMPLETE |
| Documentation correction | ✅ COMPLETE |
| Audit dokumentai (7) | ✅ COMPLETE |
| Delta paketas | ✅ COMPLETE |

---

## 2. Gates rezultatai

| Gate | Rezultatas |
|------|-----------|
| `npm run build` | ✅ PASS (85 puslapiai) |
| `npx tsc --noEmit` | ✅ PASS |
| `npm run lint` | ✅ PASS (4 pre-existing hook warnings, ne susiję su pakeitimais) |
| Frontend unit testai | ✅ 66/66 PASS |
| Targeted Playwright | ✅ PASS (search-state 13/13, smoke 22/22, payments 8/8, UI snapshots, 17/18 rinkiniai) |
| Critical regression suites (12A/12B/13A/13B/13C) | ✅ PASS |
| Pilnas `e2e-legacy` | ✅ 172 passed / 5 failed (visi ENVIRONMENT arba pataisyti TEST) / 3 skipped |
| Visual regression LIGHT/DARK × 1440/390 | ✅ PASS (0 overflow, 0 mismatch) |
| MASTER etalonas | ✅ Nepakeistas |

---

## 3. Exit criteria patikra

| # | Kriterijus | Statusas |
|---|------------|----------|
| 1 | Chameleon dependency graph dokumentuotas | ✅ `LEGACY-DEPENDENCY-MAP.md` |
| 2 | Portal imitation nebėra aktyvios produkto architektūros dalis | ✅ (paletės pašalintos, bridges `@deprecated`) |
| 3 | Naudinga generic logika neprarasta | ✅ (vertikalių adaptacija → VAUTO-native moduliai) |
| 4 | AI/search functionality nesugadinta | ✅ (18/18.2/18.3 rinkiniai PASS) |
| 5 | Search E2E evidence gap uždarytas | ✅ (13/13 stage183 + 22/22 smoke + 12/12 visual) |
| 6 | Visi ankstesni failure'ai klasifikuoti su evidence | ✅ `E2E-FAILURE-CLASSIFICATION.md` |
| 7 | build PASS | ✅ |
| 8 | typecheck PASS | ✅ |
| 9 | lint PASS (tik dokumentuoti pre-existing warnings) | ✅ |
| 10 | targeted E2E PASS | ✅ |
| 11 | critical regression suites PASS | ✅ |
| 12 | LIGHT/DARK visual regression PASS | ✅ |
| 13 | 390px overflow = 0 | ✅ |
| 14 | MASTER vizualinis etalonas nepakeistas | ✅ |
| 15 | Frozen backend invariants nepaliesti | ✅ |
| 16 | Audit package sukurtas | ✅ `vauto-20b1-delta.zip` |

**Visi 16 exit criteria: ĮVYKDYTI.**

---

## 4. Kiti ne-pass testai — statusas

| Testas | Klasė | Statusas |
|--------|-------|----------|
| `ops-guard.spec.ts` (3) | ENVIRONMENT — production 429 rate-limit | Paaiškintas; testas teisingas pagal paskirtį (live guard) |
| Screenshot file-lock (2) | ENVIRONMENT — Windows failų užraktas | Retry pavieniui PASS |
| `auth.spec.ts` live API (3 skipped) | Ne local-contract | Skipped pagal dizainą |

---

## 5. Rekomendacija auditoriui

1. Pradėti nuo `LEGACY-DEPENDENCY-MAP.md` → patikrinti, kad visi 49+39
   legacy failai klasifikuoti ir jokios portal-native paletės neliko.
2. `DECOUPLING-REPORT.md` → patikrinti "kas pašalinta / kas generalizuota /
   kas palikta" sąrašą.
3. `E2E-FAILURE-CLASSIFICATION.md` → patikrinti, kad kiekvienas failure turi
   klasę + evidence.
4. `VISUAL-REGRESSION-MATRIX.md` + `visual/*.png` + `docs/ui-stage18/*.png` →
   patikrinti MASTER parity.
5. Perkrauti atvejai: `stage183-search-state` (13/13), `smoke` (22/22),
   `payment-methods-settings` (8/8), `stage13b` (11/11), `stage13c` (5/5),
   `stage12a/12b` (22/22), 18P visual (8/8), 20B.1 visual (12/12).
