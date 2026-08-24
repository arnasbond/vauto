# VAUTO Master Theme Gap Analysis

Source of truth: `docs/design-reference/chatgpt-visual-baseline/VAUTO-MASTER-LIGHT.jpg` and `VAUTO-MASTER-DARK.jpg` (approved first VAUTO concept, category-rich, emerald).

Reference intent (from MASTER LIGHT/DARK): large hero „Pasakyk, ko nori. VAUTO padės padaryti visa kita."; large natural-language search input; suggested query examples; category cards with image/object imagery; structured „VAUTO suprato tavo užklausą" interpretation block; editable recognized parameters; result preview; clean premium light + faithful dark; emerald emphasis; category-rich homepage.

Severity: **P0** = blocks target product experience · **P1** = major visual/UX gap · **P2** = polish · **P3** = optional

---

## Gap Table

| Area | Target (MASTER) | Current production | Severity |
|---|---|---|---|
| Homepage hierarchy | Hero-first, category-rich, AI intent block prominent | Hero + search present; hero message differs; category grid icon-based and secondary | P1 |
| Hero | „Pasakyk, ko nori. VAUTO padės padaryti visa kita." | „AI padeda. Žmogus sprendžia." + subtitle | P1 |
| Navigation | Calm, minimal, premium | Functional app shell; token-driven | P2 |
| NL search | Large, prominent, placeholder example | Large `AiCommandBar` with example placeholder „Pvz. 2 kambarių butas…" | P2 |
| Examples | Suggested query chips under search | 4 example chips present | P2 |
| Categories | Image/object imagery cards | Icon + label tiles (2×3 grid) | P1 |
| „VAUTO suprato tavo užklausą" block | Structured interpretation with recognized params | Exists as `AiInterpretationChips` („AI pateikė kriterijus — juos galite keisti arba pašalinti"), `data-ai-interpretation`, chips editable | P2 |
| Result preview | Beside/below structured intent | `ListingGrid` below hero via `DesktopHomeLayout` | P2 |
| Listing card/detail | Premium, photography-led | Token-based cards (via `ListingCard` primitive) | P2 |
| Desktop | Full-width premium | Responsive desktop layout | P2 |
| Mobile | Same hierarchy, compact | Mobile-first; drawer facets | P2 |
| Light/dark parity | Faithful counterpart | Full dark theme via `[data-app-theme=dark]`; verified in E2E | P2 (good) |
| Spacing | Calm, generous whitespace | Token-driven 4px grid | P2 |
| Typography | Strong display type | Geist via `--font-geist-sans`; display utility classes | P2 |
| Component depth | Subtle depth (shadow, layered surfaces) | `--ds-shadow-*` tokens; cards use border+shadow | P2 |
| Emerald usage | Distinctive, measured | Emerald brand `--ds-brand #10b981` used for accent/CTAs; meaningful | P1 (good baseline) |
| Image usage | Photography/object imagery in categories | No imagery in category tiles; listing covers only | P1 |
| Responsive behavior | 1920/1440/768/390 robust | Verified via E2E (22A responsive suites, overflow guards) | P2 |
| Accessibility/interaction | Focus rings, keyboard, reduced motion | `--ds-focus-ring*`, `prefers-reduced-motion` zeroing; a11y E2E suites | P2 |

---

## Highest-Value Coherent Alignment Scope (overnight, safe)

1. **Hero message alignment (P1)**: Update hero headline to the approved „Pasakyk, ko nori. VAUTO padės padaryti visa kita." while retaining the „AI padeda. Žmogus sprendžia." as a supporting line — both are product doctrine. Subtitle retained.
2. **Hero composition (P1)**: Raise the NL search into the hero immediately under the headline (matches MASTER), keeping example chips + interpretation block + category grid below.
3. **Category cards with imagery (P1)**: Upgrade `HomeCategoryGrid` from icon-only tiles to image/object-driven cards using the existing per-vertical visual assets if available (or token-gradient cards with icon + label if no assets exist), keeping `data-vertical-id` / `data-canonical-vertical` hooks and behavior identical.
4. **„VAUTO suprato tavo užklausą" label alignment (P2)**: Align the interpretation block heading label with the approved phrasing where behavior is already data-driven (no fake AI).
5. **Token discipline (P2)**: Use `--ds-*` tokens throughout; no new scattered hard-coded hex.

Non-goals: no redesign of listing detail, no theme-wide rewrite, no legacy simulator reactivation, no Stage 11 changes, no deep-link/hydration regression.

## Risks / Guards

- Preserve `data-*` hooks used by E2E (`data-home-h1`, `data-search-examples`, `data-home-category-grid`, `data-ai-interpretation`, `data-ai-chips`, etc.).
- Preserve routing/search behavior and canonical facet hydration (Stage 22C).
- Keep all text Lithuanian; space before „€".
- Do not import reference JPGs into production.
