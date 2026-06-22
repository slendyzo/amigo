# Amigo - Claude Code Project Context

This file provides all context needed to start a new Claude Code session and continue development.

## CRITICAL: HTML for Human-Facing Deliverables

**Anything meant for Kiko to read or review — blueprints, design proposals, plans, reports, mockups — is a self-contained HTML file in `/docs`, not markdown.** For UI/design work, the doc must *render the actual UI* (real layout, colors, theme/accent toggles, interactive states), not describe it in prose. Single `.html`, inline CSS/JS, no build step, double-click to open. Exceptions that stay markdown: this file, `PRD.md`, `README`, and agent-context files. See global CLAUDE.md for the full rule.

## CRITICAL: Use Plane for ALL Tasks

**NEVER skip Plane.** Every task, bug fix, and feature must be tracked in Plane. Before starting any work:

1. **Check Plane** for existing issues related to the work
2. **Create an issue** in Plane if one doesn't exist
3. **Move to In Progress** when you start working
4. **Comment on the issue** with what was done, files changed
5. **Move to Done** when complete

This applies to ALL work — bug fixes, features, refactors, infrastructure changes. No exceptions. Plane is the source of truth. See global CLAUDE.md for full Plane integration details.

## CRITICAL: Deploying

**The only sanctioned deploy command is `bash /root/amigo/deploy.sh` on CT 104.**

Never use `docker compose up -d --build` directly. That command's exit code is 0 even when the build crashes mid-way, which silently leaves the previous container running with a green health check while the new code never ships. We hit this twice on 2026-05-04.

`deploy.sh` does:

1. `git pull --ff-only origin main`
2. `docker compose build amigo` — exits non-zero on failure (loud)
3. `docker compose up -d amigo`
4. `docker image prune -f` (cleans up dangling layers)
5. Polls `/api/health` for up to 10s
6. Prints running image SHA + free disk

Run from the local Mac with:

```bash
ssh -i ~/.ssh/id_ed25519 root@100.110.224.38 'bash /root/amigo/deploy.sh'
```

If the script fails, **do not** fall back to `docker compose up -d --build` — diagnose the build failure first. Common causes: disk pressure (check `df -h /`, run `docker image prune -af` if needed), TypeScript errors that didn't surface in local `npm run build`, env var mismatch.

Background context (do not need to repeat to user):

- CT 104 rootfs is 32GB. Pool is `local-lvm` on `pc2-sv` (Tailscale `100.127.19.92`). To grow further: `pct resize 104 rootfs +XG` from the Proxmox host.
- Daily cron at 04:30 prunes dangling images: `30 4 * * * docker image prune -af`.
- The amigo image is ~372MB (slim multi-stage with `output: "standalone"`). The Dockerfile is fine — don't rewrite it.

## Quick Reference

| Item | Value |
|------|-------|
| **Project** | Amigo |
| **Type** | Personal finance management app |
| **Live URL** | https://amigo.slendyzo.pt |
| **Repo** | https://github.com/slendyzo/amigo |
| **Database** | Self-hosted PostgreSQL 17 (Docker on Proxmox CT 104) |
| **DB Container** | `amigo-db` (postgres:17-alpine) |
| **App Container** | `amigo` (CT 104 / vibecode) |

## Tech Stack

