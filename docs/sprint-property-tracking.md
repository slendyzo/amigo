# Sprint: Real Estate Tracking (Property as a sibling child of RealAsset)

**Status:** Planned
**Started:** 2026-05-05
**Owner:** Kiko
**Goal:** Add real estate tracking to Amigo by introducing a `Property` child of `RealAsset`. Reuse the entire RWA scaffolding shipped in the vehicles sprint — net worth math, sold lifecycle, generic liability handling, retroactive expense matching, the detail-page chart pattern — and only build what is genuinely property-specific.

---

## Why this sprint

The vehicle sprint (AMIGO-137, closed) deliberately laid generic foundations:

- `RealAsset` is type-agnostic and already has a `PROPERTY` enum value reserved.
- `ValuationHistory` keys on `realAssetId` regardless of child type.
- `Liability` works for any kind of loan (vehicle, mortgage, personal).
- `/dashboard/networth` lists every `RealAsset` already.
- Retroactive expense matching, asset-link picker, bulk asset-link, and the dashboard RWA section all key on `realAssetId`.

Adding properties is therefore mostly a matter of:

1. A `Property` child model with property-specific fields.
2. A property-specific **valuation source** (INE quarterly housing index, by concelho).
3. A property-specific **wizard** and **detail page**.
4. Reusing everything else.

---

## Architecture

### Data model

```
Property (child, 1:1 with RealAsset)
├── realAssetId (PK + FK)
├── propertyType: APARTMENT | HOUSE | LAND | COMMERCIAL | OTHER
├── address (street + number, free-text)
├── postalCode (e.g. "1200-195")
├── distrito (district, free-text)
├── concelho (county — primary INE valuation key, e.g. "Lisboa")
├── freguesia (parish — finer location, e.g. "Misericórdia")
├── country (default "PT")
├── livableAreaM2 (interior area)
├── totalAreaM2 (incl. land for HOUSE)
├── bedrooms
├── bathrooms
├── yearBuilt
├── floor (for apartments — nullable)
├── parkingSpaces
├── energyRating (A+, A, B, B-, C, D, E, F — nullable)
├── condominiumFeeMonthly (decimal, optional)
```

`RealAsset` already carries: name, purchase price, purchase date, current value, status (ACTIVE/SOLD), soldAt, salePrice, imageUrl, notes. **Don't duplicate any of those on Property.**

### Valuation source

**INE quarterly housing price index by concelho** (free CSV from `ine.pt`). The base series ID is "0010254" (or equivalent — confirm during the schema spike).

- Cron downloads the latest CSV quarterly (or weekly with no-op when nothing new).
- Parses into a per-concelho index map keyed by year-quarter.
- Stores in either a new `PropertyValuationIndex` table (concelho + quarter + indexValue) or a JSON blob in R2 — TBD.
- Heuristic: `currentValue = purchasePrice × (currentIndex / purchaseQuarterIndex)` per concelho.
- Fallback: if no data for the concelho, freeze at last known value with `currentValueSource: "stale"`.

### Loan integration

Reuse `Liability` as-is. Only the `type` field gets a new value: `MORTGAGE` (already in the enum). The autoLink template-candidates flow (AMIGO-165) and bidirectional sync (AMIGO-148) work transparently.

### Sale lifecycle

Reuse the generic `RealAsset.status: ACTIVE → SOLD` transition from AMIGO-153. The `/api/assets/[id]/sell` endpoint already handles any child type.

### Auto-refresh cadence

INE publishes quarterly. The existing daily `/api/cron/refresh-valuations` cron extends to also recompute property values when the per-concelho index changes. No new cron needed.

---

## UI surfaces

### Dashboard (existing RWA section, extended)

`dashboard-rwa-section.tsx` already iterates over `assets` from `/api/assets`. Properties rendered as a sibling card (`PropertyCard` component, mirrors `VehicleCard`):
- Image (Wikipedia/Google Street View hint, or user upload)
- Address chip + concelho
- Cost basis vs. current value
- Delta %
- Monthly TCO

### `/dashboard/networth/property/[id]` (new)

- Hero: address + image + property type
- Value-over-time chart (reuse same Recharts setup as vehicle)
- Linked mortgage card (reuse `LoanCard`)
- TCO breakdown: linked expenses (utilities, IUC, condo fees, maintenance)
- Mark sold / delete buttons (reuse generic flows)

### Add Property flow (new)

- Step 1: address + concelho + property type + year built
- Step 2: m² + bedrooms + bathrooms + purchase price + purchase date
- Step 3 (optional): mortgage details (reuses Liability create flow)
- Optional Step 4: image upload (no auto-fetch — Wikipedia doesn't help here)

### AddTypeSelector

Add a 5th option: "Add Property" → opens `AddPropertyModal`.

---

## Phasing (informational; Plane is source of truth)

1. **Foundation** — schema migration (`Property` model + `PropertyType` enum + `RealAsset.type=PROPERTY` already exists)
2. **Valuation source** — INE CSV ingest + concelho index storage + heuristic
3. **API** — extend `/api/assets` to handle PROPERTY type, validate Property fields on POST
4. **Cron** — extend daily refresh-valuations to recompute properties
5. **Wizard** — Add Property modal
6. **Card** — PropertyCard on dashboard RWA section
7. **Detail page** — `/dashboard/networth/property/[id]`
8. **Sold lifecycle** — verify generic flow works for properties
9. **i18n** — en/pt-PT/fr-FR for all new strings
10. **Nav wiring** — AddTypeSelector + mobile nav already cover Net Worth root

---

## Acceptance criteria

- User can add a property in <90s via the wizard
- Property appears on dashboard RWA section alongside vehicles
- Property estimated value updates daily via INE index without user action
- Mortgage auto-creates linked recurring template (no duplicates)
- User can mark property as sold and see realized P&L
- Net worth page total = vehicles + properties + investments − liabilities
- `npm run build` passes; light + dark + mobile + desktop verified
- Both `bash /root/amigo/deploy.sh` and the existing daily prune cron stay green

---

## Out of scope

- Multi-currency properties (use workspace currency)
- Rental income tracking (separate concern; could be a follow-up)
- Tenant management
- Plate-equivalent: VAT/property registration lookups
- Historical INE backfill — only current quarter onwards
- Non-Portugal valuation indexes (US Zillow, UK Land Registry, etc.)

---

## Plane tracking

All atomic tasks live in Plane under the **Amigo** project, tagged with the `rwa-tracking` label and parent-linked to the property epic (created when this doc lands). This document is the architectural reference; Plane is the execution truth.

### Issue index

To be populated as the epic and atomic tickets are filed.
