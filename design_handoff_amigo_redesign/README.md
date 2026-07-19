# Handoff: Amigo Mobile Redesign ("Calm Violet")

## Overview
Complete UX/UI overhaul of Amigo (github.com/slendyzo/amigo) — a Next.js 15 + Tailwind CSS 4 net-worth and expense tracker. This redesign replaces the current amber/Inter shell with a calm, bank-like violet system, mobile-first. Covered screens: Dashboard (chosen layout "1a"), Expenses list, Quick-add sheet, Net worth, plus a dark-mode variant.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, **not production code to copy directly**. The task is to recreate these designs inside the existing Amigo codebase (Next.js App Router, React 19, Tailwind CSS 4, next-intl, framer-motion, lucide-react), reusing its established patterns:
- Replace the shell tokens in `src/app/globals.css` (`:root` and `.dark` blocks) with the Design Tokens below — the codebase already styles everything via `var(--app-bg)`, `var(--surface)`, `var(--ink)`, `var(--accent)` etc., so most of the restyle propagates automatically.
- Restyle `src/components/dashboard-shell.tsx`, `src/components/mobile-nav.tsx`, `src/app/dashboard/overview-client.tsx`, `src/app/dashboard/expenses/page.tsx`, `src/components/add-expense-modal.tsx`, `src/app/dashboard/networth/networth-client.tsx` to match the layouts here.
- Keep all existing behavior (quick-add parser in `src/lib/parser.ts`, expense types, net-worth math `investments + real assets − liabilities`, i18n, theme toggle). This is a reskin + layout change, not a logic change.

## Fidelity
**High-fidelity.** Colors, type sizes, spacing, radii and copy are final. Recreate pixel-perfectly with Tailwind utilities / CSS variables. Sample data (Continente, Galp, EDP, VW Golf…) is placeholder — bind to real data.

## Design Tokens

### Color — light theme
| Token | Value | Use |
|---|---|---|
| `--app-bg` | `#F4F3F9` | page background (lavender-tinted) |
| `--surface` | `#FFFFFF` | cards, nav bars |
| `--surface-2` | `#EEEBFD` | accent-tinted fills (budget track, chips, avatars) |
| `--ink` | `#17161F` | primary text |
| `--ink-muted` | `#6B6880` | secondary text |
| `--ink-subtle` | `#9B98AC` | tertiary text, inactive tabs |
| `--line` | `rgba(23,22,31,.06)` | hairlines, row dividers |
| `--accent` | `#5F4BE8` | THE violet. Active states, CTAs, links |
| `--accent-strong` | `#4735C4` | pressed / emphasis on tinted bg |
| `--accent-soft` | `#8B7BFF` | gradient partner, secondary data color |
| `--accent-faint` | `#B9AEF3` / `#DCD6F9` | tertiary data colors, disabled CTA |
| `--positive` | `#1B9E63` | income, gains |
| `--negative` | `#D64550` | debt, losses |
| hero gradient | `linear-gradient(135deg,#E9E4FC 0%,#CFC5F8 100%)` | net-worth card |
| bar gradient | `linear-gradient(90deg,#5F4BE8,#8B7BFF)` | budget progress fill |
| card shadow | `0 1px 2px rgba(23,22,31,.05)` | all white cards |
| FAB shadow | `0 8px 20px rgba(95,75,232,.35)` | center + button, primary CTA |

### Color — dark theme (`.dark`)
| Token | Value |
|---|---|
| `--app-bg` | `#131218` |
| `--surface` | `#1C1B24` |
| `--surface-2` | `#2A2836` (tracks) / `#2A2648` (accent avatar) |
| `--ink` | `#F0EFF6` |
| `--ink-muted` | `#A5A2B8` |
| `--ink-subtle` | `#6B6880` |
| `--line` | `rgba(255,255,255,.06)` |
| `--accent` | `#8B7BFF` (accent-fg becomes `#131218`) |
| `--accent-faint` | `#B9AEF3` |
| hero gradient | `linear-gradient(135deg,#3A3168 0%,#241F45 100%)`, label text `#B3ABDE`, value `#fff` |

### Typography
- Font: **Instrument Sans** (Google Fonts), weights 400/500/600/700. Replace Inter in `src/app/layout.tssx` font setup.
- All monetary values: `font-variant-numeric: tabular-nums`.
- Scale: 42px/700 net-worth (number-first screens) · 34px/700 hero value · 24px/700 month total · 20px/700 screen greeting & quick-add input · 17px/700 sheet & upcoming-card values · 16px/600 nav titles · 14px/600 section headings · 13.5px/600 row titles · 13px/12.5px/500 body & chips · 11.5px/400 row subtitles · 11.5px/600 UPPERCASE group labels (`letter-spacing:.06em`) · 11px meta · 10px/600 tab labels. Negative letter-spacing −0.02em to −0.035em on values ≥20px.

