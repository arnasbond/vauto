# VAUTO — Experience System

Version: Stage 17 (Stage 16 certified FULL PASS; base `d4b7b41a`)
Scope: UX principles that VAUTO's visual and product language must follow.
These are **binding** for every screen and component. They accompany
`docs/STAGE-17-AUDIT.md` (current UI inventory) and the Design System tokens
(`src/design-system/tokens.css`).

---

## 1. „Pasakyk, ko nori" (Natural-language first, never AI-only)

The primary VAUTO entrance is a natural-language prompt / AI dialogue. But the
AI is **one of many ways**, never the only way. A user must always be able to:

- search with classic keyword search;
- browse by category;
- use filters and sorting;
- use the map;
- create a listing manually.

**If the AI endpoint fails (timeout, 500, unavailable, rate-limited), the
portal must work normally.** No screen may lock because of AI. AI is an
enhancement, not a dependency.

## 2. Progressive disclosure

The first screen is very simple. We do **not** show 30 filters at once. Default
view shows:

- search input;
- the most important action;
- categories;
- a few context-relevant suggestions.

Detail appears only when the user asks for it (filters → sheet, facets → expand,
Deal Room details → reveal).

## 3. The „3-second rule"

Within ~3 seconds of loading, any user must understand:

- what VAUTO is;
- what can be done here;
- where to click.

Hardest action (search / create) is visually primary; everything else recedes.

## 4. Universal clarity

The design must be understood by: a young user, a senior, a first-time visitor,
a professional seller, and a business. **Simplicity beats decorative effect.**
No confusion for its own sake, no clever-but-ambiguous patterns. Every label is
plain Lithuanian; every price is shown as `NNN €` (a space before `€`).

## 5. WOW through behaviour, not tricks

„Wow" comes from:

- very smooth search;
- smart context;
- fast, incremental result updates;
- a clear map;
- quality photos;
- subtle transitions;
- premium detail.

Not from excessive glow, animations, or flashing effects. Motion stays subtle
and honors `prefers-reduced-motion`.

---

## Organic responsive composition (Stage 17L)

VAUTO is **not** one layout stretched/scaled to each screen. Each breakpoint owns
its composition (structure changes, not just size).

| Breakpoint | Composition |
|---|---|
| Mobile ~390px | Single clear column; bottom/compact navigation; large touch targets (~44×44 for critical actions); key actions first; less info visible; drawers and bottom sheets replace sidebars; **no horizontal scroll** |
| Tablet ~768–1024px | Not mobile-stretch; optional 2-column structure; navigation and filters reorganize (meta nav, sheet filters), spacing and card density tuned for tablet |
| Desktop ~1440px | Full professional web app feel; meaningful but not edge-to-edge width; clear max-width + grid; 2–3 column structures; persistent sidebar where useful; higher search/filter information density |
| Large ≥1920px | Content does **not** stretch; max-width containers, extra whitespace, balanced column proportions, short text lines, natural card widths, clear visual center |

### Organic-layout rules (structural change, not just size)

- sidebar → drawer on mobile;
- 2 columns → 1 column on mobile;
- persistent filters → filter sheet on mobile;
- desktop toolbar → compact mobile actions;
- wide data density → progressive disclosure;
- map + list → list/map toggle on mobile (two squeezed columns is forbidden).

### Visual quality gates

- **Desktop (1440×900 / 1920×1080):** balance, whitespace, grid proportions,
  content density, typography scale, alignment, card width, sidebar width, nav
  height, visual hierarchy. If it looks like „mobile stretched across the
  monitor" → FAIL.
- **Mobile (390×844 / 430×932):** if it looks like compressed desktop → FAIL.
- **Tablet (768×1024 / 1024×768):** neither broken desktop nor too-wide mobile.

### Horizontal-overflow rule

Horizontal scroll = **0** at every breakpoint. The adaptive content wrapper clips
overflow (`[data-app-content] { overflow-x: clip }`); grids use `minmax(0, …)`
where they could overflow; intentional carousels may scroll in one axis only and
must degrade gracefully.

### Breakpoint single source of truth (Stage 17.1-C, Variant A)

There is **one canonical responsive contract**, defined here. It maps the design
contract to the runtime implementation so no "second source of truth" ambiguity
remains.

