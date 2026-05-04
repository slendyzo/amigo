# Amigo Development Progress

## Project Overview
High-end, minimalist expense tracking app with "Survival vs Lifestyle" cost analysis.

**Tech Stack:** Next.js 15, Prisma 7, PostgreSQL 17 (self-hosted), NextAuth v5, Tailwind CSS

---

## Completed Features

### 1. Database Schema (Prisma)
- **File:** `prisma/schema.prisma`
- **Models:** User, Workspace, WorkspaceMember, BankAccount, Category, Project, Expense, RecurringTemplate, KeywordMapping, PurchaseReceipt, ImportLog
- **Enums:** SubscriptionStatus, WorkspaceType, ExpenseType (SURVIVAL_FIXED, SURVIVAL_VARIABLE, LIFESTYLE, PROJECT), ExpenseStatus, RecurrenceInterval
- **Database:** Self-hosted PostgreSQL 17 (Docker on Proxmox CT 104)

### 2. Authentication (NextAuth v5)
- **Files:**
  - `src/lib/auth.ts` - NextAuth config with Prisma adapter
  - `src/lib/db.ts` - Prisma client singleton with pg adapter
  - `src/app/api/auth/[...nextauth]/route.ts` - Auth API routes
  - `src/app/api/auth/register/route.ts` - User registration
  - `src/middleware.ts` - Route protection
- **Features:**
  - Email/password authentication (bcryptjs)
  - Google OAuth (credentials needed in .env)
  - JWT sessions
  - Auto-creates personal workspace on signup

### 3. Core Pages & Navigation

- **Landing:** `src/app/page.tsx`
- **Sign In:** `src/app/auth/signin/page.tsx`
- **Sign Up:** `src/app/auth/signup/page.tsx`
- **Dashboard Layout:** `src/app/dashboard/layout.tsx`
  - Sidebar navigation (Overview, Expenses, Projects, Categories, Bank Accounts, Import)
  - Top bar with user info and sign out
  - Light mode design
- **Dashboard Overview:** `src/app/dashboard/page.tsx` + `overview-client.tsx`
  - **View Mode Tabs:** Month, Quarter, Year, All
  - **Date Selectors:** Month/Year, Quarter/Year, or Year only based on view
  - **Project Filter:** All, No Project, or specific project
  - **Type Filter:** All, Survival Only, Lifestyle Only, Projects Only
  - **Stats Cards:**
    - Monthly/Period Total
    - Survival Fixed (excludes project expenses)
    - Survival Variable (excludes project expenses)
    - Lifestyle (excludes project expenses)
    - Projects Only
    - Grand Total (all time)
  - Recent expenses list with delete functionality
  - Color-coded expense types
  - Floating Action Button (+) for quick add
- **Sidebar Component:** `src/components/sidebar.tsx`
  - Icon-based navigation
  - Active state highlighting

### 4. Import System - FLEXIBLE COLUMN MAPPING
- **Files:**
  - `src/lib/parser.ts` - Smart keyword parsing (Level 1)
  - `src/lib/importer.ts` - Flexible Excel/CSV importer with custom column mapping
  - `src/app/api/import/route.ts` - Import API endpoint
  - `src/app/api/import/preview/route.ts` - File preview/analysis endpoint
  - `src/app/dashboard/import/page.tsx` - 3-step import wizard UI
- **Features:**
  - **Step 1: Upload** - Drag & drop or click to upload Excel/CSV
  - **Step 2: Column Mapping** - Interactive UI to map columns:
    - Auto-detects header row (scans first 5 rows)
    - Auto-suggests Date, Name, Amount columns based on header keywords
    - Shows data preview with color-coded column mapping
    - Multi-sheet support: select which sheets to import
    - Project sheet tagging: mark sheets as project expenses
  - **Step 3: Import** - Shows results with stats breakdown
  - **Smart Classification:**
    - No date = SURVIVAL_FIXED/VARIABLE based on keywords
    - Has date = LIFESTYLE
    - Project sheets = PROJECT type
  - **Keyword Detection:**
    - Date keywords: data, date, dia, day, when, quando
    - Name keywords: tipo, type, name, description, custo, expense, item
    - Amount keywords: valor, value, amount, custo, cost, price, total, €
  - Import logging with error tracking
  - Stores `rawInput` for every expense

