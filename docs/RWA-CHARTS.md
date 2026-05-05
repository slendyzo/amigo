# Sprint: RWA Value-Over-Time Charts (Real Data, AI-Assisted)

**Status:** Planned
**Started:** 2026-05-05
**Owner:** Kiko
**Goal:** Make the value-over-time chart on every RWA detail page tell a real, honest story from purchase date to today — backed by actual scraped market data where it exists, AI-estimated where it doesn't, and clearly visually distinguished between the two. Eliminate the current "empty chart with two dots and 4 years of whitespace" problem.

---

## Why this sprint

The current charts (vehicle detail, property detail) render a `ValuationHistory` line that only contains rows the daily cron has written since the cron started running. Result: any asset older than the cron has a chart that's mostly empty — the screenshot we're fixing shows a 2021 Miata with the x-axis going back to its purchase date but no real curve, just a single faint line drifting toward today.

Two compounding causes:

1. **No backfill** — purchase date → today is empty by construction.
2. **No real market data** — even forward, the heuristic depreciation curve is a synthetic single line with no validation against actual listings.

This sprint adds a real data pipeline (Web Archive scraping + live cron going forward) and a clear visual grammar that distinguishes truth from estimate. The model `RealAsset` / `Vehicle` / `Property` / `ValuationHistory` schema already exists; the fixes are at the data ingestion and rendering layers.

---

## Constraints (hard)

- **AI is the only paid cost.** Z.AI GLM-4.6 already wired up for vehicle spec lookup. No paid valuation APIs (AutoUncle, Eurotax, etc.).
- **Free scraping only.** Web Archive (archive.org), Standvirtual, OLX, Idealista, Imovirtual.
- **Cron every 5 days** for new price snapshots (separate from the existing daily heuristic cron, which stays for properties via INE index).
- **No new third-party services.** Self-hosted on CT 104, deployed via `bash /root/amigo/deploy.sh`.

---

## Architecture

### Chart visual grammar (canonical, applies to vehicles + properties)

| Visual | Meaning |
|---|---|
| **Solid filled dot** | Real scraped data point (median of N matching listings) |
| **Hollow ring dot** | AI-estimated value (no scrape data for that period) |
| **Diamond dot** | User-entered manual valuation (independent appraisal, insurance, offer) |
| **Solid line segment** | Connects two real dots |
| **Dashed line segment** | Connects involves at least one estimated dot |
| **Faded background line** | Reference series (INE index for property; AI baseline curve for vehicle) |

Hover on any dot shows: date, value, source, sample size (for scraped) or confidence reason (for estimated).

### Vehicle data pipeline

```
User adds vehicle (cascading dropdown: Year → Make → Model → Trim)
  └─ AI builds taxonomy lazily, cached in vehicle_taxonomy table forever
  └─ Asset + Vehicle row written
  └─ Skeleton chart rendered with progress text
  └─ Backfill job queued (async, non-blocking)

Backfill job (per asset, runs once on creation)
  ├─ Hit Web Archive CDX API for archived Standvirtual & OLX search URLs
  │  matching {year, make, model, trim} between purchase date and today
  ├─ For each archived snapshot:
  │  ├─ Fetch HTML from archive.org/web/{timestamp}/{url}
  │  ├─ AI parse: HTML → [{listing_price, mileage, year, trim}]
  │  ├─ Filter by mileage ±15% of inferred-mileage-at-snapshot-date
  │  │  (linear projection from purchase mileage to current mileage)
  │  ├─ Compute median price → write ValuationHistory row
  │  │  source: "web_archive", sampleSize: N, scrapedAt: snapshot date
  ├─ For periods with zero archive coverage:
  │  └─ AI generates fallback estimate → ValuationHistory row
  │     source: "ai_estimate"
  └─ Update progress field on RealAsset for skeleton UI

5-day cron (forward, all active assets)
  ├─ For each unique (year, make, model, trim) across active vehicles:
  │  ├─ Scrape live Standvirtual + OLX (1 request each, low ban risk)
  │  ├─ AI parse HTML → structured listings
  │  └─ Cache spec_market_snapshot keyed by spec hash
  └─ For each active vehicle:
     ├─ Filter cached snapshot by mileage ±15%
     ├─ Compute median price
     └─ Write ValuationHistory row, source: "live_scrape"
```

### Property data pipeline

```
User adds property (existing flow)
  └─ Backfill job: snapshot Idealista + Imovirtual filtered by
     {concelho, propertyType, livableAreaM2 ±20%, bedrooms ±1}
  └─ Note: Web Archive for property is sparser; expect mostly forward-only data

5-day cron (forward, all active properties)
  ├─ Scrape Idealista + Imovirtual for matching comparables per property
  ├─ AI parse HTML → structured listings
  └─ Write ValuationHistory rows tagged source: "live_scrape"

Existing daily cron (kept)
  └─ INE index recompute → updates RealAsset.currentValueEur
     but NO LONGER writes to ValuationHistory (the index drives the
     faded background reference line, not the dot series)
```