**Runtime implementation = Tailwind breakpoints** (`sm` / `md` / `lg` / `xl` /
`2xl` via Tailwind CSS v4 defaults). These are the real `@media (min-width: …)`
queries that drive layout composition in code. Example — the content wrapper
(`Container`) switches gutters at `md:` and `xl:`:

```tsx
"mx-auto w-full max-w-[var(--ds-content-max)] px-[var(--ds-gutter-mobile)] md:px-[var(--ds-gutter-tablet)] xl:px-[var(--ds-gutter-desktop)]"
```

**Design / documentation contract = `--ds-bp-*` tokens** in
`src/design-system/tokens.css`. They are reference *values* describing the
intended composition for each viewport target. They are **not** used inside CSS
media queries — never as runtime media-query conditions. This keeps the token
block an auditable spec rather than a fragile runtime source.

| Design contract (`--ds-bp-*`) | Viewport seam | Tailwind runtime seam | Semantic intent |
|---|---|---|---|
| `--ds-bp-mobile-max` = 767.98px | ≤767 | below `md` | single column, bottom/compact nav |
| `--ds-bp-tablet-min` = 768px (`tablet-max` 1023.98) | 768–1023 | `md` (48rem=768) ↔ below `lg` | optional 2-column, meta nav, sheet filters |
| `--ds-bp-desktop-min` = 1024px | 1024–1439 | `lg` (64rem=1024) + `xl` (80rem=1280) | professional density, 2–3 columns |
| `--ds-bp-large-min` = 1440px | 1440–1919 | above `xl`, `2xl` (96rem=1536) | max-width container, whitespace |
| `--ds-bp-wide-min` = 1920px | ≥1920 | ≥`2xl` | large desktop, no stretch, clear center |

**Semantic equivalence:** the two seams that change *structure* — tablet (`768`)
and desktop (`1024`) — match exactly between the design contract and Tailwind
(`md:`, `lg:`). The `xl`/`2xl` seams (1280/1536) are used for *density/inline*
tuning inside the desktop band, while `--ds-bp-large/wide-min` (1440/1920) name
the viewport targets used by the E2E / screenshot matrix. Both are correct under
Variant A because they describe different concerns (runtime gradients vs.
composition targets).

**Mandatory verification matrix** (kept green by `e2e/stage17-design-system.spec.ts`
and `e2e/stage171-url-view-state.spec.ts`):

| Viewport | Width | Horizontal scroll |
|---|---|---|
| Mobile | 390 | `= 0` |
| Tablet | 768 | `= 0` |
| Desktop | 1440 | `= 0` |
| Large | 1920 | `= 0` |

**Do not** mass-refactor Tailwind breakpoints. If a future stage needs a
canonical CSS-only media contract (Variant B), treat `--ds-bp-*` as the single
source and introduce custom media queries locally — but that is a deliberate,
incremental change, not a global rewrite.

---

## Design language

- **Direction:** Scandinavian clarity + premium technological character. Clean,
  expensive, technical, calm, modern, easy to understand.
- **Peers to think like:** Vinted / Airbnb simplicity, Stripe/Vercel
  clarity, Apple restraint — not gaming neon, not overloaded glassmorphism.
- **Accent (emerald / neon-green, used sparingly).** Per Stage 17 the accent
  character is emerald/neon-green. It is reserved for: primary CTA, active
  state, AI signal, important status. It must **not** flood the UI.
- **Two themes only:** LIGHT and DARK (semantic tokens `--ds-*`). There is no
  third „original"/„classic"/„legacy" user theme.
- **Typography hierarchy:** very clear title / subtitle / body; generous
  line-height (`1.5–1.65`); shorter text lines (`65ch` max measure); more
  whitespace; strong mobile readability.
- **Layout tokens:** max-width `--ds-content-max` (80rem), gutters
  `--ds-gutter-*`, section rhythm `--ds-section-gap`, grid gap `--ds-grid-gap`.

---

## Stage 17 scope guardrail

Stage 17 establishes the **foundation for a later bigger UI rebuild**: tokens,
DS primitives, typography/layout contract, responsive-composition contract, and
the experience principles above. It does **not** rewrite product workflow logic
and does not touch the certified Stage 10–16 core (payments, ledger, Stripe,
Deal Room server logic, 13A/13B semantics, migrations).