### 5. Add Expense Feature

- **Files:**
  - `src/components/add-expense-modal.tsx` - Modal component
  - `src/app/api/expenses/route.ts` - CRUD API endpoint (GET, POST, DELETE)
- **Features:**
  - **Quick-add mode:** Parse "mcd 12€" or "uber 8.50 millennium"
  - **Manual mode:** Full form with type, category, date, bank account
  - Smart keyword parsing auto-detects merchant & category
  - Floating Action Button on dashboard
  - Auto-refresh after adding
  - **Delete expenses** with confirmation dialog

### 6. Expense Filtering & Stats

- **API Filtering:** `GET /api/expenses` supports:
  - `startDate` / `endDate` - Date range filtering
  - `projectId` - Filter by project (use `__none__` for no project)
  - `type` - Filter by expense type
  - `limit` / `offset` - Pagination
- **Stats Calculation:**
  - Correctly excludes project expenses from survival/lifestyle totals
  - Separate "Projects Only" total for project tracking

### 7. Categories CRUD
- **Files:**
  - `src/app/api/categories/route.ts` - GET, POST
  - `src/app/api/categories/[id]/route.ts` - GET, PUT, DELETE
  - `src/app/dashboard/categories/page.tsx` - Categories management UI
- **Features:**
  - List all categories with expense counts
  - Create new categories
  - Edit category names
  - Delete categories (with expense unlinking)
  - System categories protected from deletion

### 8. Bank Accounts CRUD
- **Files:**
  - `src/app/api/bank-accounts/route.ts` - GET, POST
  - `src/app/api/bank-accounts/[id]/route.ts` - GET, PUT, DELETE
  - `src/app/dashboard/accounts/page.tsx` - Bank accounts management UI
- **Features:**
  - List all bank accounts with expense counts
  - Create new accounts (name, currency, default flag)
  - Edit account details
  - Delete accounts (with expense unlinking)
  - Set default account

### 9. Projects CRUD
- **Files:**
  - `src/app/api/projects/route.ts` - GET, POST
  - `src/app/api/projects/[id]/route.ts` - GET, PUT, DELETE
  - `src/app/dashboard/projects/page.tsx` - Projects management UI
- **Features:**
  - List projects with expense counts and total spent
  - Create new projects (name, description, budget)
  - Edit project details
  - Delete projects (expenses converted to LIFESTYLE)
  - Budget tracking with progress indicator
  - Active/inactive status toggle

### 10. Keyword Mappings CRUD
- **Files:**
  - `src/app/api/keyword-mappings/route.ts` - GET, POST
  - `src/app/api/keyword-mappings/[id]/route.ts` - GET, PUT, DELETE
  - `src/app/dashboard/mappings/page.tsx` - Mappings management UI
- **Features:**
  - Map keywords to categories and/or expense types
  - Auto-categorization during import and quick-add
  - System mappings protected from deletion
  - Support for expense type override (SURVIVAL_FIXED, SURVIVAL_VARIABLE, LIFESTYLE, PROJECT)

### 11. Expenses CRUD (Full)
- **Files:**
  - `src/app/api/expenses/[id]/route.ts` - GET, PUT, DELETE
  - `src/app/dashboard/expenses/page.tsx` - Full expenses list with editing
- **Features:**
  - Full expense list with pagination (10/25/50/100 per page)
  - Edit expense inline (name, amount, type, category, project, date)
  - Delete with confirmation
  - Monthly grouping view
  - Filter by type, category, project
  - Color-coded expense types

### 12. Shadcn UI Component Library
- **Files:**
  - `components.json` - Shadcn UI configuration
  - `src/components/ui/button.tsx` - Button component
  - `src/components/ui/card.tsx` - Card component
  - `src/components/ui/progress.tsx` - Progress bar component
- **Configuration:**
  - Electric Blue primary color (oklch(0.55 0.2 250))
  - Tailwind CSS integration
  - CSS variables for theming

### 13. Dashboard Visualizations
- **Files:**
  - `src/components/ui/living-gauge.tsx` - Survival budget circular gauge
  - `src/components/ui/burn-chart.tsx` - Monthly spending comparison chart
