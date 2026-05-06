# Forest & Bracket — Implementation Plan

> The redesign that replaces Electric Blue + Slate + Inter with Forest & Bracket — bone paper, forest ink, gilt rules, Fraunces serif numerals — across every surface of Amigo.

This is the load-bearing document for the redesign. Plane issues reference it; future sessions read it to pick up where this one left off. Update when scope or sequencing changes.

---

## North Star

Amigo becomes a **private ledger for the modern household**. Calm, professional, expensive-feeling. One opinionated paper-light surface — no dark mode. Every surface is bespoke-redesigned, not just retokenized. The Painel reads as a desk you sit at on Sunday with coffee.

**Source of truth for tokens / type / spec:**

- `claude design/colors_and_type.css` — tokens
- `claude design/README.md` — visual + content rules
- `claude design/screens/` — Dashboard A/B, Portfolio, Add modal, mobile screens
- `docs/DESIGN.md` — codebase implementation conventions

---

## Resolved branch decisions

| # | Decision | Resolved as |
|---|---|---|
| 1 | Brand direction | **Forest & Bracket** — full reskin; old Electric Blue retired in code |
| 2 | Scope depth | **Bespoke redesign everywhere** — every surface gets a mock and a fresh layout, not just tokens |
| 3 | Dashboard variant | **B (Mesa de Trabalho)** — dense planning surface |
| 4 | Living Gauge | **Retired** — Painel B's donut + cashflow + monthly bars replace it |
| 5 | Split mechanics | **Upgraded** — `SplitParticipant` model with workspace-member or ad-hoc, paid status, settled timestamp |
| 6 | Mobile add pattern | **Bottom sheet** — drag-up, swipe-to-dismiss; full-screen pattern dropped |
| 7 | Typography | **Full replacement** — Fraunces + General Sans + JetBrains Mono via `next/font`, plus Instrument Serif **for the logo mark only**. Inter removed. |
| 8 | Dark mode | **Retired** — strip ~145 `dark:` variants; ignore `prefers-color-scheme` |
| 9 | Test mock format | **Static HTML, one per surface, in `docs/mocks/`, PT-PT only** |
| 10 | Auth aesthetic | **Letterhead** — Fraunces wordmark, gilt rule, Fraunces-display brand voice on desktop two-column. No italic serif except in the logo mark. |
| 11 | Networth/Portfolio IA | **Património absorbs both** — sidebar group with Resumo / Ativos / Imóveis / Veículos / Corretoras |
| 12 | Sidebar IA | **Visão · Património · Finanças · Ferramentas · Conta** — Insights moves into Visão as Retrospetiva |
| 13 | Approval cadence | **Waves of 4–6** — code ships per approved wave |
| 14 | Mock locale | **PT-PT only** — actual code uses next-intl across en/pt-PT/fr-FR |

---

## Foundations (Wave 0 — tokens stage, lands with Wave 1)

These changes underpin every wave and are committed once at the start of Wave 1.

### Token migration

- Port `claude design/colors_and_type.css` into `src/app/globals.css` under `@theme inline`. Preserve token names (`--paper`, `--forest`, `--ink`, `--gilt`, `--moss`, `--cat-*`, etc.).
- Map Tailwind utilities: `bg-paper`, `bg-paper-deep`, `bg-paper-soft`, `text-ink`, `text-ink-soft`, `text-ink-mute`, `text-ink-faint`, `bg-forest`, `bg-forest-deep`, `bg-forest-soft`, `bg-forest-tint`, `border-rule`, `border-rule-strong`, `border-ink`, `border-gilt`, `text-gilt`, `text-gilt-deep`, `text-gilt-soft`, `text-moss`, `bg-moss-tint`, `text-amber`, `bg-amber-tint`, `text-crimson`, `bg-crimson-tint`, `text-cat-*`, `bg-cat-*`.
- Radii: drop default card radius from `12px` → `6px` (`rounded-md` redefined). Keep `rounded-sm` 4px, `rounded-lg` 10px, `rounded-xl` 14px.
- Shadows: keep `shadow-md`, `shadow-lg` only for modals/popovers. Cards lose all shadows; their depth comes from `border-rule` alone.

