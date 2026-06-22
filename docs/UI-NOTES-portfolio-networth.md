# UI Notes — Portfolio & Net Worth redesign

Context for the upcoming UI redesign. These are the portfolio/net-worth UI changes that came out of the 2026-06-22 audit but were **deliberately left for the redesign** rather than patched in-place (patching now would just collide with the redesign). The backend/logic for all of these is already done and deployed-pending; this doc is the front-end checklist.

Related Plane issues: **AMIGO-260, 261, 262, 269, 270**. Logic already shipped: AMIGO-263, 264, 265, 266, 267.

---

## 1. AI is gone — remove the dead surfaces (AMIGO-260, 262)

The GLM (Z.ai) API key was pulled, so every AI-backed feature now returns null/empty. The code degrades gracefully (no crashes) but leaves **dead UI** that looks broken. During the redesign, remove or hide:

- **AI Advisor / Insights** — `/dashboard/insights`, the sidebar nav entry, any dashboard advisor cards, `ai-consent-modal.tsx`, and the AI-consent toggle in Settings. Backed by `/api/insights/*` (retrospective, nudges/*) which now return nothing.
- **Add-vehicle "Auto-fill specs" button + cascading picker** — `add-vehicle-modal.tsx` calls `/api/vehicle/lookup` (spec lookup) and `/api/taxonomy/vehicle` (`cascading-vehicle-picker.tsx`); both return null without the key. See §2.
- **"Refresh from market" on asset detail** — the comparables button (`comparables-modal.tsx`, `/api/assets/[id]/comparables`) parsed listings via AI; it now returns empty. Remove the affordance.
- **Value labeling** — since valuation is now heuristic-only, label asset values as **"Estimated"** everywhere (the `estimatedValue` i18n key + `ValueSourceHint` methodology copy already exist). Make sure no UI implies a value is market-derived.

Backend already done: `scrape-comparables` cron route is an inert sunset stub and its CT 104 crontab entry is removed. `listing-html-parser.ts`, `vehicle-spec-lookup.ts`, `vehicle-taxonomy.ts`, `bike-valuation.ts` AI calls, `asset-backfill.ts` AI gap-fill, `glm.ts`, and `src/lib/prompts/*` are now orphaned and can be deleted once the UI no longer references them.

---

## 2. Add-Vehicle → pure manual entry (AMIGO-261)

The flow currently leans on AI auto-fill (brand/model/year → MSRP, fuel, body, generation, image hint). That path is dead. Redesign it as **manual entry** that still feels fast:

- Manual fields: brand, model, year, trim, fuel type, body type, mileage, purchase date, purchase price, currency. Enum options already exist as constants in `vehicle-spec-lookup.ts` (FUEL_TYPES, CAR/MOTO/BIKE body types) — reuse them.
- Keep the vehicle-class chooser (Car / Motorcycle / Bicycle) — that's not AI.
- Image: `vehicle-image.ts` keyless image fetch (Bing/DDG/Wikipedia) is **not AI** and can stay as best-effort, but it's brittle — make manual image upload a first-class fallback, not a hidden one.
- Financing step (loan + recurring template) is unaffected — keep it.
- Target: still addable in <90s by hand. The "just enter what you remember, we fill the rest" promise no longer holds — adjust the micro-copy.

---

## 3. Add-Property flow — doesn't exist yet (AMIGO-269)

There is **no way to add a property from the UI**. `dashboard-rwa-section.tsx` only lazy-loads `AddVehicleModal`; the AddCard and EmptyState both open it. Net-worth/property is half-built — `PropertyCard` and the property detail page exist, but nothing creates a property.

- Add an **Add-Property modal**: property type, concelho (drives INE valuation), address, livable area m², bedrooms, purchase price, purchase date, currency.
- Add a **type chooser** (Vehicle vs Property) on the dashboard AddCard / EmptyState, so the "+" isn't vehicle-only.
- Valuation is the INE-index heuristic via the existing `refresh-valuations` cron (no AI). Note: a freshly added property currently sits flat at purchase price until the cron runs and only if its concelho has an INE row — set a sensible initial value and surface "estimate pending" honestly.

---

## 4. Polish (AMIGO-270)

- **Replace native `confirm()`** for delete/sell with the app's styled dialog — `vehicle-detail-client.tsx:203`, `property-detail-client.tsx:249`. Native dialogs break the design language.
- **`ValueSourceHint` gets `null`** for `currentValueUpdatedAt` on detail pages (vehicle ~:330, property ~:450) even though the value is available — so the "updated X ago" hint is dead. Pass the real timestamp.
- **Dead code**: `ChartEmptyState` in `property-detail-client.tsx:618` is defined but never rendered. Remove.
- **Sold vehicles still show a live value-over-time chart** (`vehicle-detail-client.tsx:360`) while sold properties correctly hide it (`property-detail-client.tsx:479`). Gate the vehicle chart on `!sold` for consistency.

---

## 5. Smaller portfolio polish (not yet ticketed)

- **Hardcoded English** leaks through the otherwise-i18n'd portfolio feature: "Holdings without price data", "Price unavailable", "Across N exchanges", "staked", "Not enough data yet", "just now / Xm ago". Wire these to i18n during the redesign.
- **Duplicated helpers** — `formatRelativeTime` / `formatQuantity` are copy-pasted across `asset-detail-client`, `symbol-detail-client`, `exchanges-client`, `asset-card`. Extract to a shared util.
- **Single-asset detail P&L** (`asset-detail-client.tsx`) reads raw per-position DB P&L, so drilling into a cost-basis-pending Bybit position can still show a raw +100% (the list/summary already handle this via the `costBasisPending` flag from AMIGO-265). Apply the same "—  cost basis pending" treatment here.
- **Display currency toggle** is EUR/USD only and re-expresses history at today's FX. Fine for a toggle, but worth noting if you expand currency support.