- **Living Gauge (Survival Budget):**
  - Circular SVG progress indicator
  - Shows current survival spending vs budget
  - Color changes based on usage (blue → amber → red)
  - Percentage display with amount details
- **Burn Chart (Spending Velocity):**
  - Line chart comparing current vs previous month
  - Cumulative daily spending visualization
  - Uses Recharts library (React 19 compatible)
  - Shows difference and percentage change
  - Responsive container with tooltip

### 14. Recurring Templates
- **Files:**
  - `src/app/api/recurring-templates/route.ts` - GET, POST
  - `src/app/api/recurring-templates/[id]/route.ts` - GET, PUT, DELETE
  - `src/app/api/recurring-templates/generate/route.ts` - Generate expenses for month
  - `src/app/dashboard/recurring/page.tsx` - Templates management UI
- **Features:**
  - Create templates for recurring expenses (rent, subscriptions, utilities)
  - Set expense type (SURVIVAL_FIXED, SURVIVAL_VARIABLE, LIFESTYLE, PROJECT)
  - Fixed or variable amount support
  - Day of month configuration
  - Category assignment
  - Active/inactive toggle
  - Generate expenses for any month with duplicate prevention
  - Summary cards showing active templates and monthly total
  - Track last generated date and expense count

### 15. Tag-Based Expense Entry (Simplified UX)
- **Files:**
  - `src/components/add-expense-modal.tsx` - Redesigned with tag selector
  - `src/components/edit-expense-modal.tsx` - Added tag selector for retroactive tagging
- **Features:**
  - Tags = Projects concept for simpler UX
  - Date defaults to today with optional date picker
  - Tag selection as pill buttons
  - Inline "New" button to create tags (auto-creates projects)
  - "No tag" option for regular lifestyle expenses
  - Type automatically set to PROJECT when tag selected, LIFESTYLE otherwise
  - Retroactive tagging via edit modal
  - Category and bank account in collapsible "More options"

### 16. Settings Page
- **Files:**
  - `src/app/api/expenses/bulk/route.ts` - DELETE all expenses endpoint
  - `src/app/dashboard/settings/page.tsx` - Settings management UI
- **Features:**
  - Account overview with stats (total expenses, amount, categories, projects)
  - Currency preference selector (EUR, USD, GBP, BRL)
  - Danger zone with "Delete All Expenses" option
  - Confirmation required (type "DELETE ALL" to confirm)
  - Coming soon placeholders for: Family/Group workspaces, Profile picture, Password change, Privacy options, Data export

### 18. Mixed Expense/Income Import

- **Files:**
  - `src/app/api/import/preview/route.ts` - Auto-detects mixed positive/negative values
  - `src/app/dashboard/import/page.tsx` - Added checkbox UI for mixed import
  - `src/lib/importer.ts` - Splits expenses and incomes based on sign
- **Features:**
  - Auto-detect bank statements with both expenses (negative) and incomes (positive)
  - Checkbox in Step 2: "This file contains both expenses and incomes"
  - Auto-checked when mixed values detected with info message
  - Negative amounts imported as expenses
  - Positive amounts imported as incomes
  - Results page shows income count in green stats card
  - Works with all import formats (Excel, CSV)

---

## Environment Variables (.env)
```
DATABASE_URL="postgresql://amigo:password@db:5432/amigo" # Self-hosted Postgres (Docker)
AUTH_SECRET="..." # Generate with: npx auth secret
AUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID="" # Optional
GOOGLE_CLIENT_SECRET="" # Optional
```

---

## File Structure

