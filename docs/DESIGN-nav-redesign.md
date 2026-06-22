# Amigo — Navigation & Shell Redesign Blueprint

> Scope: the app shell only — sidebar, profile menu, top-bar removal, active states, color tokens, mobile bottom bar, motion. **Not** in scope yet: redesigning the inner pages (Dashboard cards, hub tab content, tables). Those come after the shell lands.
>
> Status: **Blueprint — awaiting review.** No code, no Plane tasks created yet.
> Date: 2026-06-22

---

## 1. The Problem

The current shell exposes **15 destinations across 4 collapsible groups**, plus admin/insights/what's-new stragglers, a separate top bar, and a mobile bottom-bar + drawer combo. It's not ugly — it's *bloated*. Too much is visible at once, which makes a simple personal-finance app feel like an enterprise admin panel.

**The fix is information architecture, not a reskin.** Cut top-level nav to 5, fold the rest into hubs and Settings, then apply a calmer visual language on the way through.

---

## 2. Decisions Locked (from grilling session)

| Branch | Decision |
|--------|----------|
| Core problem | Too many nav items → consolidate IA |
| Cut depth | Aggressive — ~5 top-level items |
| Grouping | Two tabbed hubs: **Money** + **Portfolio** |
| Orphans | Config → Settings; Import → action in Money; Tidy Up → contextual nudge |
| Chrome | Kill top bar; bottom profile popover in sidebar |
| Active state | Faint tint + colored icon/text + 2px left accent bar |
| Dark mode | Build both, **dark-first**, semantic tokens |
| Accent | Shift off template-blue to a distinctive accent |
| Mobile | 4 tabs + center Add FAB (Dashboard · Money · ⊕ · Portfolio · More) |
| Sidebar | Collapsible to icon rail (remembers preference) |
| Deliverable | This blueprint only |

---

## 3. Information Architecture

### Before → After

```
BEFORE (15+ items)                AFTER (5 items)
─────────────────────            ─────────────────────
Dashboard                         Dashboard
PORTFOLIO                         Money            ← hub
  Holdings                          ├ Expenses     (tab)
  Net Worth                         ├ Incomes      (tab)
  Exchanges                         └ Recurring    (tab)
FINANCES                          Portfolio        ← hub
  Expenses                          ├ Holdings     (tab)
  Incomes                           ├ Net Worth    (tab)
  Recurring                         └ Exchanges    (tab)
TOOLS                             Projects
  Import                          Settings         ← hub
  Categories                        ├ General
  Tidy Up                           ├ Categories
  Accounts                          ├ Mappings
  Mappings                          ├ Accounts
  Projects                          ├ Import
Settings                            └ Workspace
+ Inbox (admin)
+ Insights (AI)                   Contextual / non-nav:
+ What's New                        • Tidy Up  → nudge banner (count > 0)
                                    • Import   → action button in Money
                                    • Insights → conditional item (AI on)
                                    • Inbox    → conditional item (admin)
                                    • What's New → profile popover
```

### Hub behavior

- A hub's sub-views render as **in-page tabs** in the content header, not as expanding sidebar items. The sidebar stays flat at 5.
- Clicking "Money" lands on the **Expenses** tab (most-used default). "Portfolio" lands on **Holdings**.
- Tab state lives in the URL (`/dashboard/money?view=incomes` or `/dashboard/money/incomes`) so links and back-button work. Final route shape decided at implementation.

### Tidy Up — from nav item to nudge

Today it's a permanent item with a live badge. It only matters when there are uncategorized expenses. New behavior: a dismissible **nudge banner** at the top of Dashboard and the Money hub — "You have **N** uncategorized expenses · Tidy up →" — that disappears at zero. Same destination, zero permanent chrome.

---

## 4. Sidebar Spec

### Structure (top → bottom)