### AI's three jobs

1. **Taxonomy build (vehicle creation)**: `(year)` → list of makes; `(year, make)` → list of models; `(year, make, model)` → list of trims. Each result cached in `vehicle_taxonomy` table forever. First user of a (year, make) pair triggers an AI call (~€0.001); everyone after gets cached result for free.
2. **HTML parse (every scrape)**: feed scraped HTML chunks → structured `[{price, year, mileage, trim, ...}]`. More resilient than CSS selectors that break on site redesigns. ~€0.002 per scrape.
3. **Fallback curve generation (when archive coverage is sparse)**: given `{purchase price, purchase date, spec, current value, sparse data points we DO have}` → estimated values for the months with no scrape coverage. ~€0.005 per asset, run once at creation.

### Spec-match identification UX

**Cascading dropdown picker** — Year → Make → Model → Trim, 4 levels. No free text. Eliminates the "MX-5 RF vs soft top" problem at the source. Lazy-built from AI, cached in DB indefinitely.

Trim level is the deepest. Engine variant, generation, transmission are NOT in the dropdown — they're treated as same asset (one MX-5 RF curve covers all RF variants). User-controlled `mileage` field on the asset narrows scrape comparables.

### Edit-spec behavior

When user edits make/model/trim on an existing asset:
- Discard all `ValuationHistory` rows where `source IN ('web_archive', 'live_scrape', 'ai_estimate')`.
- Keep all rows where `source = 'manual'` (those are facts about THIS car regardless of label).
- Re-fire the backfill job for the new spec.
- Show skeleton state during rebuild.

### Initial creation UX

```
[User clicks Save on the wizard]
  ↓
Page loads instantly with two anchor dots:
  • purchase price (real, solid filled, source: "purchase")
  • current AI estimate (hollow ring, source: "ai_estimate")
  ↓
Skeleton state below chart: "Building history… 0/12 snapshots fetched"
  ↓
As backfill job progresses:
  • Progress text updates: "Building history… 4/12 snapshots fetched"
  • New dots fade in on the chart as they become available
  ↓
Done → progress text disappears, chart settles
```

### Empty-data handling

If after backfill the asset has < 3 real scraped points across the entire timeline:

- Chart renders only the two anchor dots (purchase + current estimate).
- Below the chart: "Limited market data for this asset. Add a valuation you know about (independent appraisal, insurance value, offer received)."
- "Add valuation" button → opens modal that writes a `manual` ValuationHistory row.
- Manual entries render as **diamond** dots, distinct from both real and estimated.

This pattern is available on every asset, not just low-data ones. Always-on manual valuation is a useful product feature regardless of scrape coverage.

---

## Data model changes

### New table: `vehicle_taxonomy`

```prisma
model VehicleTaxonomy {
  id          String   @id @default(cuid())
  level       String   // "makes" | "models" | "trims"
  parentKey   String   // "2019" or "2019|Mazda" or "2019|Mazda|MX-5"
  values      Json     // ["Mazda", "Toyota", ...] or ["MX-5", "CX-5", ...]
  source      String   // "ai_glm_4_6"
  createdAt   DateTime @default(now())

  @@unique([level, parentKey])
}
```

### New table: `spec_market_snapshot`

Cached per-spec scrape result, shared across users with the same spec. Refreshed by cron, not per-asset.

```prisma
model SpecMarketSnapshot {
  id          String   @id @default(cuid())
  specHash    String   // sha1(year|make|model|trim) — keyed identifier
  year        Int
  make        String
  model       String
  trim        String?
  scrapedAt   DateTime @default(now())
  source      String   // "standvirtual_live" | "olx_live" | "web_archive" | "idealista_live" | "imovirtual_live"
  archiveDate DateTime? // when it's a Web Archive snapshot, the snapshot's actual date
  listings    Json     // [{price, currency, year, mileage, trim, url}, ...]
  sampleSize  Int

  @@index([specHash, scrapedAt])
  @@index([source, scrapedAt])
}
```

### Extensions to `ValuationHistory`

```prisma
// add fields:
sampleSize  Int?     // number of listings the median was derived from
metadata    Json?    // arbitrary per-source context (mileage band, archive timestamp, AI reasoning)
```

The existing `source` field already supports `"heuristic" | "manual"`. Extends to: `"purchase" | "web_archive" | "live_scrape" | "ai_estimate" | "manual" | "heuristic"`. The legacy `"heuristic"` rows stay valid; new rows use the more specific source labels.

### New: `RealAsset.backfillStatus`

Skeleton chart needs to know how the backfill is progressing.