```
amigo/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── [...nextauth]/route.ts
│   │   │   │   └── register/route.ts
│   │   │   ├── expenses/
│   │   │   │   ├── route.ts              ← GET, POST
│   │   │   │   ├── [id]/route.ts         ← GET, PUT, DELETE
│   │   │   │   └── bulk/route.ts         ← DELETE all expenses
│   │   │   ├── categories/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/route.ts
│   │   │   ├── projects/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/route.ts
│   │   │   ├── bank-accounts/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/route.ts
│   │   │   ├── keyword-mappings/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/route.ts
│   │   │   ├── recurring-templates/
│   │   │   │   ├── route.ts
│   │   │   │   ├── [id]/route.ts
│   │   │   │   └── generate/route.ts
│   │   │   └── import/
│   │   │       ├── route.ts
│   │   │       └── preview/route.ts
│   │   ├── auth/
│   │   │   ├── signin/page.tsx
│   │   │   └── signup/page.tsx
│   │   ├── dashboard/
│   │   │   ├── layout.tsx                ← Dashboard layout with sidebar
│   │   │   ├── page.tsx                  ← Overview (server component)
│   │   │   ├── overview-client.tsx       ← Overview with visualizations
│   │   │   ├── expenses/page.tsx         ← Full expenses CRUD
│   │   │   ├── projects/page.tsx         ← Projects CRUD
│   │   │   ├── categories/page.tsx       ← Categories CRUD
│   │   │   ├── accounts/page.tsx         ← Bank accounts CRUD
│   │   │   ├── mappings/page.tsx         ← Keyword mappings CRUD
│   │   │   ├── recurring/page.tsx        ← Recurring templates
│   │   │   ├── settings/page.tsx         ← Settings & account management
│   │   │   └── import/page.tsx           ← 3-step import wizard
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── ui/
│   │   │   ├── button.tsx                ← Shadcn button
│   │   │   ├── card.tsx                  ← Shadcn card
│   │   │   ├── progress.tsx              ← Shadcn progress
│   │   │   ├── living-gauge.tsx          ← Survival budget gauge
│   │   │   └── burn-chart.tsx            ← Monthly comparison chart
│   │   ├── add-expense-modal.tsx         ← Tag-based expense entry
│   │   ├── edit-expense-modal.tsx        ← Edit with tag selector
│   │   └── sidebar.tsx
│   ├── lib/
│   │   ├── auth.ts
│   │   ├── db.ts
│   │   ├── importer.ts
│   │   ├── parser.ts
│   │   └── utils.ts                      ← Shadcn utilities (cn)
│   └── middleware.ts
├── .env.example                          ← Environment template
├── .gitignore
├── components.json                       ← Shadcn UI config
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── README.md
├── SPEC.md
├── TECHNICAL_BLUEPRINT.md
└── PROGRESS.md
```

---

## Next Steps (from SPEC.md)

1. [x] **Add Expense Modal** - Quick-add functionality with smart parsing
2. [x] **Flexible Import System** - Column mapping for any Excel/CSV structure
3. [x] **Dashboard Navigation** - Sidebar with all feature links
4. [x] **Expense Filtering** - Filter by date range, project, type
5. [x] **Delete Expenses** - Remove expenses with confirmation
6. [x] **Light Mode UI** - Clean, light theme throughout
7. [x] **Shadcn UI Setup** - Install and configure component library
8. [x] **Visualizations** - Living Gauge, Burn Chart (Recharts - React 19 compatible)
9. [x] **Bank Accounts CRUD** - Manage bank accounts
10. [x] **Categories CRUD** - Manage expense categories
11. [x] **Projects CRUD** - Manage projects
12. [x] **Keyword Mappings CRUD** - Auto-categorization rules
13. [x] **Expenses CRUD (Full)** - Edit, pagination, monthly grouping
14. [x] **Recurring Templates** - Auto-generate survival expenses monthly
15. [x] **Tag-Based UX** - Simplified expense entry with tag/project selector
16. [x] **Settings Page** - Account settings with delete all expenses option
17. [x] **Docker** - Production Dockerfile with multi-stage build
18. [x] **Auto-Deploy** - GitHub Actions CI/CD to homelab via Tailscale + SSH
19. [x] **Mixed Expense/Income Import** - Import bank statements with both expenses and incomes
20. [x] **Data Export** - CSV/Excel export with multi-sheet workbook (Expenses, Incomes, Summary)
21. [x] **Onboarding Wizard** - 3-step setup (salary, budget, fixed expenses) with currency selection
22. [x] **Income Tracking** - Full CRUD for incomes with recurring salary support
23. [x] **Feedback System** - Bug/feature submission with up to 5 image attachments
24. [x] **Admin Inbox** - Feedback management for admins (filter, resolve, delete)
25. [x] **PWA Support** - Install prompts for iOS and Android with detection
26. [x] **Account Deletion** - Full cascade delete of user data
27. [x] **Import History** - View past imports with rollback capability
28. [x] **OFX/QFX/QIF Import** - Bank statement format support
29. [x] **Keyboard Shortcuts** - N and Ctrl+Shift+A for quick-add
30. [ ] **Family/Group Workspaces** - Share expenses with family members
31. [ ] **Multi-Currency Live Rates** - Real-time exchange rate conversion
32. [ ] **Mobile App** - React Native version

