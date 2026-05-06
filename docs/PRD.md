# Amigo — Product Requirements Document

## Vision

Amigo is a personal-finance and net-worth platform — *a private ledger for the modern household*. One calm, opinionated surface that handles daily expenses, recurring spend, income, projects, splits, and a full Património module (cash + portfolio + property + vehicles). Built for someone who wants both an at-a-glance read of their month and a deep, planning-grade view of their wealth. Brand is Forest & Bracket: bone paper, forest ink, gilt accents, Fraunces serif numerals.

## Current Status

**Live at** https://amigo.slendyzo.pt. Self-hosted (Docker on Proxmox CT 104, Postgres 17). Multi-user (workspaces, invitations, role-based permissions). Three locales (en, pt-PT, fr-FR).

**Working today (Electric Blue era):**
- Painel with Living Gauge + Burn Chart + recents
- Despesas (CRUD, bulk delete, import/export, multi-currency)
- Receitas + Recorrentes
- Projetos (tags + budgets), Categorias, Mapeamentos, Contas
- Importar (Excel/CSV/PDF/OFX/QIF + ghost-sheet matching)
- Carteira (portfolio with exchange connections, allocation, P&L)
- Património (networth resumo + property + vehicle detail with TCO)
- Retrospetiva (AI Advisor monthly + 4 bookkeeping nudges)
- Arrumar (Tidy-up queue with nudges)
- Auth (email OTP signup, password reset, OAuth-ready)
- Onboarding 3-step wizard
- Shared workspaces (invitations, roles)
- PWA install + offline expense capture
- Receipt OCR (Tesseract.js)

**Active redesign:** Forest & Bracket. Total brand reskin + IA restructure + Split feature upgrade + Living Gauge retirement + dark mode retirement. See `REDESIGN-FOREST-BRACKET.md`.

## Features

### Completed

- [x] Core ledger CRUD (expenses, income, recurring, categories, projects, accounts)
- [x] Excel/CSV/PDF/OFX/QIF import with ghost-sheet project matching
- [x] Multi-currency (EUR/USD/GBP/BRL/PLN)
- [x] Living Gauge + Burn Chart (Electric Blue era — being retired)
- [x] Carteira (Portfolio): exchange connections, asset list, P&L, allocation
- [x] Património: networth resumo, property + vehicle detail, valuation history
- [x] Retrospetiva: AI Advisor monthly retrospective + 4 nudges + cold-start card (completed 2026-05-04)
- [x] Locale prompt hardening for pt-PT + fr-FR (completed 2026-05-05)
- [x] Shared workspaces with invitations + roles
- [x] PWA + offline expense capture + sync
- [x] Receipt OCR + auto-categorization via KEYWORD_MAP
- [x] Auth: email OTP signup, password reset, blocked-domains list

### In Progress

- [ ] **Forest & Bracket redesign — Wave 1: shell + Painel + Add modal + mobile bottom sheet**
  - Status: kit fully delivered, branch decisions resolved, mocks pending
  - Plan: `REDESIGN-FOREST-BRACKET.md`
  - Approval workflow: static HTML mocks in `/docs/mocks/`, PT-PT, approved per wave

### Planned

- [ ] **Forest & Bracket — Wave 2:** list-heavy surfaces (Despesas, Receitas, Recorrentes, Categorias, Contas, Mapeamentos)
  - Priority: high
  - Notes: tokens-first wave; no new features, just full reskin under the new system
- [ ] **Forest & Bracket — Wave 3:** detail + wizards (Património hub, Imóvel, Veículo, Projeto detail, Importar, Imports history)
  - Priority: high
  - Notes: Património hub absorbs old Portfolio + Networth top-level entries; sidebar IA changes here
- [ ] **Forest & Bracket — Wave 4:** settings + auth + advisor (Definições, Workspace, Caixa, signin/signup/forgot/reset/OTP/setup-username, Onboarding, Retrospetiva)
  - Priority: high
  - Notes: auth gets the letterhead treatment; onboarding fully redrawn
- [ ] **Split upgrade:** SplitParticipant model with workspace-member or ad-hoc participants, paid status, per-workspace balances
  - Priority: high
  - Notes: ships with the Add modal in Wave 1
- [ ] **Living Gauge retirement:** remove component, drop the Painel hero slot in favour of donut + cashflow + monthly bars
  - Priority: high
  - Notes: ships with Wave 1
- [ ] **Dark mode retirement:** strip ~145 `dark:` Tailwind variants, remove theme toggle if exposed, document as intentional brand decision
  - Priority: high
  - Notes: ships with Wave 1 (tokens stage)

### Known Issues

- **Stale design in code:** Electric Blue + Slate + Inter ships across all surfaces. Forest & Bracket only exists in `claude design/` mocks. Mismatch is intentional during the wave-by-wave migration but will look jarring while in flight.
- **DASHBOARD-REDESIGN.md superseded:** `docs/DASHBOARD-REDESIGN.md` describes a 60/40 dashboard rework that's been replaced by the Forest & Bracket Painel B treatment. Kept for history.

## Architecture Notes

- **Stack:** Next.js 15 (App Router + Turbopack), React 19, TypeScript 5.7, Prisma 7, Postgres 17, NextAuth v5, Tailwind 4, Shadcn (new-york), Recharts, Resend, next-intl, Tesseract.js.
- **Self-hosting:** Docker on Proxmox LXC `vibecode` (CT 104). Deploys via `bash /root/amigo/deploy.sh` — never `docker compose up -d --build` directly (silent build failures).
- **Database:** Self-hosted Postgres 17 on the same compose stack. Container `amigo-db`. Never use Neon — see `~/.claude/projects/.../memory/project_amigo_db.md`.
- **i18n:** next-intl. Three locales: en, pt-PT, fr-FR. Workspace stores active language.
- **Workspaces:** Multi-tenancy via Workspace + WorkspaceMember + WorkspaceInvitation. User has `activeWorkspaceId` for context.
- **Real-asset linkage:** Expense.realAssetId optionally links a fuel/repair expense to a Vehicle for TCO calculation. Same pattern available for Property.
- **AI Advisor:** Monthly retrospective stored in `Insight` table (one row per period). Locale-hardened prompts. Four nudge types: categorize, keyword, recurring, project.

## Session Log

- **2026-05-06**: Forest & Bracket design kit delivered (`claude design/`). Branch decisions resolved across 14 design questions: Forest & Bracket replaces Electric Blue in full; Dashboard B canonical; Living Gauge retired; dark mode retired; Split upgraded to SplitParticipant model; Património absorbs Portfolio + Networth in IA; Insights moves into Visão; auth gets letterhead treatment; mobile add = bottom sheet; mocks staged in waves of 4–6 in `docs/mocks/`. CLAUDE.md, DESIGN.md, kit README, and PRD updated. DASHBOARD-REDESIGN.md marked superseded. Plan and Plane issues for Wave 1 next.
- **2026-05-05**: Locale prompt hardening for pt-PT + fr-FR.
- **2026-05-04**: Four bookkeeping nudges + monthly retrospective + popup + cold-start card. Hit two silent deploy failures (`docker compose up -d --build` exit code 0); locked in `deploy.sh` as the only sanctioned deploy path.
