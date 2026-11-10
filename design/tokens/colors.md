# Color tokens · Quant Lab

Source: Tailwind CSS v4 **Zinc** neutrals + **Blue-600** accent (ui-design-brain Data Dashboard / Enterprise). No bespoke hex inventing.

| Role | Token | Notes |
| --- | --- | --- |
| Page background | `zinc-50` | Terminal canvas |
| Panel / raised | `white` / `zinc-100` | Header, cards |
| Border / hairline | `zinc-200` | Separators, inputs |
| Muted text | `zinc-500` / `zinc-600` | Labels, meta |
| Body text | `zinc-900` | Primary copy |
| Accent / primary CTA | `blue-600` → hover `blue-700` | Run, links |
| Positive / up | `emerald-600` | KPI up, buy markers |
| Negative / down | `red-600` | Drawdown, sell markers |

Implemented in [`apps/web/src/styles.css`](../../apps/web/src/styles.css) via `@theme` and utility classes.