---

## Performance Optimizations

### 17. Dashboard Performance Audit & Optimization
- **Files:**
  - `src/app/dashboard/page.tsx` - Parallelized server queries
  - `src/app/dashboard/overview-client.tsx` - Lazy loading & parallel fetches
- **Optimizations Applied:**

#### A. Database Query Parallelization
- **Before:** 8 sequential queries (waterfall pattern, ~300-500ms)
- **After:** 7 parallel queries with `Promise.all()` (~50-80ms)
- Queries now run simultaneously:
  - Projects, Categories, Bank Accounts
  - Current month expenses, Previous month expenses
  - Monthly incomes, Recurring incomes

#### B. Client-Side Fetch Optimization
- **Eliminated initial fetch waterfall** - Previous month data pre-loaded from server
- **Parallel fetches on filter change** - `fetchBothMonths()` fetches current + previous month with `Promise.all()`
- **Skip redundant fetches** - `hasFilterChanged` flag prevents unnecessary API calls on initial render

#### C. Bundle Size Reduction (Lazy Loading)
- **Before:** Dashboard bundle 117 kB, First Load 222 kB
- **After:** Dashboard bundle 4.6 kB, First Load 110 kB
- **Improvement:** 96% smaller page bundle, 50% smaller first load
- **Method:** Lazy-load BurnChart (Recharts ~45kB) with `React.lazy()` + `Suspense`
- Added skeleton loading state for smooth UX

#### D. Performance Summary

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Dashboard bundle | 117 kB | 4.6 kB | 96% smaller |
| First Load JS | 222 kB | 110 kB | 50% smaller |
| DB queries | 8 sequential | 7 parallel | ~5x faster |
| Client fetches | 2 sequential | 2 parallel | 2x faster |
| Initial chart load | Blocking | Lazy + skeleton | Non-blocking |

---

## Known Issues / Notes

- Google OAuth requires credentials from Google Cloud Console
- Using ExcelJS instead of xlsx (xlsx has security vulnerabilities)
- Prisma 7 requires adapter pattern for database connections
- Middleware uses cookie-based auth check (not importing auth to avoid Edge runtime issues)
- React 19: Changed `JSX.Element` to `ReactNode` for type compatibility
- Node 22/ExcelJS: Buffer type mismatch requires `@ts-expect-error` workaround
- Tremor.so incompatible with React 19 - using Recharts directly instead
- Import: Project expenses use many-to-many relation (individual creates, not batch)

---

## Deployment Infrastructure

### Docker

- **Dockerfile:** Multi-stage build (deps → builder → runner)
- **docker-compose.yml:** Single service with health checks
- **Image:** `node:22-alpine` with standalone Next.js output
- **Port:** 3000

### GitHub Actions CI/CD

- **File:** `.github/workflows/deploy.yml`
- **Trigger:** Push to `main` branch or manual dispatch
- **Steps:**
  1. Setup Tailscale (ephemeral node with `tag:ci`)
  2. SSH to server via Tailscale IP
  3. Git pull, docker compose rebuild, prune old images

### Secrets Required

| Secret                | Description               |
| --------------------- | ------------------------- |
| `TS_OAUTH_CLIENT_ID`  | Tailscale OAuth client ID |
| `TS_OAUTH_SECRET`     | Tailscale OAuth secret    |
| `SERVER_HOST`         | Server Tailscale IP       |
| `SERVER_USER`         | SSH username              |
| `SERVER_SSH_KEY`      | SSH private key           |
| `SERVER_PORT`         | SSH port (default: 22)    |

### Tailscale ACL

```json
"tagOwners": {
  "tag:ci": ["autogroup:admin"]
}
```

### Cloudflare Tunnel

- Public URL: `https://amigo.slendyzo.pt`
- Routes to `localhost:3000` on the server

---

## Commands
```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run db:migrate   # Run Prisma migrations
npm run db:studio    # Open Prisma Studio
npm run db:generate  # Generate Prisma client
```

---

*Last Updated: 2026-01-08*
