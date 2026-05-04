# Sprint: Real-World Asset Tracking (Vehicles → Net Worth Foundation)

**Status:** Planned
**Started:** 2026-05-04
**Owner:** Kiko
**Goal:** Lay the architectural foundation for net worth tracking, ship vehicle tracking end-to-end, and surface the new "RWA" pillar on the dashboard alongside the existing investments infrastructure.

---

## Why this sprint

Amigo already tracks expenses and investment portfolios (`PortfolioAsset` via `ExchangeConnection`). To complete the net worth picture, two things are missing:

1. **Real-world assets (RWA)** — vehicles, real estate, etc. — appreciable/depreciable physical things you own.
2. **Liabilities** — loans (asset-attached or standalone), credit cards, mortgages — what you owe.

This sprint delivers vehicles end-to-end and the generic liability layer. Real estate (`Property` child of `RealAsset`) lands in a follow-up sprint, reusing everything built here.

## Naming

The model `PortfolioAsset` already exists for crypto/stocks/ETFs. To avoid collision, the new parent is **`RealAsset`** with **`Vehicle`** / `Property` children. UI label is "RWA" (matches user mental model).

---

## Architecture

### Data model

```
RealAsset (parent)
├── id, workspaceId
├── type: VEHICLE | PROPERTY (enum)
├── name (e.g., "BMW M340i", "Apartment Lisbon")
├── purchasePrice, purchaseCurrency, purchasePriceEur, purchaseDate
├── currentValue, currentValueEur, currentValueUpdatedAt, currentValueSource
├── status: ACTIVE | SOLD
├── soldAt, salePrice, salePriceEur
├── imageUrl (R2 cache URL)
├── notes
└── createdAt, updatedAt

Vehicle (child, 1:1 with RealAsset)
├── realAssetId (PK + FK)
├── brand, model, generation, year, trim
├── mileage, mileageUpdatedAt
├── vin, plate, color
├── fuelType (PETROL | DIESEL | HYBRID | EV | OTHER)
└── bodyType (SEDAN | HATCHBACK | SUV | WAGON | COUPE | CONVERTIBLE | TRUCK | OTHER)

ValuationHistory
├── id, realAssetId
├── value, valueEur, currency
├── source (e.g., "heuristic", "stand_virtual", "manual")
├── recordedAt
└── @@index([realAssetId, recordedAt])

Liability (generic)
├── id, workspaceId
├── type: VEHICLE_LOAN | MORTGAGE | CREDIT_CARD | PERSONAL_LOAN | STUDENT_LOAN | OTHER
├── realAssetId (nullable — linked loans)
├── name, currency
├── principal, interestRate, termMonths, monthlyPayment, startDate
├── currentBalance (recomputed nightly from amortization)
├── status: ACTIVE | PAID_OFF | DEFAULTED
├── recurringTemplateId (nullable — link to auto-generated expense template)
└── createdAt, updatedAt

Expense
└── + realAssetId (nullable, new field) — TCO linkage
```

### Valuation engine

- **Heuristic depreciation** runs daily via cron, writes one `ValuationHistory` row per active vehicle.
  - Curve: 15% year 1, then 12% year 2, 10% years 3–5, 7% year 6+.
  - Mileage adjustment: ±0.5% per 5000km vs. baseline (15k km/year).
  - Inputs: purchase price (or MSRP if known), year, current mileage.
- **Manual scrape button** — Puppeteer fetches Stand Virtual search by `brand + model + year ± 1 + mileage band`, computes median price, writes `ValuationHistory` row with `source: "stand_virtual"`. Single request per click (low ban risk).
- **On-demand recompute** when user edits mileage or vehicle fields.

### Vehicle data lookup

- Claude API (Haiku 4.5) called on add: `{ brand, model, year, trim }` → `{ originalMsrp, fuelType, bodyType, generation, imageHint }`.
- Costs ~€0.001 per lookup. User can override every field.

### Image strategy

- Cache key: `make_model_generation` (drops year, color, trim — model-level granularity).
- Fallback chain: R2 cache → NetCarShow scrape on miss → Wikimedia API → user upload.
- First user to add a model triggers backend scrape, dumps image into R2 bucket. Subsequent users hit cache.

### Loan ↔ recurring template

- On financed asset add: auto-create `RecurringTemplate` with monthly payment + category "Auto Loan".
- **Smart duplicate detection**: scan existing templates within ±€5 amount + name keyword match (`car`, `loan`, `auto`, brand name) + no existing loan link → prompt **"Link to existing template?"** instead of creating new.
- **Bidirectional sync**: editing loan updates template (amount, name); editing template updates loan.
- **Retroactive expense linking**: when financed vehicle is added, scan past expenses matching loan signature → bulk-link prompt.

### Workspace + permissions

- `RealAsset.workspaceId` — same pattern as expenses.
- OWNER/ADMIN can edit, MEMBER can view (mirrors existing `Expense` pattern).

### Sale lifecycle

- `status: ACTIVE → SOLD` transition.
- Soft-archive: vanishes from active net worth, surfaces under "Sold" tab.
- Realized P&L = `salePriceEur - purchasePriceEur`.
- Linked loan auto-transitions to `PAID_OFF` if outstanding balance was settled in the sale.

### Auto-refresh cadence