```
┌──────────────────────┐
│ ⟦·⟧  Amigo            │  ← logo mark + wordmark, 56px header
├──────────────────────┤
│  ▣  Dashboard        │
│ ▎▣  Money            │  ← active: tint + 2px accent bar
│  ▣  Portfolio        │
│  ▣  Projects         │
│  ▣  Settings         │
│                      │
│  (conditional)       │
│  ▣  Insights         │  ← only if AI enabled
│  ▣  Inbox            │  ← only if admin
│                      │
│      … flex spacer … │
├──────────────────────┤
│ ⬤  Francisco      ⌄  │  ← profile trigger → popover
└──────────────────────┘
```

### Profile popover (opens upward from the bottom trigger)

- Workspace switcher (current + list + "Create workspace")
- Account email (read-only)
- What's New
- Settings shortcut
- Theme toggle (light / dark / system)
- Sign out (destructive styling, bottom)

### Dimensions & states

| Property | Expanded | Icon rail |
|----------|----------|-----------|
| Width | 240px | 64px |
| Item | icon + label | icon only, label on hover tooltip |
| Header | mark + wordmark | mark only, centered |
| Profile | avatar + name + chevron | avatar only |

- Collapse toggle: small chevron button at the sidebar's bottom edge or in the header. Preference persisted to `localStorage` (`amigo-sidebar-rail`).
- Remove the old `amigo-sidebar-collapsed` per-section state — sections no longer exist.

### Active state (the locked treatment)

- Background: `--accent-tint` (very low-alpha accent)
- Icon + label: `--accent`
- Left edge: 2px bar in `--accent`, full item height, inset to the rounded corner
- Inactive: `--text-muted` icon/label, hover → `--surface-2` bg + `--text`

---

## 5. Color System (dark-first, semantic tokens)

### ⚠ Design decision — accent must not collide with "positive green"

Amigo shows **refunds/credits and positive amounts in green**. If the brand accent is also green (emerald/teal), the eye can't tell "this is selected/branded" from "this is a positive number." So the accent deliberately avoids the green family. Red (negative) and amber (warning) are likewise reserved. That leaves the indigo→violet→teal-blue range for the accent.

### Accent proposals — pick one

**A. Iris (indigo-violet) — recommended.** Modern, distinctive, gorgeous on dark, zero collision with green/red/amber. Reads "considered software" (Linear/Stripe lineage) without being template-blue.

| Token | Light | Dark |
|-------|-------|------|
| `--accent` | `#6366f1` | `#818cf8` |
| `--accent-strong` (CTA bg) | `#4f46e5` | `#6366f1` |
| `--accent-fg` | `#ffffff` | `#ffffff` |
| `--accent-tint` (active bg) | `rgba(99,102,241,0.08)` | `rgba(129,140,248,0.12)` |

**B. Teal.** Fintech-fresh, calmer than indigo. Slightly riskier — sits adjacent to positive-green, so we'd push positive amounts toward a more yellow emerald to keep them distinct. `--accent` light `#0d9488` / dark `#2dd4bf`.

**C. Amber/Copper.** Warmest, "wealth" feel. Requires moving the **warning** semantic to a distinct orange (`#f97316`) to avoid collision. `--accent` light `#d97706` / dark `#fbbf24`.

### Neutral base (dark-first)

| Token | Dark | Light |
|-------|------|-------|
| `--bg` (app) | `#0a0a0b` | `#f7f8fa` |
| `--surface` (sidebar, cards) | `#131316` | `#ffffff` |
| `--surface-2` (popover, hover, elevated) | `#1a1b1f` | `#f1f2f4` |
| `--border` | `rgba(255,255,255,0.08)` | `rgba(9,9,11,0.08)` |
| `--border-strong` | `rgba(255,255,255,0.14)` | `rgba(9,9,11,0.12)` |
| `--text` | `#ededef` | `#18181b` |
| `--text-muted` | `#a1a1aa` | `#52525b` |
| `--text-subtle` | `#71717a` | `#8a8a93` |

### Semantic (shared meaning, per-theme value)

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--positive` | `#16a34a` | `#4ade80` | refunds, credits, gains |
| `--negative` | `#dc2626` | `#f87171` | over-budget, losses |
| `--warning` | `#d97706` | `#fbbf24` | tidy-up nudge, caution |

### Implementation note