### Spacing & shape
- Page padding: 20px horizontal. Section gap: 16–18px. Card internal padding: 16–20px.
- Radii: 24px hero card · 20px content cards · 18px tiles/buttons/inputs · 14px small controls · 12px avatars · 20px (full pill) chips · 28px top corners of bottom sheet.
- Merchant avatars: 38×38, rounded 12px, single initial, tinted bg + colored letter (map by category): Groceries/Utilities/Subscriptions `#EEEBFD`/`#5F4BE8` · Fuel/Transport `#FDEEEA`/`#C75A3A` · Eating out `#F5EEE1`/`#A8823C` · Health `#E9F1FB`/`#3D74B8` · Sports/Income `#E7F5EE`/`#1B9E63` · fallback `#F0EFF6`/`#6B6880`.
- Icons: 22px stroke icons (lucide-react at `stroke-width 1.8` matches), 18px in circular buttons.
- Circular icon buttons: 40×40, white surface, card shadow.

## Screens / Views

### 1. Dashboard (Home)
Vertical stack, 18px gaps:
1. **Header row**: greeting block (13px muted "Good morning" over 20px/700 name) left; two 40px circle buttons right (search, bell with 7px accent dot, 1.5px surface ring).
2. **Net-worth hero card** — lavender gradient, radius 24, padding 20/22. Top row: "Net worth" label (13px, `#544D7A`) + delta pill right (12px/600 `#4735C4` on `rgba(255,255,255,.55)`, radius 20, padding 4/10: "▲ €2,140 this month"). Value 34px/700. Legend row (14px top margin): three items, 8px square swatch (radius 2) + 12px text — Invested `#5F4BE8`, Assets `#8B7BFF`, Debt `#B9AEF3`. Tapping card → Net worth screen.
3. **Budget card** — white, radius 20. Title "July budget" (13px/600) + right "**€1,384** of €2,200" (12px). 8px progress track `#EEEBFD`, radius 4, fill = spent/budget with bar gradient; animate width 0.5s `cubic-bezier(.16,1,.3,1)`. Meta line "€816 left · 13 days to go" (11px subtle).
4. **Upcoming** — section header ("Upcoming" 14px/600, "See all" 12px accent) + horizontal scroll of 128px cards (radius 18, padding 14): first card solid accent with white text (next payment due), rest white. Content: name 12px, value 17px/700, "in N days" 11px. Data source: recurring templates.
5. **Recent** — section header ("See all" → Expenses) + white card (radius 20, padding 6/16) of transaction rows (see row spec). Show 3.

**Transaction row**: 38px avatar · flex-1 title (13.5px/600) + subtitle "Category · When" (11.5px subtle) · amount right (13.5px/600 tabular; income `#1B9E63` with "+", expense ink with "−"). Rows padded 11px vertical, divided by `--line` hairlines.

### 2. Bottom tab bar (all screens)
White surface, top hairline, ~10px padding, safe-area bottom. Five slots: Home (house), Money (list), **center FAB**, Wealth (trend line), More (3 dots). Active: accent color + 600 weight label; inactive: `--ink-subtle`. FAB: 52px accent circle, white 24px plus, raised `margin-top:-24px`, FAB shadow, `active:scale(.94)`. FAB opens Quick-add. Maps to existing `mobile-nav.tsx` (Home/Money/+/Wealth[portfolio+networth]/More drawer).

### 3. Expenses list (Money)
1. Nav row: back circle btn · "Expenses" 16px/600 centered · search circle btn.
2. **Month switcher card**: white radius 20; chevrons left/right (subtle); "July 2026" 12px muted over month total 24px/700 tabular.
3. **Type filter chips**, horizontal: All / Fixed / Variable / Lifestyle / Project. Active: `#17161F` bg, white text, 600. Inactive: white bg, muted text, 500, card shadow. Filters the list by expense type.
4. **Day groups** (14px gaps): group label row — "TODAY · JUL 18" left, day total right (both 11.5px/600 uppercase subtle, tabular) — above a white card of rows. Recurring expenses get an inline badge after the subtitle: "recurring" 10px/600 accent on `#EEEBFD`, radius 6, padding 1/6.

