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
- **Email:** Resend (for password reset emails)
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
- **Negative amounts** = Refunds/credits (displayed in green with parentheses)

### Supported Currencies

```
EUR (€)  - Euro
USD ($)  - US Dollar
GBP (£)  - British Pound
BRL (R$) - Brazilian Real
PLN (zł) - Polish Zloty
```

## Directory Structure

```
src/
├── app/
│   ├── api/                    # API routes
│   │   ├── auth/               # NextAuth + password reset
│   │   │   ├── [...nextauth]/  # NextAuth handler
│   │   │   ├── register/       # User registration
│   │   │   ├── forgot-password/# Request password reset
│   │   │   ├── reset-password/ # Complete password reset
│   │   │   └── setup-username/ # OAuth username setup
│   │   ├── expenses/           # CRUD + bulk delete
│   │   ├── categories/         # CRUD
│   │   ├── projects/           # CRUD
│   │   ├── bank-accounts/      # CRUD
│   │   ├── keyword-mappings/   # Auto-categorization rules
│   │   ├── recurring-templates/# + generate endpoint
│   │   ├── incomes/            # CRUD
│   │   ├── import/             # + preview endpoint
│   │   ├── export/             # CSV/Excel export
│   │   ├── feedback/           # Bug/feature reports
│   │   ├── onboarding/         # Setup wizard data
│   │   ├── workspace/          # Workspace settings (reset onboarding)
│   │   └── upload/             # Image upload (base64)
│   ├── auth/                   # Auth pages
│   │   ├── signin/             # Login page
│   │   ├── signup/             # Registration page
│   │   ├── forgot-password/    # Request reset page
│   │   ├── reset-password/     # Set new password page
│   │   ├── setup-username/     # OAuth username setup
│   │   └── error/              # Auth error page
│   ├── dashboard/              # Main app pages
│   │   ├── page.tsx            # Server component wrapper
│   │   ├── overview-client.tsx # Client with filters/charts
│   │   ├── expenses/           # Full expense list (sortable, exportable)
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
│   ├── onboarding-modal.tsx    # 3-step setup wizard
│   ├── feedback-button.tsx     # Floating feedback button
│   ├── quick-create-*.tsx      # Inline create popups
│   └── dashboard-shell.tsx     # Layout with sidebar
├── lib/
│   ├── auth.ts                 # NextAuth config
│   ├── db.ts                   # Prisma client
│   ├── email.ts                # Resend email utility
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

- **User** - Auth, subscription status, password (hashed)
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
- **VerificationToken** - Password reset tokens

### Key Relations

- Expense → Projects (many-to-many)
- Expense → Category (optional)
- Expense → BankAccount (optional)
- Expense → ImportLog (for batch operations)

## Authentication Flow

### Password-based Login
1. User enters email/username + password on `/auth/signin`
2. Credentials validated against bcrypt hash in database
3. JWT session token created and stored in cookie

### Password Reset
1. User clicks "Forgot password?" on signin page
2. Enters email on `/auth/forgot-password`
3. System sends reset link via Resend (1 hour expiry)
4. User clicks link, sets new password on `/auth/reset-password`
5. Token validated, password updated, user redirected to signin

### OAuth (Google - Coming Soon)
1. User clicks Google button
2. Redirected to Google OAuth
3. On return, prompted to set username (`/auth/setup-username`)

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

## Excel Import System

The importer (`src/lib/importer.ts`) handles Excel/CSV files with these features:

### Sheet Detection
- Monthly sheets (e.g., "Janeiro 2025") → Regular expenses
- Project sheets (e.g., "Casa") → Tag existing expenses, don't duplicate

### Ghost Sheet Strategy
Project sheets use a 3-tier matching approach:
1. Match against expenses created in same import batch
2. Exact name match (case-insensitive, ±€2 tolerance)
3. Fuzzy match (word similarity, ±€5 tolerance)

### Amount Handling
- Negative values preserved for refunds/credits
- SUBTOTAL rows automatically skipped
- Amount tolerance for fuzzy matching

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
# Database
DATABASE_URL="postgresql://..."      # Neon connection string

# Auth
AUTH_SECRET="..."                    # npx auth secret
AUTH_URL="http://localhost:3000"     # Base URL for auth callbacks
GOOGLE_CLIENT_ID=""                  # Optional OAuth
GOOGLE_CLIENT_SECRET=""              # Optional OAuth

# Email (Password Reset)
RESEND_API_KEY="re_..."              # Resend API key
EMAIL_FROM="VibeFinance <noreply@amigo.slendyzo.pt>"  # Optional, has default
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

- **Hosting:** Docker on Proxmox server (self-hosted)
- **Database:** Neon PostgreSQL (EU West 2 - London)
- **Email:** Resend
- **Domain:** amigo.slendyzo.pt (via Cloudflare)

## Known Quirks

- Prisma 7 requires adapter pattern (`@prisma/adapter-pg`)
- React 19: Use `ReactNode` instead of `JSX.Element`
- Node 22 + ExcelJS: Buffer type mismatch (use `@ts-expect-error`)
- Image uploads use base64 data URLs (serverless constraint)
- Middleware uses cookie check (not importing auth for Edge runtime)
- Resend client uses lazy init (avoids build-time API key errors)
- Auth.js cookie names vary by protocol: `__Secure-authjs.session-token` (HTTPS) vs `authjs.session-token` (HTTP)
- iOS 18 has known PWA cookie persistence bugs (not fixable from app side)

## Complete Feature List

### Expense Management

- **Full CRUD** - Create, read, update, delete expenses
- **Bulk Operations** - Multi-select with bulk delete
- **Smart Quick-Add** - Parse "mcd 12" → McDonald's €12.00 (keyboard: N or Ctrl+Shift+A)
- **Expense Types** - SURVIVAL_FIXED, SURVIVAL_VARIABLE, LIFESTYLE, PROJECT
- **Negative Amounts** - Refunds/credits displayed in green with parentheses
- **Multi-Currency** - Store original currency + EUR conversion
- **Sorting** - By date, amount, name, category (ascending/descending)
- **Filtering** - By type, category, project, date range

### Data Export

- **CSV Export** - All expenses with headers and totals
- **Excel Export** - Multi-sheet workbook:
  - Sheet 1: Expenses (Date, Name, Amount, Type, Category, Bank Account, Projects, Status, Notes)
  - Sheet 2: Incomes (Date, Name, Amount, Type, Description)
  - Sheet 3: Summary (totals by expense type + net calculation)
- **Filter Support** - Export respects type, date range, and category filters
- **UI** - Export button with dropdown in Expenses page toolbar

### Data Import

- **File Formats** - Excel (.xlsx, .xls), CSV, PDF, OFX/QFX, QIF
- **3-Step Wizard** - Upload → Column Mapping → Import
- **Smart Detection** - Auto-detect header row and column types
- **Sheet Detection** - Monthly sheets vs project sheets
- **Ghost Sheet Strategy** - 3-tier matching (batch, exact, fuzzy) for project tagging
- **Mixed Import** - Handle files with both expenses (negative) and incomes (positive)
- **Email Parsing** - Import bank notification emails
- **Import History** - View past imports with rollback capability
- **Duplicate Prevention** - Skip SUBTOTAL rows, detect duplicates

### Income Tracking

- **Full CRUD** - Create, read, update, delete incomes
- **Recurring Income** - Monthly salary with auto-generation
- **Salary Management** - Separate salary config in Settings
- **Currency Support** - Multi-currency with EUR conversion

### Recurring Templates

- **Template Management** - Create templates for recurring expenses
- **Auto-Generation** - Generate monthly expenses automatically
- **Manual Generation** - Generate for specific month/year
- **Day Scheduling** - Set day-of-month for each template
- **Generation Tracking** - Track lastGenerated date

### Projects (Tags)

- **Full CRUD** - Create, read, update, delete projects
- **Many-to-Many** - Tag multiple projects per expense
- **Budget Tracking** - Optional budget per project with progress indicator
- **Project Details** - Dedicated page with expense breakdown
- **Smart Filtering** - Project expenses excluded from survival/lifestyle totals

### Categories

- **Full CRUD** - Create, read, update, delete categories
- **Quick Create** - Inline creation popup
- **Auto-Categorization** - Via keyword mappings

### Keyword Mappings

- **Auto-Categorization** - Map keywords to categories and expense types
- **60+ Built-in Keywords** - Dining, Transport, Subscriptions, Utilities, etc.
- **Custom Mappings** - Create your own keyword rules

### Dashboard & Visualizations

- **Overview Page** - Stats cards, recent expenses, charts
- **Living Gauge** - Circular survival budget progress indicator
- **Burn Chart** - Monthly spending comparison (current vs previous)
- **View Modes** - Month, Quarter, Year, All
- **Filters** - Project filter, type filter, date selectors

### Onboarding

- **3-Step Wizard** - Guided setup for new users
  - Step 1: Monthly salary + currency
  - Step 2: Monthly budget + currency
  - Step 3: Fixed expenses + currency
- **Currency Cascade** - Each step inherits from previous
- **Skip Option** - Skip onboarding if desired
- **Restart** - Re-run from Settings page

### Settings & Workspace

- **Budget Config** - Monthly budget amount
- **Currency Selection** - EUR, USD, GBP, BRL, PLN
- **Language Selection** - English, Portuguese, French
- **Salary Management** - Create/edit/delete recurring salary
- **Account Stats** - Total expenses, amount, categories, projects
- **Danger Zone** - Delete all expenses, delete account
- **Restart Onboarding** - Button to re-run setup wizard

### Authentication

- **Email/Password** - Registration and login
- **Password Reset** - Full forgot/reset flow via email (Resend)
- **OAuth Ready** - Setup-username endpoint for OAuth providers
- **Session Management** - JWT sessions with NextAuth v5

### Admin Features

- **Feedback Inbox** - View bug reports and feature requests
- **Image Attachments** - Up to 5 images per feedback
- **Filtering** - All, bugs, features, unread
- **Status Management** - Mark as read/resolved, delete

### PWA Support

- **Install Prompt** - iOS + Android detection
- **iOS Instructions** - Manual install guide for Safari
- **Install State** - Detect if already installed
- **Dismiss Cooldown** - 7-day cooldown after dismissing

### Feedback System

- **Floating Button** - Available on all pages
- **Bug/Feature Types** - Categorize submissions
- **Image Support** - Up to 5 screenshots with compression
- **Context Capture** - Page URL and user agent

### Internationalization

- **3 Languages** - English (en), Portuguese (pt-PT), French (fr-FR)
- **next-intl** - Full i18n integration
- **Per-Workspace** - Language setting saved to workspace

### Keyboard Shortcuts

- **N** - Open quick-add expense modal
- **Ctrl+Shift+A** - Alternative quick-add shortcut

## Testing Checklist

Before marking work complete:

- [ ] `npm run build` passes
- [ ] No TypeScript errors
- [ ] UI works on mobile and desktop
- [ ] API endpoints return expected data
- [ ] Translations added for all languages
