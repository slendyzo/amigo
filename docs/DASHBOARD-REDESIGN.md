# Dashboard Redesign — 60/40 Portfolio/Expenses Hub

## Problem

The current UI is an expense tracker with portfolio bolted on. The sidebar lists everything flat — portfolio feels secondary. For a user who cares about investments AND daily spending, neither view has the right emphasis.

## Goal

Redesign the dashboard and navigation so the app feels like a **personal finance hub** with a 60/40 focus on portfolio vs expenses. The main page should answer two questions at a glance:

1. **"How are my investments doing?"** (portfolio value, P&L, allocation)
2. **"How am I spending this month?"** (budget, burn rate, recent expenses)

---

## Navigation Restructure

### Current
```
[no label]        Overview, Expenses
sectionMoney      Incomes, Recurring, Portfolio
sectionOrganize   Projects, Categories, Tidy Up, Accounts
sectionData       Import, Import History, Mappings
[divider]         Settings
```

### Proposed
```
[no label]        Dashboard                          ← unified financial hub

PORTFOLIO         Holdings, Exchanges                ← investment domain

FINANCES          Expenses, Incomes, Recurring       ← spending domain

TOOLS             Import, Categories, Tidy Up,       ← config & utilities
                  Accounts, Mappings, Projects

[divider]         Settings
```

### Key changes
- **Dashboard** is the only top-level entry — the hero landing page
- **Portfolio** becomes a first-class section (peer to Finances, not buried inside "Money")
- **Finances** groups all spending/income items
- **Tools** absorbs config-like pages (categories, mappings, accounts, import, tidy-up, projects)
- Import History merges into Import (tab or section within)
- Total nav items stays the same, but grouped by intent not by function

### Mobile bottom bar
```
Dashboard | Portfolio | Expenses | More
```
- Dashboard: hub page (same as desktop)
- Portfolio: holdings list
- Expenses: expense list with quick-add
- More: drawer with full nav (Incomes, Recurring, Tools, Settings)

Floating `+` button remains for quick-add expense.

---

## Dashboard Hub Page (`/dashboard`)

### Layout — Desktop