### 4. Quick-add sheet
Bottom sheet over dimmed screen (`rgba(23,22,31,.45)`); sheet bg `--app-bg`, top radius 28, padding 14/20/24, 16px gaps. Tap scrim or ✕ to dismiss.
1. Grab handle 40×4 radius 2 `rgba(23,22,31,.15)`.
2. Title row: "Add expense" 17px/700 + 32px ✕ circle.
3. **Input card**: white, radius 18, **1.5px accent border** (focus state). Overline "TYPE ANYTHING — E.G. \"25 MCD\"" 11px/600 uppercase subtle; input 20px/600 borderless, autofocus.
4. **Parse preview** (only when input parses): `#EEEBFD` card radius 18 — white 38px avatar with accent initial · "McDonalds — €25.00" 13.5px/600 over "Eating out · Lifestyle · today" 11.5px `#544D7A` · "auto" chip (11px/600 accent on white, radius 14). Reuse `src/lib/parser.ts` / `quick-add.ts`; parser's type suggestion pre-selects the chip until the user overrides.
5. **Type selector**: 4 equal chips (Fixed/Variable/Lifestyle/Project), radius 14, 9px vertical padding; active = `#17161F`/white/600.
6. Two half-width dropdowns (category, date): white radius 14, 12.5px/500 label + chevron.
7. **Save button**: full-width accent, radius 18, 15px/600 white, 15px vertical padding, FAB shadow; disabled (unparsed) = `#B9AEF3`. On save: append transaction, update budget, close sheet.

### 5. Net worth (Wealth)
1. Nav row: back · "Net worth" · + (add asset).
2. Centered total 38px/700 + delta line 13px/600 positive.
3. **Composition bar**: 10px tall, radius 5, 2px gaps; segments Invested `#5F4BE8` / Assets `#8B7BFF` / Debt `#DCD6F9`, widths proportional.
4. **Three tiles** (equal flex, white radius 18): swatch+label 11.5px muted, value 16px/700 (Debt value in `--negative`, "−" prefix).
5. **Real assets** section (uppercase group label): asset cards — 52px thumbnail (real photo when available; placeholder = 45° repeating stripes `#EEEBFD`/`#E3DEFA` 6px with accent icon), radius 14 · title 13.5px/600 + "Property · index valuation" subtitle · right-aligned value 14px/700 + delta 11px/600 (green ▲ / red ▼).
6. **Liabilities** section: rows in one white card — 38px `#F4F3F9` icon square · name + "linked to {asset} · €520/mo" subtitle · balance right in `--negative`.

### 6. Insights (`/dashboard/insights`) — ref 2a
Pushed page (back nav) + month pill (accent text on `#EEEBFD`, radius 20). Three white cards: **Trend** — month total 26px/700 + "▼ 8% vs June" (positive green), 6-month bar chart (bars `#E3DEFA` radius 6, current month = vertical accent gradient, 10px labels, active label accent/600). **By category** — rows: name/amount 12.5px + 6px progress bar on `#F4F3F9` track, fills in the accent ramp (`#5F4BE8`→`#8B7BFF`→`#B9AEF3`→`#DCD6F9`), widths relative to top category. **Burn rate** — two horizontal bars (this month gradient, last month `#DCD6F9`) + one-line takeaway in `--positive` 11px/600. Data: `insight-aggregator.ts`, burn-chart logic.

### 7. Money hub — segmented control (refs 2b, 2c)
Expenses / Income / Recurring become ONE hub: title "Money" 20px/700 + segmented control (white card radius 16, 4px padding; active segment `#17161F` bg/white/600, radius 12). Replaces separate nav entries.
- **Income (2b)**: green hero card (`linear-gradient(135deg,#E7F5EE,#CBEBDA)`, text `#2A6A4C`, value 28px/700), "Expected monthly" meta line; income rows (green avatars, `+` amounts, "monthly" badge on recurring); "Add income" affordance row.
- **Recurring (2c)**: summary card "Monthly commitments" 24px/700 + "7 active templates"; groups **Bills & loans** and **Subscriptions**. Installment rows get a 5px progress bar (accent-soft fill) indented 50px under the row, label "installment 14 of 48". Subscription rows get iOS-style toggles: 36×21 pill, accent when on, `#E3E1EC` when off (paused rows dim to `--ink-subtle`). Variable bills show "~" prefix.