### Fonts

- `next/font` self-hosting for Fraunces (variable axes opsz/wght/SOFT/WONK), General Sans (Fontshare — verify license, fallback to npm `@fontsource/general-sans`), JetBrains Mono, plus Instrument Serif **scoped to the logo mark only** (do not expose as a global utility).
- Remove the existing Inter loader.
- Apply `font-display: swap` and preload the two most-used weights of each family.
- Add `tabular-nums lining-nums` defaults to a `.tabular` utility and to all numeric components.

### Dark mode strip

- Remove every `dark:` Tailwind variant across `src/` (~145 occurrences).
- Remove `next-themes` if installed; otherwise remove any theme provider, toggle UI, and `prefers-color-scheme` listeners.
- Hardcode the html root to the paper theme.
- This is mechanical but high-volume — a dedicated subagent task.

### Shadcn retokenization

- Update `components.json` (or equivalent) with the new base color.
- Sweep all Shadcn primitives in `src/components/ui/*` to use new tokens. Most are surface-bg/border/foreground swaps.

---

## Information architecture changes

### Sidebar groups (PT-PT canonical, en/fr via next-intl)

```
Visão
  · Painel              (was: Overview / Dashboard)
  · Retrospetiva        (was: Insights — moves up into Visão)

Património
  · Resumo              (was: Networth main)
  · Ativos              (was: Portfolio main)
  · Corretoras          (was: Portfolio Exchanges)
  · Imóveis             (was: Networth Property)
  · Veículos            (was: Networth Vehicle)

Finanças
  · Despesas
  · Receitas
  · Recorrentes

Ferramentas
  · Importar
  · Categorias
  · Arrumar             (with badge for pending nudges)
  · Contas Bancárias
  · Mapeamentos
  · Projetos

Conta
  · Definições
  · Caixa de Entrada    (admin feedback inbox — owner only)
  · Workspace
```

### Route changes

- `/dashboard` → Painel B layout
- `/dashboard/insights` → moves to Visão (route stays `/dashboard/insights`, but sidebar group changes)
- `/dashboard/portfolio` → stays as-is for now; sidebar groups it under Património
- `/dashboard/networth` → stays as parent route; child routes (property, vehicle) unchanged
- `/dashboard/networth` becomes the canonical "Resumo" landing page; the duplication of Networth/Portfolio in the top-level sidebar disappears

No database routes are renamed. URL stability matters for bookmarks and PWA shortcuts.

---

## Data model upgrades

### SplitParticipant (new)

```prisma
model SplitParticipant {
  id           String           @id @default(cuid())
  expenseId    String
  expense      Expense          @relation(fields: [expenseId], references: [id], onDelete: Cascade)

  // Either a workspace member or an ad-hoc name (one of the two must be set)
  memberId     String?
  member       WorkspaceMember? @relation(fields: [memberId], references: [id])
  adHocName    String?          @db.VarChar(120)

  share        Decimal          @db.Decimal(12, 2)   // amount in expense currency
  paid         Boolean          @default(false)
  settledAt    DateTime?

  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt

  @@index([expenseId])
  @@index([memberId])
}
```

`Expense.splitData` (legacy JSON) stays in the schema during migration; new code reads from `SplitParticipant` if present, falls back to the JSON if not. Backfill task moves existing splits into participant rows with `adHocName` taken from the JSON `label` and `paid: false`.

Add `Expense.payerMemberId` (optional) — who paid the bill. Used to compute "Ana owes me €42" balances per workspace.

### Backfill rule

For each Expense with `splitData` not null and no participants yet:

1. Parse `splitData` JSON
2. For each row, create a `SplitParticipant` with `adHocName = label`, `share = amount`, `paid = false`
3. Don't delete `splitData` yet — keep until the redesign ships completely (safety net)

### Living Gauge component removal