- Daily cron at 03:00 Europe/Lisbon (after market close, before users wake).
- Recomputes heuristic per active vehicle, appends to `ValuationHistory`.
- Updates `RealAsset.currentValueEur` + `currentValueUpdatedAt`.

---

## UI surfaces

### Front page (existing dashboard, restructured)

Three sections, top-to-bottom:

1. **Expenses** (existing — survival gauge, burn chart, recent expenses) — unchanged
2. **Investments** (existing — `PortfolioAsset` summary already wired) — surface as proper section
3. **RWA** (new) — vehicle cards: photo, name, cost basis, current value, delta %, monthly TCO

### `/dashboard/networth` (new — Net Worth page)

- Total net worth headline + delta vs. last month
- Asset breakdown: investments + RWAs
- Liability breakdown: per type
- Value-over-time chart (90 days / 1y / all)
- "Sold" tab — closed positions with realized P&L

### `/dashboard/networth/vehicle/[id]` (vehicle detail)

- Hero: image + brand/model/year
- Cost basis vs. current value chart
- Mileage timeline
- Linked loan card (balance, payments remaining, payoff projection)
- TCO breakdown: depreciation + linked expenses
- Edit / Mark sold buttons

### Add Vehicle flow

- Step 1: brand / model / year / trim (Claude API fills the rest)
- Step 2: mileage + purchase date + purchase price
- Step 3 (optional): financing details (progressive disclosure, smart defaults, conflict prompts)
- Step 4: confirm / override auto-fetched image

---

## Phasing (informational only — Plane is the source of truth)

The work is broken into atomic Plane issues. Suggested execution order:

1. **Foundation** — schema migrations, enum updates
2. **Vehicle CRUD** — API + minimal add flow + manual entry
3. **Heuristic engine + cron** — value computation + history
4. **Loan model + recurring template integration**
5. **Image cache + NetCarShow scraper**
6. **Claude spec lookup**
7. **Dashboard RWA section**
8. **Net Worth page**
9. **Stand Virtual manual scrape button**
10. **Sale lifecycle + sold tab**
11. **Expense → asset linkage + retroactive linking**

Real estate (`Property`) is explicitly **out of scope** for this sprint.

---

## Acceptance criteria (sprint-level)

- User can add a vehicle in <90s via the add flow
- Vehicle appears on front-page RWA section with cost basis + estimated value
- Vehicle estimated value updates daily without user action
- Financed vehicle auto-creates linked recurring template with no duplicates
- User can mark vehicle as sold and see it under "Sold" tab with realized P&L
- Net worth page renders total = sum(investments) + sum(RWAs) − sum(liabilities)
- All changes covered by `npm run build` passing
- Both light and dark modes verified
- Mobile + desktop layouts polished

---

## Out of scope

- Real estate / `Property` child (next sprint)
- Multi-currency vehicles bought abroad (uses workspace currency)
- Insurance tracking
- Maintenance scheduling / reminders
- Plate-lookup APIs / VIN decoders
- Cash / bank-balance tracking (sales don't credit anywhere)

---

## Plane tracking

All atomic tasks live in Plane under the **Amigo** project, tagged with the `rwa-tracking` label. This document is the architectural reference; Plane is the execution truth.

### Issue index

| ID | Title | Priority |
|----|-------|----------|
| **AMIGO-137** | [EPIC] Real-World Asset Tracking — Vehicles + Net Worth Foundation | high |
| AMIGO-138 | Schema: add RealAsset, Vehicle, ValuationHistory, Liability + enums + Expense.realAssetId | **urgent** |
| AMIGO-139 | Heuristic depreciation engine (asset-valuation.ts) | high |
| AMIGO-140 | Daily cron: recompute heuristic + write ValuationHistory | medium |
| AMIGO-141 | Claude API: vehicle spec lookup helper | medium |
| AMIGO-142 | Vehicle image cache: NetCarShow scraper + R2 storage | medium |
| AMIGO-143 | Stand Virtual manual scrape (refresh-from-market button) | low |
| AMIGO-144 | /api/assets CRUD (RealAsset + Vehicle nested) | high |
| AMIGO-145 | /api/assets/[id]/valuations + sell endpoints | medium |
| AMIGO-146 | /api/liabilities CRUD | high |
| AMIGO-147 | Loan integration: auto-create RecurringTemplate + smart duplicate detection | high |
| AMIGO-148 | Loan ↔ RecurringTemplate bidirectional sync | medium |
| AMIGO-149 | Retroactive expense linking on financed asset add | low |
| AMIGO-150 | Add Vehicle wizard (4-step modal) | high |
| AMIGO-151 | Vehicle card component (RWA card) | high |
| AMIGO-152 | Vehicle detail page /dashboard/networth/vehicle/[id] | medium |
| AMIGO-153 | Mark as sold flow + Sold tab on Net Worth page | medium |
| AMIGO-154 | Front-page RWA section integration | high |
| AMIGO-155 | Net Worth page /dashboard/networth | high |
| AMIGO-156 | Expense modal: optional Real Asset link | medium |
| AMIGO-157 | Translations: en, pt-PT, fr-FR for RWA + Net Worth | low |
| AMIGO-158 | Sidebar nav: add Net Worth + AddTypeSelector wiring | low |

**Critical path:** AMIGO-138 → AMIGO-139, AMIGO-144, AMIGO-146 → AMIGO-147, AMIGO-150, AMIGO-151 → AMIGO-154, AMIGO-155.