### 8. Portfolio (`/dashboard/portfolio`) — ref 2d
Tab-bar page (Wealth). Currency pill top-right. Lavender gradient hero (same as dashboard): "Total value" + P/L pill (green text `#1B7A4E`), value 34px/700, meta "Unrealized P/L +€6,840 · cost basis €41,480" 12px. **Allocation bar**: 10px segments (2px gaps) Crypto `#5F4BE8` / ETFs `#8B7BFF` / Cash `#DCD6F9` + legend. **Holdings** card: rows with 38px symbol tiles (BTC amber tint, ETH blue, VWCE violet, cash green; 11–12px/700 symbol text), name + "qty · exchange" subtitle, right column value 13.5px/600 over P/L% 11px/600 (green/red). **Sync row**: white radius 16 — 8px green status dot, "Kraken & Trading 212 synced · 2h ago" muted 12px, "Sync now" accent 12px/600.

### 9. Asset detail (`/dashboard/networth/vehicle|property/[id]`) — ref 2e
Back nav, title = asset name, ⋯ menu. Hero card: 64px thumbnail (radius 16, striped placeholder) + "Current value" 28px/700 + monthly delta; valuation-history bar chart (8 bars, past = `#F0EDFB`→`#D5CDF8` ramp, current = accent gradient). Key-value card: Purchased / Depreciation (negative red) / Valuation source ("Market comparables · 14 listings") / Last updated — 12.5px rows, muted label left, 600 value right. **Linked loan** card on `#EEEBFD`: "−€4,100 remaining · equity €10,400". Footer: two half buttons — "Update valuation" (accent, FAB shadow) + "Mark as sold" (white).

### 10. Projects (`/dashboard/projects`) — ref 2f
Back nav + add. Explainer line 12px muted ("Project spend lives in its own ledger…"). Project cards (white radius 20, padding 18): name 15px/700 + status chip (active = accent on `#EEEBFD`; closed = muted on `#F4F3F9`, card at 65% opacity); meta "Started Mar 2026 · 34 expenses"; spent 20px/700 vs "of €10,000 budget" 12px; 8px gradient progress bar on `#EEEBFD`; breakdown line of top tags 11.5px muted.

### 11. Categories & keyword rules (`/dashboard/categories`, `/mappings`) — ref 2g
Merged page with 2-segment control (Categories | Keyword rules). Category rows grouped under type headers (LIVING / LIFESTYLE): 38px tinted icon square, name, "3 subcategories · 5 rules" subtitle, chevron. Keyword-rules preview card on `#EEEBFD`: white pill chips `"gas" → Utilities` 11px/600, overflow chip "+ 31 more" in accent.

### 12. Import wizard (`/dashboard/import`) — ref 2h
Stepper: 3 equal 4px bars (done/current = accent, todo = `#E3E1EC`), caption "Step 2 of 3 — review what we found". File card: doc icon tile + filename 13.5px/600 + "14 rows · Millennium BCP" + "12 matched" chip (green on `#E7F5EE`). Preview card: raw bank descriptors UPPERCASE 13px/600, subtitle = date + matched "Category · Type" in accent/600 + "auto" badge; unmatched rows show "needs category" in `#C75A3A`. Footer note "2 duplicates were skipped automatically" centered 11px subtle. CTA "Import 12 expenses".

### 13. Bank accounts (`/dashboard/accounts`) — ref 2i
Default account as a full accent-gradient card (`135deg #5F4BE8→#8B7BFF`, white text): bank name + "default" chip (`rgba(255,255,255,.2)`), masked number 16px/600 `letter-spacing:.12em`, footer row "Checking · EUR" / "212 expenses linked". Other accounts as list rows (initial tiles). "+ Add account": 1.5px dashed `#C9C5DE` border, radius 20, accent 13px/600 centered.

### 14. Settings (`/dashboard/settings`) — ref 2j
Profile card: 52px accent circle initial, name 15px/700, email + workspace subtitle. Grouped list cards (MONEY / APP): 13px/500 label left; right = muted 600 value + "›" (drill-in), inline 3-way theme segment (Light/Dark/Auto — active on white with shadow), or toggle. "Sign out" full-width on `#FDEEEE`, text `--negative` 13.5px/600.

### 15. More sheet — ref 2k
Replaces the drawer: bottom sheet with 2×2 shortcut grid (Projects, Insights, Tidy up, Import) — white radius-18 cards, 38px tinted icon tile, 13px/600 name, 11px status line; badge count (18px accent pill, white 10px/700) for pending items. Below: list card with Settings / Workspace / What's new (accent dot = unread).