- **Framework:** Next.js 15 (App Router + Turbopack)
- **Database:** Prisma 7 + PostgreSQL 17 (self-hosted Docker)
- **Auth:** NextAuth v5 (credentials + OAuth)
- **Styling:** Tailwind CSS 4
- **UI Components:** Shadcn UI (Electric Blue theme)
- **Charts:** Recharts (React 19 compatible)
- **Email:** Resend (for verification codes, password reset, invitations)
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
│   │   │   ├── register/       # User registration (legacy, not used)
│   │   │   ├── send-verification/ # Send 6-digit email OTP
│   │   │   ├── verify-email/   # Verify OTP and create account
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
│   │   ├── workspaces/         # Workspaces CRUD + members + invitations
│   │   ├── invitations/        # Accept/decline invitations
│   │   ├── user/               # User profile (dismiss-announcement)
│   │   └── upload/             # Image upload (base64)
│   ├── signin/                 # Login page
│   ├── signup/                 # Registration page
│   ├── forgot-password/        # Request reset page
│   ├── reset-password/         # Set new password page
│   ├── setup-username/         # OAuth username setup
│   ├── auth-error/             # Auth error page
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
│   │   ├── settings/           # User settings
│   │   └── workspace/          # Workspace management page
│   ├── invitations/            # Accept invitation page
│   │   └── [token]/            # Dynamic route for invitation tokens
│   └── globals.css
├── components/
│   ├── ui/                     # Shadcn components
│   │   ├── living-gauge.tsx    # Survival budget gauge
│   │   ├── burn-chart.tsx      # Monthly comparison
│   │   └── category-breakdown.tsx # Category spending chart
│   ├── add-expense-modal.tsx   # Quick-add with tags
│   ├── edit-expense-modal.tsx  # Edit with tag selector
│   ├── receipt-scanner-modal.tsx # OCR receipt scanning
│   ├── add-type-selector.tsx   # Expense/Income/Receipt chooser
│   ├── onboarding-modal.tsx    # 3-step setup wizard
│   ├── announcement-modal.tsx  # Feature announcement popup
│   ├── feedback-button.tsx     # Floating feedback button
│   ├── quick-create-*.tsx      # Inline create popups
│   ├── workspace-switcher.tsx  # Workspace dropdown in sidebar
│   ├── offline-indicator.tsx   # Offline status + sync indicator
│   ├── changelog-modal.tsx     # Release notes popup
│   ├── service-worker-register.tsx # PWA service worker
│   └── dashboard-shell.tsx     # Layout with sidebar
├── lib/
│   ├── auth.ts                 # NextAuth config
│   ├── db.ts                   # Prisma client
│   ├── email.ts                # Resend email utility
│   ├── parser.ts               # Smart keyword parsing (exports KEYWORD_MAP)
│   ├── receipt-ocr.ts          # Tesseract.js OCR extraction
│   ├── importer.ts             # Excel/CSV import logic
│   ├── permissions.ts          # Role-based permission checks
│   ├── workspace.ts            # Workspace context helper
│   ├── offline-storage.ts      # IndexedDB for offline expenses
│   └── utils.ts                # Shadcn cn() helper
├── hooks/
│   ├── use-online-status.ts    # Online/offline detection + sync
│   └── use-swipe.ts            # Touch swipe gestures
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

- **User** - Auth, subscription status, password (hashed), seenAnnouncements
- **Workspace** - Multi-tenancy, budget settings, language (PERSONAL or SHARED)
- **WorkspaceMember** - Links users to workspaces with roles (OWNER/ADMIN/MEMBER)
- **WorkspaceInvitation** - Email invitations to join workspaces
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
- **EmailVerificationToken** - Registration OTP codes with pending user data

### Key Relations

- Expense → Projects (many-to-many)
- Expense → Category (optional)
- Expense → BankAccount (optional)
- Expense → ImportLog (for batch operations)
- User → WorkspaceMember → Workspace (many-to-many through membership)
- Workspace → WorkspaceInvitation (one-to-many)

## Authentication Flow

### Registration (Email OTP Verification)

1. User fills registration form (name, username, email, password) on `/auth/signup`
2. Clicks "Continue" → API validates data, hashes password
3. 6-digit code generated, stored in `EmailVerificationToken` with user data
4. Code sent via Resend email (10 minute expiry)
5. User enters code in 6-box input (auto-focus, paste support)
6. Code validated → User + Workspace created → Redirect to signin
7. Security: Max 5 attempts/code, 3 codes/email/hour rate limit

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
4. Add sidebar link in `src/components/dashboard-shell.tsx`

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
WHERE f."isRead" = false AND f."isResolved" = false
ORDER BY f."createdAt" DESC
```

SSH into the vibecode LXC and query the self-hosted database:

```bash
# Mac:
ssh -i ~/.ssh/id_ed25519 root@100.110.224.38 \
  'docker exec amigo-db psql -U amigo -d amigo -c "<SQL>"'

# Windows (via Proxmox host):
ssh -i C:\Users\kikom\.ssh\homeassistant root@100.127.19.92 \
  'pct exec 104 -- docker exec amigo-db psql -U amigo -d amigo -c "<SQL>"'