All values land as CSS custom properties on `:root` / `.dark` (or `[data-theme]`). Every shell color (`bg-slate-50`, `bg-white`, `text-slate-*`, `#0070f3`) gets replaced by a token. This is the part that makes both themes first-class instead of an invert hack.

---

## 6. Mobile Spec

### Bottom bar (5 slots, center Add)

```
┌──────────────────────────────────────┐
│  ▣        ▣        ⊕        ▣      ☰  │
│ Home     Money    Add    Portfolio More│
└──────────────────────────────────────┘
```

- The center **⊕ Add** is a raised circular button in `--accent-strong` — replaces the old separate floating button (one add affordance, not two).
- **More** opens the right-side drawer containing: Projects, Settings, Insights/Inbox (conditional), profile/workspace, theme toggle, sign out, What's New.
- Active tab: `--accent` icon + label (no bar needed at this size).
- Keep the existing safe-area insets and `pb-safe` handling.

### Mobile header

With the top bar gone on desktop, the mobile header stays minimal: centered wordmark, or per-page title once hubs land. Workspace switching moves into the More drawer.

---

## 7. Motion Spec

Per the motion bible — long smooth eases, purposeful durations, animate exits.

| Element | Motion |
|---------|--------|
| Nav item hover/active | bg + color 200ms `cubic-bezier(0.16,1,0.3,1)` |
| Active accent bar | scaleY 0→1 / opacity, 200ms, origin center |
| Sidebar collapse ↔ rail | width 300ms `cubic-bezier(0.22,1,0.36,1)`; labels fade 150ms |
| Profile popover | scale 0.96→1 + fade, 180ms in / 120ms out, origin bottom-left |
| Hub tab switch | content cross-fade 250ms; underline slides spring `stiffness 400, damping 30` |
| Nudge banner | enters fade+slide-down 300ms; exits fade+collapse-height 200ms |
| Mobile drawer | slide from right 300ms ease-out (keep existing) |
| Mobile Add tap | spring press `stiffness 400, damping 30`, scale 0.95 |
| First-load nav reveal | optional 40ms stagger, 350ms — subtle, can skip |

No `transition: all`. No animating width/height directly except the sidebar rail (acceptable, GPU-cheap at this scale) and banner collapse (max-height).

---

## 8. Logo / Wordmark

- Sidebar header uses the **bracket-with-dot mark** `⟦·⟧` (placeholder glyph here) + "Amigo" wordmark.
- Per brand rule: **italic serif is reserved for the mark only** — never for nav labels, section text, or microcopy. Nav labels stay in the UI sans.
- Rail mode shows the mark alone, centered.

---

## 9. Files This Will Touch (for the eventual build)

- `src/components/dashboard-shell.tsx` — rewrite: flat 5-item nav, profile popover, remove top bar, rail toggle, tokens
- `src/components/mobile-nav.tsx` — rewrite: 5-slot bar with center Add, More drawer
- `src/components/workspace-switcher.tsx` — relocate into profile popover + More drawer
- `src/app/globals.css` — semantic token definitions, `.dark` block
- New: `Money` hub page + `Portfolio` hub page (tab shells wrapping existing pages)
- New: Tidy-Up nudge banner component
- `messages/{en,pt-PT,fr-FR}.json` — new keys (hub names, tab labels), remove dead section keys
- Settings page — absorb Categories / Mappings / Accounts / Import as sub-pages

---

## 10. Open Items (decide before/during build)

1. **Accent**: confirm A (Iris) vs B (Teal) vs C (Amber). Recommendation: **A**.
2. **Hub routing shape**: query param (`?view=`) vs nested route (`/money/incomes`). Affects deep-linking and tab persistence.
3. **Net Worth as headline**: it's currently a Portfolio tab — should a net-worth figure also surface on the Dashboard hero? (Dashboard redesign, separate pass.)
4. **Theme default**: dark, light, or follow-system on first visit?
5. **Settings sub-page nav**: vertical sub-nav inside Settings, or its own tab row like the hubs?

---

*Next step after approval: break this into a Plane epic with atomic issues (tokens → sidebar → profile → mobile → hubs → Settings absorption), then build incrementally.*