```
┌──────────────────────────────────────────────────────────────┐
│  NET WORTH                                                    │
│  €X,XXX.XX                    ▲ €XXX.XX (X.X%) this month    │
│  Portfolio: €X,XXX  ·  Cash: €XXX  ·  Free: €XXX             │
├─────────────────────────────────┬────────────────────────────┤
│                                 │                            │
│  PORTFOLIO SUMMARY              │  MONTHLY SNAPSHOT          │
│                                 │                            │
│  ┌─────────────────────────┐    │  Budget: €XXX / €X,XXX     │
│  │  Allocation donut       │    │  ████████░░░  72%          │
│  │  (by asset, colored)    │    │                            │
│  │                         │    │  Spent: €XXX               │
│  │  Legend below:           │    │  Income: €X,XXX            │
│  │  BTC 45%  SOL 30%  ...  │    │  Savings rate: XX%         │
│  └─────────────────────────┘    │                            │
│                                 │  ─────────────────────     │
│  TOP HOLDINGS (max 5)           │                            │
│  BTC    €X,XXX  ▲ X.X%         │  RECENT EXPENSES (5)       │
│  SOL    €XXX    ▼ X.X%         │  McDonald's    -€12.00     │
│  CSPX   €XXX    ▲ X.X%         │  Spotify       -€10.99     │
│                                 │  Uber          -€8.50      │
│  [View all →]                   │  ...                       │
│                                 │  [View all →]              │
│         ~60%                    │        ~40%                │
├─────────────────────────────────┴────────────────────────────┤
│  PERFORMANCE (full width)                                     │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Portfolio value over time  ·  1W  1M  3M  6M  1Y  All  │ │
│  │  [area chart — value line + cost basis line]             │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  MONTHLY COMPARISON (full width)                              │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  [existing burn chart — current vs previous month]       │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### Layout — Mobile

Single column, stacked. Order optimized for scrolling:

1. **Net Worth hero** — compact card, portfolio value + monthly change
2. **Portfolio mini** — allocation donut (small) + top 3 holdings
3. **Monthly budget gauge** — circular gauge (existing LivingGauge)
4. **Recent expenses** — last 5, swipeable
5. **Performance chart** — full width, default 1M
6. **Burn chart** — full width

### Sections in detail

#### Net Worth Hero
- Single large number: total portfolio value + free cash across all exchanges
- Subtitle: breakdown (Portfolio: €X | Cash: €X | Free: €X)
- Monthly change badge: absolute + percentage, color-coded
- This replaces the current overview "hero card"

#### Portfolio Summary (left 60%)
- Allocation donut (reuse existing `AllocationChart`, default "by asset" view)
- Top holdings list (max 5 assets, sorted by value desc)
  - Each row: symbol, name badge (CRYPTO/ETF), value, P&L %
  - Click → asset detail page
- "View all" link → `/dashboard/portfolio`
- If no connections: empty state with "Connect Exchange" CTA

#### Monthly Snapshot (right 40%)
- Budget progress bar (reuse gauge logic, linear not circular for space)
- Spent / Income / Savings rate stats
- Recent expenses list (5 most recent, compact rows)
  - Name, amount, time ago
  - Click → expense detail modal
- "View all" link → `/dashboard/expenses`
- Quick-add button at bottom of section

#### Performance Chart (full width)
- Reuse existing `PerformanceChart` component
- Time range selector: 1W, 1M, 3M, 6M, 1Y, All
- Shows portfolio value over time vs cost basis

#### Burn Chart (full width)
- Reuse existing `BurnChart` component
- Current month vs previous month comparison

---

## Data Requirements

### New server-side fetches for hub page
The current `dashboard/page.tsx` already fetches expense/income data. We need to ADD:
- `ExchangeConnection` (for free cash, sync status)
- `PortfolioAsset` (top 5 by value for holdings preview)
- `PortfolioSnapshot` (for net worth calculation)

This means merging data from both `dashboard/page.tsx` and `portfolio/page.tsx`.

### Net Worth calculation
```
netWorth = sum(asset.currentValueEur) + sum(connection.freeCash in EUR)
monthlyChange = netWorth - snapshotValueFromMonthStart
```

---

## Component Plan

### New components
| Component | File | Purpose |
|-----------|------|---------|
| `NetWorthHero` | `src/components/dashboard/net-worth-hero.tsx` | Large net worth display with monthly change |
| `PortfolioMini` | `src/components/dashboard/portfolio-mini.tsx` | Allocation donut + top holdings for hub |
| `MonthlySnapshot` | `src/components/dashboard/monthly-snapshot.tsx` | Budget + spending + recent expenses |
| `DashboardHub` | `src/app/dashboard/dashboard-hub.tsx` | Client component orchestrating the hub |

### Reused components
| Component | From | Reused in |
|-----------|------|-----------|
| `AllocationChart` | `portfolio/allocation-chart.tsx` | PortfolioMini (compact mode) |
| `PerformanceChart` | `portfolio/performance-chart.tsx` | Hub (full width) |
| `BurnChart` | `ui/burn-chart.tsx` | Hub (full width) |
| `LivingGauge` | `ui/living-gauge.tsx` | MonthlySnapshot (or linear variant) |

### Modified components
| Component | Change |
|-----------|--------|
| `dashboard-shell.tsx` | New nav groups, new mobile bottom bar tabs |
| `dashboard/page.tsx` | Merge portfolio data fetches, pass to DashboardHub |
| `overview-client.tsx` | Retire or keep as "legacy" — replaced by DashboardHub |

---

## Implementation Phases

### Phase 1: Navigation restructure
- Update `navigationGroups` in `dashboard-shell.tsx`
- Update mobile bottom bar tabs
- Update all translation keys for new section labels
- No page changes — just reorganize the sidebar

### Phase 2: Dashboard hub — data layer
- Merge portfolio data fetches into `dashboard/page.tsx`
- Calculate net worth server-side
- Create `DashboardHub` client component with prop types

### Phase 3: Dashboard hub — portfolio side (60%)
- Build `NetWorthHero` component
- Build `PortfolioMini` (compact allocation + top holdings)
- Wire up `PerformanceChart` in hub context

### Phase 4: Dashboard hub — expense side (40%)
- Build `MonthlySnapshot` (budget + recent expenses)
- Wire up `BurnChart` in hub context
- Preserve quick-add and swipe gestures from current overview

### Phase 5: Polish
- Responsive layout (2-column → single column on mobile)
- Dark mode verification
- Loading skeletons for hub
- Empty states (no portfolio, no expenses, neither)
- Transition from old overview to new hub

---

## Design Notes

- The hub should feel like opening a Bloomberg terminal lite, not a to-do list
- Portfolio section uses the existing blue accent (#0070f3) for positive states
- Green/red for P&L is already established in asset cards
- The net worth number should be the biggest thing on the page — this is the north star metric
- Charts should have generous height (min 200px) — don't cramp the data
- "View all" links should be subtle (text link, not button) — the hub is for glancing, detail pages are for digging
- Mobile: the donut chart can be smaller (200x200) but must remain legible
- Stagger-animate sections on load for rhythm (40-60ms delays between sections)
