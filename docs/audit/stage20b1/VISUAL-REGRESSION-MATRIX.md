# VAUTO Stage 20B.1 — VISUAL REGRESSION MATRIX

Etapas: **20B.1 — LEGACY DECOUPLING & E2E EVIDENCE HARDENING**
Data: **2026-08-20**
Būsena: **COMPLETE**

---

## 1. Apimtis

Po legacy decoupling atlikta targeted visual regression. Minimalus reikalavimas:

| Route | LIGHT | DARK |
|-------|-------|------|
| HOME | 1440 / 390 | 1440 / 390 |
| SEARCH / RESULTS | 1440 / 390 | 1440 / 390 |
| LISTING DETAIL | 1440 / 390 | 1440 / 390 |
| DISCOVER | 1440 / 390 | 1440 / 390 |
| DEAL ROOM | 1440 / 390 | 1440 / 390 |
| AI SEARCH / AiInterpretation | 1440 / 390 | 1440 / 390 |

MASTER LIGHT / MASTER DARK lieka vizualinis SOURCE OF TRUTH.

---

## 2. Tikrinami aspektai

- emerald accent
- surfaces
- typography
- spacing
- cards
- buttons
- navigation
- AI interpretation
- mobile overflow (ZERO horizontal overflow 390px)
- theme parity (LIGHT/DARK)

---

## 3. Evidence šaltiniai

1. **Stage 18P visual-evidence suite** (`e2e/stage18-visual-evidence.spec.ts`) —
   HOME / SEARCH / LISTING DETAIL / RE-SEARCH, LIGHT+DARK, 390/1440/1920.
   Pilnas run: **8/8 PASS** (žr. `stage20b1-e2e-stage17.log`).
   Screenshot'ai: `docs/ui-stage18/*.png` (šviežiai regeneruoti).

2. **20B.1 targeted visual regression** (`e2e/stage20b1-visual-regression.spec.ts`) —
   naujai sukurtas, dengia DISCOVER / DEAL ROOM (/sandoriai) / AI SEARCH
   (/search) LIGHT+DARK × 1440/390. **12/12 PASS** su **0 horizontal overflow**
   kiekviename kadre (assertintas kode).
   Screenshot'ai: `docs/audit/stage20b1/visual/*.png`.

3. **Stage 17 design-system suite** — overflow = 0 across breakpoints
   (390/430/768/1024/1440/1920) **PASS**.

4. **Stage 18N overflow suite** — homepage overflow = 0 per 6 breakpoints **PASS**.

---

## 4. Vizualinės regresijos matrica

| Route | LIGHT 1440 | LIGHT 390 | DARK 1440 | DARK 390 | Overflow 390 | Verdiktas |
|-------|------------|-----------|-----------|----------|--------------|-----------|
| HOME | PASS (18P) | PASS (18P) | PASS (18P) | PASS (18P) | **0** | ✅ |
| SEARCH / RESULTS | PASS (18P) | PASS (18P) | PASS (18P) | PASS (18P) | **0** | ✅ |
| LISTING DETAIL | PASS (18P) | PASS (18P) | PASS (18P) | PASS (18P) | **0** | ✅ |
| DISCOVER | PASS (20B.1) | PASS (20B.1) | PASS (20B.1) | PASS (20B.1) | **0** | ✅ |
| DEAL ROOM (/sandoriai) | PASS (20B.1) | PASS (20B.1) | PASS (20B.1) | PASS (20B.1) | **0** | ✅ |
| AI SEARCH (/search) | PASS (20B.1) | PASS (20B.1) | PASS (20B.1) | PASS (20B.1) | **0** | ✅ |
| RE-SEARCH (list+map) | PASS (18P) | PASS (18P) | PASS (18P) | PASS (18P) | **0** | ✅ |

---

## 5. MASTER LIGHT / DARK parity

- Emerald akcentas: `--ds-brand #10b981`, `--ds-ai #059669` — **nepakeistas**
  (Stage 20A certifikuoti tokenai).
- LIGHT bg: `#F7F8FB`, DARK bg: `#0b1220` — **nepakeisti**.
- Vertikalės neturi jokių portal-native paletės likučių: visos naudoja DS 2.0
  emerald identitetą (patvirtinta CSS cleanup Phase C + komponentų migracija).
- `chameleon-wardrobe` / `chameleon-flux` body class'ai dabar abu nukreipia į
  `var(--vauto-primary)` — jokio teal/blue/red skirtumo tarp vertikalių.
- LIGHT/DARK paritetas: 0 mismatch visose 6 routes (Stage 18P ir 20B.1).

---

## 6. Screenshot inventory

### docs/ui-stage18/ (Stage 18P — HOME/SEARCH/DETAIL/RE)

```
home-light-390.png / home-light-1440.png / home-light-1920.png
home-dark-390.png  / home-dark-1440.png  / home-dark-1920.png
search-light-390.png / search-light-1440.png
search-dark-390.png  / search-dark-1440.png
listing-light-390.png / listing-light-1440.png
listing-dark-390.png  / listing-dark-1440.png
re-search-light-390-list.png / re-search-light-1440-list.png / re-search-light-1440-map.png
re-search-dark-390-list.png  / re-search-dark-1440-list.png  / re-search-dark-1440-map.png
```

### docs/audit/stage20b1/visual/ (20B.1 — DISCOVER/DEAL ROOM/AI SEARCH)

```
discover-light-1440.png / discover-light-390.png / discover-dark-1440.png / discover-dark-390.png
sandoriai-light-1440.png / sandoriai-light-390.png / sandoriai-dark-1440.png / sandoriai-dark-390.png
search-light-1440.png / search-light-390.png / search-dark-1440.png / search-dark-390.png
```

---

## 7. Išvada

**VISUAL REGRESSION GATE: PASS.**

- Emerald accent, surfaces, typography, spacing, cards, buttons, navigation,
  AI interpretation — atitinka MASTER LIGHT / MASTER DARK etaloną.
- **390px horizontal overflow = 0** visuose 6 routes, abiejose temose.
- **Theme parity: 0 mismatch.**
- Jokio portal-specific visual identity neliko aktyviame VAUTO runtime.