```prisma
// add to RealAsset:
backfillStatus     String?  // "queued" | "running" | "done" | "no_data"
backfillProgress   Int?     // 0–100 (or N of M for granular display)
backfillStartedAt  DateTime?
backfillFinishedAt DateTime?
```

### Optional: `Property.purchaseQuarterIndex` / `currentIndex` already implicitly tracked

Already wired through `lib/property-valuation-index.ts`. No schema change.

---

## API surface

### New: `POST /api/assets/[id]/backfill`

Triggers backfill job for an asset. Idempotent — if already done or running, no-op. Returns job status.

### New: `POST /api/assets/[id]/valuations` (manual)

User submits manual valuation: `{value, currency, recordedAt, note}`. Writes a `ValuationHistory` row with `source: "manual"`.

### New: `GET /api/taxonomy/vehicle?year=2019&make=Mazda`

Returns the next-level dropdown options. Cache hit → instant. Cache miss → fires AI call, caches result, returns. Stays free for the user past the first hit.

### New: `POST /api/cron/scrape-comparables`

5-day cron endpoint. Auth via `x-cron-secret` (same as existing). For each unique active spec, scrapes once, AI-parses, populates `spec_market_snapshot`. Then for each active asset, computes its mileage-filtered median and writes `ValuationHistory`.

### Changed: `GET /api/assets/[id]` (vehicle/property detail)

Returns `valuationHistory` enriched with `source`, `sampleSize`, `metadata` so the chart can render the dot variants and tooltip detail.

### Removed: nothing. The existing `/api/cron/refresh-valuations` stays for INE index recomputes and liability balance updates.

---

## UI surfaces

### Chart component (shared between vehicle + property)

Build a new `ValueOverTimeChart.tsx` that:
- Receives `points: { date, value, source, sampleSize? }[]` and `referenceLine?: { date, value }[]`.
- Renders dots per `source` style mapping (filled / hollow / diamond).
- Renders connecting line: solid where both endpoints are real, dashed otherwise.
- Renders reference line at lower opacity (INE for property, AI baseline for vehicle).
- Hover tooltip explains what each dot is.
- Recharts (already in stack), custom Dot renderer, custom Line strokeDasharray per segment.

Replace the existing inline LineCharts in:
- `src/app/dashboard/networth/vehicle/[id]/vehicle-detail-client.tsx`
- `src/app/dashboard/networth/property/[id]/property-detail-client.tsx`

### Cascading vehicle wizard

Replace the current free-text or autocomplete brand/model inputs in `add-vehicle-modal.tsx` with cascading dropdowns. Year is always a number input (1990–current+1). Make/Model/Trim each lazy-load from `/api/taxonomy/vehicle`.

Visual treatment: each dropdown disabled until the previous level is selected, smooth fade-in animation as options arrive.

### Skeleton chart state

When `backfillStatus IN ('queued', 'running')`, render the chart card with:
- Two anchor dots visible at chart's edges
- Shimmering placeholder bars between them (Tailwind `animate-pulse`)
- Progress text underneath: "Building history… {progress}/{total} snapshots fetched"
- No tooltip enabled
- Auto-refresh via SWR or polling (every 5s while building)

### Manual valuation entry modal

Triggered from "Add valuation" button below chart. Three fields: value (with currency), date, note. Saves as `ValuationHistory` row source=`manual`. Chart re-renders with new diamond dot.

---

## Phasing (informational only — Plane is the source of truth)

1. **Foundation** — schema migrations (`vehicle_taxonomy`, `spec_market_snapshot`, `RealAsset.backfillStatus*`, `ValuationHistory.sampleSize/metadata`)
2. **Taxonomy builder** — Z.AI helper for `(year)` → makes, `(year, make)` → models, etc. + `/api/taxonomy/vehicle` cached endpoint
3. **Cascading dropdown wizard** — replace add-vehicle-modal text inputs with 4-level cascading dropdowns
4. **HTML parser** — Z.AI helper that takes scraped HTML chunks and returns structured listings. Reusable across Standvirtual, OLX, Idealista, Imovirtual.
5. **Web Archive scraper** — given a search URL + date range, returns archived snapshots from CDX API, fetches HTML, runs through HTML parser, computes median by mileage band
6. **Live scraper** — Standvirtual + OLX scrapers (vehicles), Idealista + Imovirtual scrapers (properties). One request each, low rate, randomized UA
7. **Backfill job + endpoint** — async per-asset job that runs Web Archive scraper, falls back to AI estimate for empty windows, writes ValuationHistory rows, updates `backfillStatus`
8. **5-day cron** — `/api/cron/scrape-comparables` endpoint. Hits live scrapers per unique spec, populates `spec_market_snapshot`, derives per-asset rows. Server-level cron entry on CT 104.
9. **Manual valuation API + modal** — `POST /api/assets/[id]/valuations`, wired to "Add valuation" button
10. **New ValueOverTimeChart component** — Recharts-based, source-aware dots and dashed segments
11. **Vehicle detail page wiring** — replace inline LineChart with new component, render skeleton during backfill
12. **Property detail page wiring** — same as vehicle, INE as reference line
13. **Edit-spec discard logic** — when user edits make/model/trim, discard scraped/estimated rows, keep manual, re-fire backfill
14. **i18n** — en, pt-PT, fr-FR for new strings (backfill states, manual valuation modal, chart tooltip labels)