### 16. Tidy up (`/dashboard/tidy-up`) — ref 2l
Progress bar + "3 of 8" counter. Focus card (radius 24, elevated shadow `0 12px 32px rgba(23,22,31,.1)`): raw descriptor 15px/700, 44px neutral avatar, amount 16px/700; **suggestion strip** on `#EEEBFD` with star icon + reasoning copy 12.5px `#4735C4`; actions: Accept (accent) / Pick other (neutral) / skip chevron (46px square). Next item peeks below at 50% opacity. Footer microcopy: "Creating a keyword rule from your choice ✓".

### 17. Onboarding (ref 2m) & Sign in (ref 2n)
**Onboarding**: 3-bar stepper; question 24px/700 two-line; helper 13px muted; giant centered input card (accent border, 36px/700 value); preset chips (selected = `#EEEBFD`/accent); CTA + "Skip for now". **Sign in**: page gradient `180deg #E9E4FC → #F4F3F9 42%`; 64px radius-20 logo tile (gradient `#4735C4→#5F4BE8`, lowercase "a" 30px/700); "Welcome back" 26px/700 + tagline; floating-label inputs (white cards, 10.5px uppercase label, 14px value); accent CTA; "or" divider; white Google button; footer link line.

### 18. Dark mode
Same layouts; swap tokens per dark table. Notes: FAB/accent chips use `#8B7BFF` with **dark** foreground `#131218`; upcoming "due" card = `#8B7BFF` bg with dark text; hero uses dark gradient. Keep the existing `.dark` class mechanism and theme toggle.

## Interactions & Behavior
- Tab taps switch screens; hero card → Wealth; "See all" (Recent) → Money.
- FAB opens quick-add (existing `openQuickAdd` event); scrim/✕ close; Save disabled until input parses `^amount name$`.
- Type chips: parser suggestion wins until user taps one (then user choice sticks).
- Budget bar animates on change (0.5s, ease `cubic-bezier(.16,1,.3,1)` — the codebase's `--ease`).
- Press feedback: `active:scale(.94)` FAB, `.98` on large buttons. Keep existing framer-motion entrance patterns (opacity 0, y 8 → visible, 0.35s, same ease, 0.05s stagger).
- Filter chips filter instantly, no page reload.
- Safe areas: keep existing `pb-safe-bottom` / `pt-safe` utilities; screens pad top ~56–64px under the status bar.

## State Management
No new state architecture. Existing server components fetch; client state: active filter (Money), sheet open, quick-add text + parsed result + type override, month cursor. New expense POSTs to `/api/expenses` as today.

## Assets
- No image assets. All icons are simple 24-viewBox stroke icons — use **lucide-react** (already a dependency): home, list, trending-up, more-horizontal, plus, search, bell, chevron-left/right/down, x, car, building/home.
- Merchant avatars are generated (initial + category tint) — no logo files.
- Asset thumbnails: real `imageUrl` when present, striped placeholder otherwise.

## Files
- `Amigo Prototype.dc.html` — **the chosen design (1a)** as an interactive prototype: tab nav, working quick-add parse + save, live budget bar, expense filters. Open in a browser; the phone frame (`ios-frame.jsx`, `support.js`) is scaffolding — only the screen inside matters.
- `Amigo Redesign.dc.html` — the option board. Turn 1: 1a (chosen dashboard), 1b (alt, not chosen), 1c (dark mode), 1d (expenses), 1e (quick-add), 1f (net worth). Turn 2 (full app): 2a insights, 2b income, 2c recurring, 2d portfolio, 2e asset detail, 2f projects, 2g categories/rules, 2h import, 2i accounts, 2j settings, 2k more sheet, 2l tidy-up, 2m onboarding, 2n sign in.

## Suggested implementation order (Claude Code)
1. Tokens + fonts: rewrite `globals.css` `:root`/`.dark` shell tokens, swap Inter → Instrument Sans in `layout.tsx`.
2. Shell: `mobile-nav.tsx` (5-slot bar + FAB), More sheet replacing the drawer, `dashboard-shell.tsx`.
3. Dashboard (`overview-client.tsx`) per screen 1.
4. Money hub: merge Expenses/Incomes/Recurring under the segmented control; restyle lists + quick-add modal.
5. Wealth: portfolio, net worth, asset detail.
6. Secondary: insights, projects, categories+mappings, import, accounts, settings, tidy-up.
7. Auth + onboarding.
Each step is independently shippable; verify against the reference HTML at every step.
- All styles are inline in these files; every hex/size in this README appears verbatim there.
