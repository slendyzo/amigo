# Amigo: Master Product Specification

## 1. Project Vision & Identity
**Amigo** is a high-end, minimalist expense tracking ecosystem designed to remove the friction of manual entry while providing deep insights into survival costs versus lifestyle spending.

- **Branding:** "Clean & Electric." Pure white backgrounds, high-contrast Slate-900 typography, and **Electric Blue (#0070f3)** for primary actions, gauges, and chart accents.
- **Tone:** Professional, fast, and secure.

---

## 2. Business & Monetization Model
To ensure sustainability and growth while respecting the "one-time fee" preference:

1.  **Entry Tier (1.99€ One-Time):** Standard App Store purchase.
    - Local tracking, CSV imports, and manual entry.
    - Standard dashboards.
2.  **AI Power-Up (Credit Pack or 0.99€/mo):** - Required for LLM-based parsing of "sloppy text" and PDF bank statements.
    - Offsets the cost of API calls to Claude/OpenAI.
3.  **Pro/Lifetime Upgrade (5.99€ One-Time):**
    - Unlocks Shared Workspaces (Family/Couple syncing).
    - Advanced quarterly forecasting and "Project" tracking.

---

## 3. Technical Architecture
### A. The "Hybrid" Stack
- **Framework:** Next.js 15 (App Router).
- **Mobile:** Capacitor (to wrap the Next.js app for iOS/Android stores).
- **Styling:** Tailwind CSS + Shadcn UI.
- **Charts:** Tremor.so (optimized for the Electric Blue theme).
- **Database:** Prisma ORM with self-hosted PostgreSQL 17 (Docker container).

### B. Anti-Piracy & Security
- **Server-Side Brain:** AI parsing, receipt validation, and workspace syncing must happen on the server (Next.js API).
- **JWT Auth:** NextAuth.js with strictly signed tokens. No sensitive data is exposed without a server-verified session.
- **Receipt Validation:** A dedicated API route to verify App Store/Google Play receipts before unlocking cloud features.

---

## 4. Data Logic: "Survival vs. Lifestyle"
The database must mirror the patterns found in the user's 2025 Excel templates:

### 1. Survival Block (Recurring)
- **Fixed Recurring:** Expenses that never change (e.g., Spotify, Rent, Car Lease).
- **Variable Recurring:** Necessary utilities where the merchant is fixed but the price varies (e.g., Luz, Água, Gás).

### 2. Lifestyle Feed (Variable)
- The "sloppy" daily feed of spending (e.g., "Mcdonalds 12€").
- Needs a **Privacy-First AI Toggle**:
    - *OFF:* Simple keyword matching (e.g., "mcd" maps to "Dining").
    - *ON:* LLM categorizes and cleans the entry name.

### 3. Projects (The "Casa" Model)
- Ability to tag expenses to a "Project" (e.g., House Renovation).
- **Visualization Rule:** Project expenses should be viewable separately so they don't skew the monthly "Lifestyle" burn rate.

---

## 5. Key Feature Modules

### A. The "Smart Importer"
- **Excel/CSV Mapper:** Specifically built to ingest the 2025 "Expenses.xlsx" format.
- **PDF Parser:** Extracts text from bank statements and uses an LLM to structure them into JSON entries.

### B. Mobile Quick-Add
- A prominent Floating Action Button (+).
- Single-line input: "Lunch 15.50 account-a" -> Automatically parses Name, Amount, and Bank Account.

### C. Visualizations
- **The Survival Gauge:** A circular progress bar showing how much of the "Fixed Budget" is consumed.
- **The Burn Chart:** A cumulative line chart comparing this month's spending to the previous month.
- **Currency Engine:** Real-time conversion to EUR using an external API, while storing the original transaction currency.

---

## 6. Implementation Roadmap (Phase 1)
1.  **Database:** Initialize `schema.prisma` with `User`, `Workspace`, `BankAccount`, `Expense`, and `Subscription` models.
2.  **Auth:** Set up NextAuth with a Middleware gate.
3.  **UI:** Build the Dashboard shell using Shadcn UI and the Electric Blue theme.
4.  **Import:** Build the first functional CSV parser for the 2025 template files.
5.  **Docker:** Create a `docker-compose.yml` for the self-hosted community version.