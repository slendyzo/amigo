# VibeFinance (Amigo) - Claude Code Project Context

This file provides all context needed to start a new Claude Code session and continue development.

## Quick Reference

| Item | Value |
|------|-------|
| **Project** | VibeFinance (internal name: Amigo) |
| **Type** | Personal finance management app |
| **Live URL** | https://amigo.slendyzo.pt |
| **Repo** | https://github.com/slendyzo/amigo |
| **Neon Project ID** | `super-fog-13274723` |
| **Database** | Neon PostgreSQL (EU West 2 - London) |

## Tech Stack

- **Framework:** Next.js 15 (App Router + Turbopack)
- **Database:** Prisma 7 + PostgreSQL (Neon)
- **Auth:** NextAuth v5 (credentials + OAuth)
- **Styling:** Tailwind CSS 4
- **UI Components:** Shadcn UI (Electric Blue theme)
- **Charts:** Recharts (React 19 compatible)
- **Language:** TypeScript 5.7, React 19
- **i18n:** next-intl (en, pt-PT, fr-FR)

## Core Concepts

### Expense Types (The "Survival vs Lifestyle" Model)

```
SURVIVAL_FIXED    - Fixed recurring (Spotify, Rent, Car Lease)
SURVIVAL_VARIABLE - Variable recurring (Utilities: Luz, Agua, Gas)
LIFESTYLE         - Daily variable spending (meals, shopping)
PROJECT           - Tagged to a specific project (e.g., House renovation)
```

### Key Business Logic

- **Projects** = Tags for grouping expenses (many-to-many relation)
- **Survival expenses** are excluded when filtering by project
- **Project expenses** are excluded from survival/lifestyle totals
- **Quick-add parsing:** "mcd 12" → Name: McDonald's, Amount: 12.00, Type: LIFESTYLE

## Directory Structure

```
src/
├── app/
│   ├── api/                    # API routes
│   │   ├── auth/               # NextAuth routes
│   │   ├── expenses/           # CRUD + bulk delete
│   │   ├── categories/         # CRUD
│   │   ├── projects/           # CRUD
│   │   ├── bank-accounts/      # CRUD
│   │   ├── keyword-mappings/   # Auto-categorization rules
│   │   ├── recurring-templates/# + generate endpoint
│   │   ├── incomes/            # CRUD
│   │   ├── import/             # + preview endpoint
│   │   ├── feedback/           # Bug/feature reports
│   │   └── upload/             # Image upload (base64)
│   ├── auth/                   # Auth pages
│   ├── dashboard/              # Main app pages
│   │   ├── page.tsx            # Server component wrapper
│   │   ├── dashboard-client.tsx# Client with filters/charts
│   │   ├── expenses/           # Full expense list
│   │   ├── projects/           # Project management
│   │   ├── categories/         # Category management
│   │   ├── accounts/           # Bank account management
│   │   ├── mappings/           # Keyword mappings
│   │   ├── recurring/          # Recurring templates
│   │   ├── incomes/            # Income tracking
│   │   ├── import/             # 3-step import wizard
│   │   ├── imports/            # Import history
│   │   ├── inbox/              # Admin feedback inbox
│   │   └── settings/           # User settings
│   └── globals.css
├── components/
│   ├── ui/                     # Shadcn components
│   │   ├── living-gauge.tsx    # Survival budget gauge
│   │   └── burn-chart.tsx      # Monthly comparison
│   ├── add-expense-modal.tsx   # Quick-add with tags
│   ├── edit-expense-modal.tsx  # Edit with tag selector
│   ├── feedback-button.tsx     # Floating feedback button
│   ├── quick-create-*.tsx      # Inline create popups
│   └── sidebar.tsx             # Navigation
├── lib/
│   ├── auth.ts                 # NextAuth config
│   ├── db.ts                   # Prisma client
│   ├── parser.ts               # Smart keyword parsing
│   ├── importer.ts             # Excel/CSV import logic
│   └── utils.ts                # Shadcn cn() helper
└── middleware.ts               # Route protection

prisma/
└── schema.prisma               # Database models

messages/
├── en.json                     # English translations
├── pt-PT.json                  # Portuguese translations
└── fr-FR.json                  # French translations
```