`src/components/ui/living-gauge.tsx` is deleted in Wave 1 along with its imports in `overview-client.tsx`. It is not migrated.

---

## Wave plan

Each wave: mocks first → approval → code. No code on a surface before its mock is signed off.

### Wave 1 — Foundations + Painel + Add modal + mobile bottom sheet

**Goal:** ship the design system at the foundation level so every later wave applies it consistently.

**Mocks (`docs/mocks/`):**

- `shell.html` — sidebar (forest fill, gilt-soft labels), topbar, page chrome
- `painel.html` — Dashboard B desktop: hero saldo, category donut, 30-day cashflow line, 12-month bars, ledger preview
- `add-manual.html` — desktop modal, Manual mode
- `add-recibo.html` — desktop modal, Recibo (Receipt OCR) mode
- `add-dividir.html` — desktop modal, Dividir (Split) mode
- `mobile-painel.html` — mobile dashboard with bottom tab bar + FAB
- `mobile-add-sheet.html` — mobile bottom sheet (drag-up state + dismissed state)

**Code scope after approval:**

- Foundations: token migration, font swap, dark-mode strip, Shadcn retokenization
- Schema: SplitParticipant + Expense.payerMemberId migration + backfill script
- Components: new sidebar/topbar/shell, new Painel page (`overview-client.tsx` rewrite), new add-expense-modal (3 modes including Split UI wired to the new schema), mobile bottom sheet wrapper
- Delete: `living-gauge.tsx`, related styles
- API: `/api/expenses` accepts/returns SplitParticipant rows; new `/api/splits/balances` for per-workspace owe summaries

**File manifest (Wave 1 only — protect against scope creep):**

```
src/app/globals.css
src/app/layout.tsx                              (font loader)
src/app/dashboard/layout.tsx                    (shell)
src/app/dashboard/page.tsx
src/app/dashboard/overview-client.tsx           (full rewrite)
src/components/dashboard-shell.tsx              (full rewrite)
src/components/add-expense-modal.tsx            (full rewrite)
src/components/edit-expense-modal.tsx           (split UI alignment)
src/components/ui/living-gauge.tsx              (DELETE)
src/components/ui/burn-chart.tsx                (replace or repurpose)
src/components/ui/category-breakdown.tsx        (Forest & Bracket palette)
src/components/ui/* (Shadcn primitives)         (retokenize all)
src/components/mobile-bottom-sheet.tsx          (NEW)
src/components/mobile-tab-bar.tsx               (NEW)
src/components/mobile-fab.tsx                   (NEW)
src/lib/fonts.ts                                (NEW)
prisma/schema.prisma                            (SplitParticipant + Expense.payerMemberId)
prisma/migrations/<ts>_split_participants/      (NEW)
src/app/api/expenses/route.ts                   (split payload)
src/app/api/splits/balances/route.ts            (NEW)
messages/en.json messages/pt-PT.json messages/fr-FR.json (new keys for Painel B + Split UI)
```

### Wave 2 — Finanças + Ferramentas list surfaces

**Mocks:** `despesas.html`, `receitas.html`, `recorrentes.html`, `categorias.html`, `mapeamentos.html`, `contas.html`

**Code scope:**

- `/dashboard/expenses`, `/dashboard/incomes`, `/dashboard/recurring`, `/dashboard/categories`, `/dashboard/mappings`, `/dashboard/accounts`
- Reuse Wave 1's shell + components — these are layout/list applications of the system
- Empty/loading/error states get explicit treatment per surface

### Wave 3 — Património hub + detail + wizards

**Mocks:** `patrimonio.html` (Resumo), `imovel-detalhe.html`, `veiculo-detalhe.html`, `projeto-detalhe.html`, `importar.html`, `imports-history.html`, `arrumar.html`

**Code scope:**

- `/dashboard/networth` rewritten as the Património Resumo
- `/dashboard/networth/property/[id]` and `/vehicle/[id]` redrawn
- `/dashboard/projects/[id]` redrawn
- `/dashboard/import` 3-step wizard redrawn (Forest paper aesthetic on each step)
- `/dashboard/imports` history list
- `/dashboard/tidy-up` (Arrumar) queue redrawn

