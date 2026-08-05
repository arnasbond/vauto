# VAUTO Design System 2.0

Additive design tokens (`--ds-*`) and React primitives under `src/design-system/`.

**Does not migrate** existing product pages — use `/ui-kit` (localhost or super-admin) to preview.

## Tokens

See `tokens.css`: color, typography (Geist), 4px spacing, radius, shadows, motion (+ `prefers-reduced-motion`).

## Primitives

`Button`, `IconButton`, `Card`, form controls, `Badge`, `Tabs`, `Alert`, `Tooltip`, `DropdownMenu`, `Modal`, `Skeleton`, `EmptyState`, `PageHeader`, `SectionHeader`, `StatCard`, `AiInsightCard`.

```ts
import { Button, Card } from "@/design-system";
```