Stage 1–3 are the foundation. Stages 4–8 are the data pipeline. Stages 9–13 are the UI. Stage 14 is polish.

---

## Acceptance criteria (sprint-level)

- Adding a 2019 Mazda MX-5 RF via the wizard never offers "soft top" or generic MX-5 — only RF variants. Soft-top is a separate Model+Trim path.
- The Miata in the screenshot, after this sprint, shows real scraped dots from Web Archive going back to 2021 (where archives exist) and live-scrape dots forward from cron rollout.
- Where archive data is sparse, hollow estimate dots fill the gaps with visually distinct treatment.
- The Vila Verde property shows scraped Idealista/Imovirtual comparable dots within ~5 days of the first cron run, with INE index as a faded reference line.
- "Add valuation" button on every asset, writes a manual diamond dot, persists.
- Skeleton chart with progress text appears immediately after asset creation; chart densifies as backfill progresses.
- Editing the trim of an existing asset triggers a clean rebuild; manual entries persist.
- `npm run build` passes; deploy via `bash /root/amigo/deploy.sh` succeeds; both light + dark + mobile + desktop verified.

---

## Out of scope

- Vehicle generations as separate dropdown level (collapsed into year for this sprint).
- Engine/transmission variant in spec match (treated as same asset).
- Zillow / non-Portugal property indexes (INE only for now).
- Watches, art, collectibles (different scrape targets, design later).
- Notifications when value moves >5% (engagement feature, separate ticket).
- On-demand "refresh now" button (let cron do its 5-day job first).
- Confidence bands / uncertainty visualization (dots are honest enough for v1).
- Multi-currency assets purchased abroad (workspace currency only).
- Web Archive backfill for properties in concelhos with thin archive coverage — graceful degrade to "Limited market data" empty state.

---

## Plane tracking

All atomic tasks live in Plane under the **Amigo** project, tagged with `rwa-charts` (new label) and parent-linked to the value-over-time epic. This document is the architectural reference; Plane is the execution truth.

### Issue index

| ID | Title | Priority |
|----|-------|----------|
| **AMIGO-190** | [EPIC] RWA Value-Over-Time Charts — Real Data + AI-Assisted Identification | high |
| AMIGO-191 | Schema: vehicle_taxonomy + spec_market_snapshot + RealAsset.backfillStatus + ValuationHistory.sampleSize/metadata | **urgent** |
| AMIGO-192 | Z.AI taxonomy builder + GET /api/taxonomy/vehicle (lazy-cached makes/models/trims) | high |
| AMIGO-193 | Cascading vehicle wizard: replace free-text inputs with Year → Make → Model → Trim dropdowns | high |
| AMIGO-194 | Z.AI HTML parser helper: scraped HTML → structured listings | high |
| AMIGO-195 | Web Archive scraper: CDX API → archived snapshots → historical listings | high |
| AMIGO-196 | Live scrapers: Standvirtual + OLX (vehicles) + Idealista + Imovirtual (properties) | high |
| AMIGO-197 | Backfill job + POST /api/assets/[id]/backfill (Web Archive → ValuationHistory) | high |
| AMIGO-198 | 5-day cron: POST /api/cron/scrape-comparables + server cron entry on CT 104 | medium |
| AMIGO-199 | Manual valuation entry: POST /api/assets/[id]/valuations + "Add valuation" modal | medium |
| AMIGO-200 | ValueOverTimeChart component: source-aware dots + dashed segments + reference line | high |
| AMIGO-201 | Wire ValueOverTimeChart into vehicle detail page + skeleton/poll while backfill runs | high |
| AMIGO-202 | Wire ValueOverTimeChart into property detail page + INE index as faded reference line | high |
| AMIGO-203 | Edit-spec discard logic: rebuild chart when user changes make/model/trim | medium |
| AMIGO-204 | i18n: en + pt-PT + fr-FR strings for cascading wizard, backfill states, manual valuation modal, chart tooltips | low |

**Critical path:** AMIGO-191 → AMIGO-192, AMIGO-194 → AMIGO-195, AMIGO-196 → AMIGO-197 → AMIGO-200 → AMIGO-201, AMIGO-202.