```

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
DATABASE_URL="postgresql://amigo:<password>@db:5432/amigo"  # Self-hosted Postgres (Docker internal)

# Auth
AUTH_SECRET="..."                    # npx auth secret
AUTH_URL="http://localhost:3000"     # Base URL for auth callbacks
GOOGLE_CLIENT_ID=""                  # Optional OAuth
GOOGLE_CLIENT_SECRET=""              # Optional OAuth

# Email (Password Reset)
RESEND_API_KEY="re_..."              # Resend API key
EMAIL_FROM="Amigo <noreply@amigo.slendyzo.pt>"  # Optional, has default
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
- **Database:** Self-hosted PostgreSQL 17 (Docker, same compose stack)
- **Email:** Resend
- **Domain:** amigo.slendyzo.pt (via Cloudflare)

## Known Quirks

- React 19: Use `ReactNode` instead of `JSX.Element`
- Node 22 + ExcelJS: Buffer type mismatch (use `@ts-expect-error`)
- Image uploads use base64 data URLs stored in DB (no external storage)
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
- **Category Breakdown** - Stacked bar chart showing spending by category
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

### Shared Workspaces (Family/Group Finance)

- **Workspace Types** - Personal (default) and Shared
- **Create Shared Workspace** - Create new workspace for family/groups
- **Invite Members** - Send email invitations to join workspaces
- **Role-Based Permissions**:
  - OWNER: Full control, can delete workspace, manage all members
  - ADMIN: Invite/remove members (except owner), full data CRUD
  - MEMBER: View all data, CRUD own expenses only
- **Workspace Switcher** - Dropdown in sidebar to switch between workspaces
- **Active Workspace** - User's activeWorkspaceId persists across sessions
- **Member Management** - View, change roles, remove members
- **Invitation Flow** - Email link → Sign in/up → Auto-join workspace
- **Leave Workspace** - Members can leave (owners must transfer first)

### Announcement System

- **Feature Announcements** - Modal popups for new features
- **Seen Tracking** - seenAnnouncements array on User model
- **Post-Onboarding** - Shows after onboarding completes
- **Extensible** - Add new announcement IDs to CURRENT_ANNOUNCEMENTS array
- **What's New Button** - Sidebar button to view latest announcement anytime (viewOnly mode)

### Authentication

- **Email OTP Registration** - 6-digit code verification before account creation
- **Email/Password Login** - Username or email + password
- **Password Reset** - Full forgot/reset flow via email (Resend)
- **Rate Limiting** - 3 codes/email/hour, 5 attempts/code for registration
- **Blocked Domains** - 50+ disposable email services blocked
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
- **Offline Support** - Add expenses while offline (IndexedDB storage)
- **Auto-Sync** - Pending expenses sync when back online
- **Service Worker** - Caches app shell for offline access
- **Offline Indicator** - Shows pending count and sync status

### Changelog System

- **Version Tracking** - Shows "What's New" after app updates
- **localStorage** - Tracks last seen version per user
- **Multi-language** - Changelog entries support all locales
- **Auto-dismiss** - Appears 2s after load, saves preference on close

### Feedback System

- **Floating Button** - Available on all pages
- **Bug/Feature Types** - Categorize submissions
- **Image Support** - Up to 5 screenshots with compression
- **Context Capture** - Page URL and user agent

### Internationalization

- **3 Languages** - English (en), Portuguese (pt-PT), French (fr-FR)
- **next-intl** - Full i18n integration
- **Per-Workspace** - Language setting saved to workspace
- **Dashboard i18n** - Full translation support for dashboard overview (view modes, filters, stats, charts)

### Receipt Scanner (OCR)

- **Tesseract.js** - Free, local OCR running in browser
- **Camera Capture** - Take photo on mobile devices
- **File Upload** - Drag & drop or click to upload
- **Auto-Extract** - Merchant name, total amount, date, currency
- **70+ Keywords** - Reuses KEYWORD_MAP from parser.ts for merchant detection
- **Confidence Score** - Shows OCR accuracy percentage
- **Review & Edit** - Pre-filled form allows corrections before saving
- **Multi-language** - Supports English and Portuguese receipt text

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