## Database Models (Prisma)

### Main Models

- **User** - Auth, subscription status
- **Workspace** - Multi-tenancy, budget settings, language
- **BankAccount** - User's bank accounts
- **Category** - Expense categories
- **Project** - Tags for grouping expenses
- **Expense** - Core expense with type, amount, date
- **Income** - Income tracking
- **RecurringTemplate** - Auto-generate monthly expenses
- **KeywordMapping** - Auto-categorization rules
- **ImportLog** - Track import batches
- **Feedback** - Bug reports and feature requests

### Key Relations

- Expense → Projects (many-to-many)
- Expense → Category (optional)
- Expense → BankAccount (optional)
- Expense → ImportLog (for batch operations)

## Common Development Tasks

### Adding a Field to a Model

1. Update `prisma/schema.prisma`
2. Run `npx prisma db push`
3. Run `npx prisma generate`
4. Update API routes (GET to include, POST/PUT to save)
5. Update frontend types and forms
6. Run `npm run build` to verify

### Adding a New Page

1. Create `src/app/dashboard/[page]/page.tsx`
2. Add "use client" if needed
3. Add translations to `messages/*.json`
4. Add sidebar link in `src/components/sidebar.tsx`

### Mobile Responsiveness

- Default (no prefix): Mobile styles
- `md:` Desktop styles (768px+)
- For modals: Fixed centered on mobile, absolute floating on desktop

## Bug-Fixing Workflow

When asked to "fetch bugs" or "check unresolved feedback":

### 1. Query Database

```sql
SELECT f.id, f.type, f.message, f."pageUrl", f."isResolved", f."createdAt",
       f."imageUrl", u.email, u.name
FROM feedback f
LEFT JOIN users u ON f."userId" = u.id
WHERE f."isResolved" = false
ORDER BY f."createdAt" DESC
```

Use Neon MCP tool with project ID: `super-fog-13274723`

### 2. Investigate & Fix

- Analyze error message and page URL
- Search codebase for relevant files
- Present findings before fixing
- Run `npm run build` to verify

### 3. Mark Resolved

```sql
UPDATE feedback SET "isResolved" = true WHERE id = '<feedback-id>'
```

## Environment Variables

```env
DATABASE_URL="postgresql://..."      # Neon connection string
AUTH_SECRET="..."                    # npx auth secret
AUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID=""                  # Optional OAuth
GOOGLE_CLIENT_SECRET=""              # Optional OAuth
```

## Commands

```bash
npm run dev           # Start dev server (Turbopack)
npm run build         # Production build
npx prisma db push    # Sync schema to database
npx prisma generate   # Regenerate Prisma client
npx prisma studio     # Open database GUI
```

## Deployment

- **Hosting:** Vercel (auto-deploy from main branch)
- **Database:** Neon PostgreSQL
- **Domain:** amigo.slendyzo.pt (via Cloudflare)

## Known Quirks

- Prisma 7 requires adapter pattern (`@prisma/adapter-pg`)
- React 19: Use `ReactNode` instead of `JSX.Element`
- Node 22 + ExcelJS: Buffer type mismatch (use `@ts-expect-error`)
- Image uploads use base64 data URLs (Vercel serverless constraint)
- Middleware uses cookie check (not importing auth for Edge runtime)

## Recent Changes

Check git log for latest updates:

```bash
git log --oneline -10
```

## Testing Checklist

Before marking work complete:

- [ ] `npm run build` passes
- [ ] No TypeScript errors
- [ ] UI works on mobile and desktop
- [ ] API endpoints return expected data
- [ ] Translations added for all languages