### Wave 4 — Settings + Auth + Workspace + Retrospetiva

**Mocks:** `definicoes.html`, `workspace.html`, `caixa.html`, `signin.html`, `signup.html`, `signup-otp.html`, `forgot.html`, `reset.html`, `setup-username.html`, `onboarding.html`, `retrospetiva.html`

**Code scope:**

- All auth pages get the letterhead treatment (two-column desktop, single-column mobile). Brand voice paragraph in **Fraunces display** (light, opsz 144), not italic serif.
- Onboarding 3-step wizard fully redrawn
- Settings + Workspace + Inbox redrawn
- Retrospetiva (Insights) redrawn — Fraunces display for the advisor headline, General Sans for observations, paper aesthetic for the monthly retrospective layout. No italic serif.

---

## Mock workflow rules

1. One static HTML per surface in `docs/mocks/<surface>.html`.
2. PT-PT copy. Tokens via `<link rel="stylesheet" href="../../claude design/colors_and_type.css">`.
3. Each mock includes desktop and mobile breakpoints in the same file (responsive), or a separate `<surface>-mobile.html` if a fundamentally different layout is required.
4. Empty state, loading state, error state — sketched in the mock, not deferred.
5. Cross-link footer at the bottom of each mock to the next/previous mock in the wave + back to Painel.
6. **No production component edits before the mock is signed off.** This is the discipline that keeps waves coherent.
7. After approval per wave, Plane issues for that wave move from `Backlog` → `Todo` → in-progress.

---

## Out of scope

To prevent the redesign from absorbing every feature idea floating around:

- **No new product features beyond what's drawn** in the kit. Split upgrade is the one exception (it's drawn but doesn't exist in code today).
- **No backend rewrites.** Existing API contracts stay unless a wave's redesign explicitly requires a new endpoint.
- **No portfolio/exchange functionality changes.** Reskin only.
- **No i18n copy expansion** beyond what the new layouts require. Existing keys stay.
- **No new currencies** beyond EUR/USD/GBP/BRL/PLN.
- **No mobile-native app.** PWA only.
- **No marketing site.** Auth screens are the brand's first impression.
- **No new animations beyond the kit's spec.** Bottom sheet spring is the one delightful motion; everything else is opacity fades + ease-out.

---

## Plane mapping

Each wave is one Plane epic. Each surface in a wave is one Plane issue. Foundations (Wave 1) gets its own dedicated parent issue with sub-issues for token migration, font swap, dark-mode strip, schema migration, backfill.

Issue states follow standard Plane workflow: `Backlog` → `Todo` (when its mock is approved and ready) → `In Progress` → `In Review` → `Done`. Sub-agents pick up `Todo` issues with their explicit file manifest from this document.

Comments on each issue must include: what was implemented, files changed, deviations from the plan, follow-up issues created.

---

## Risks & open questions

- **General Sans license** — Fontshare requires checking commercial terms. If non-trivial, fall back to a similar humanist sans (Inter Display, Söhne, or self-host General Sans from a paid license).
- **Auth letterhead brand voice copy** — needs final wording for the Fraunces-display paragraph. Default proposal: *"A private ledger for the modern household."* (set in Fraunces display, not italic serif).
- **Retrospetiva layout** — the kit doesn't show it; needs design pass in Wave 4. Plan: Fraunces display (light, opsz 144) for the advisor headline, JetBrains Mono eyebrow for "RETROSPETIVA · OUTUBRO 2026", General Sans for observations, gilt rule under the headline. No italic serif.
- **Property/vehicle valuation visualizations** — the existing charts are Recharts line + bar. Need a Forest & Bracket retreatment in Wave 3 (gilt today-marker, paper-deep grid).
- **Split balances endpoint perf** — first cut is naive aggregation per workspace. Watch for slowness past ~1000 expenses with splits.
