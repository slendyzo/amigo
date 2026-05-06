# Amigo Web — UI Kit

High-fidelity, click-through recreation of the Amigo web app, structured as React components rendered in a single `index.html`. Models the canonical shell + three core surfaces:

- **Dashboard / Overview** — Living Gauge, Burn Chart, recent activity, stat cards.
- **Expenses** — sortable list, monthly grouping, refunds, filter chips.
- **Portfolio** — summary card, asset list with P&L, allocation, exchange chips.

The sidebar in `index.html` switches between surfaces. All components are styled with the project's `colors_and_type.css` tokens — no Tailwind, no build step.

## Files

| File | Role |
|---|---|
| `index.html` | The shell. Loads React, the design tokens, and all components. |
| `Shell.jsx` | Sidebar + top bar + content frame + active-screen state. |
| `Overview.jsx` | Stat cards, Living Gauge, Burn Chart, recent activity. |
| `Expenses.jsx` | Filter bar, monthly groups, transaction rows, modal demo. |
| `Portfolio.jsx` | Summary card, allocation chart, asset cards. |
| `Primitives.jsx` | Button, Card, Chip, EyebrowLabel, Icon (lucide inline). |

## What's faithful, what's stubbed

- Real values are placeholder, but layouts, type, color, radii, and shadows match the production app. The Living Gauge SVG ring math and Burn Chart cumulative-line shape mirror the Recharts implementation.
- Modal opens are wired up; CRUD does nothing.
- Portfolio P&L colors and tooltip patterns mirror `portfolio-summary-card.tsx` and `asset-card.tsx`.
- Icons are inline lucide SVGs (1.6 stroke).
