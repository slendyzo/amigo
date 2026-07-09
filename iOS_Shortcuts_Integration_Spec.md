# iOS Shortcuts Integration - Build Spec

**Goal:** Let iPhone users log expenses into Amigo via the iOS Shortcuts app, without opening the app. Two headline use cases:

1. **Apple Wallet automation** - every Apple Pay tap fires the iOS "Transaction" trigger, the Shortcut POSTs merchant + amount to Amigo, expense is logged silently (or opens the app pre-filled for confirmation).
2. **Back Tap / Action Button / Siri** - run a Shortcut that either quick-adds an expense by voice/prompt or opens the app.

PWAs cannot expose native App Intents, so the integration is API-based: personal access tokens + a dedicated Shortcuts endpoint. This is the same pattern used by TravelSpend, YNAB and WalletPal.

**Branch:** `feature/ios-shortcuts`
**Author:** Nuno (fork), to be reviewed and merged by Kiko.

---

## Phase overview

| Phase | What | Suggested model |
|-------|------|-----------------|
| 1 | `ApiToken` model + token lib + token management API | Opus |
| 2 | `POST /api/shortcuts/expense` endpoint (+ ping) | Opus |
| 3 | Deep link `/dashboard?add=...` prefill | Sonnet |
| 4 | Settings UI (tokens + setup guide) + translations | Sonnet |
| 5 | PWA standalone install verification | Sonnet |

Each phase = one commit (conventional commits, matching repo style: `feat(shortcuts): ...`).

---

## Phase 1 - API tokens

### 1.1 Prisma model

Add to `prisma/schema.prisma`:

```prisma
model ApiToken {
  id          String  @id @default(cuid())
  userId      String
  workspaceId String
  name        String  @db.VarChar(100) // e.g. "iPhone Wallet automation"
  tokenHash   String  @unique // sha256 hex of the raw token
  tokenPrefix String  @db.VarChar(12) // first chars for display, e.g. "amigo_a3f9"

  lastUsedAt DateTime?
  createdAt  DateTime  @default(now())

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([workspaceId])
  @@map("api_tokens")
}
```

Add the back-relations:

- `User`: `apiTokens ApiToken[]`
- `Workspace`: `apiTokens ApiToken[]`

Then run `npx prisma db push && npx prisma generate` (repo convention - this project uses `db push`, not migration files, for schema sync in dev; production applies the same push during deploy).

### 1.2 Token library - `src/lib/api-token.ts`

New file. Responsibilities: generate, hash, resolve. **The raw token is never stored** - only its sha256 hash. Raw token shown exactly once at creation.

```ts
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";

const TOKEN_PREFIX = "amigo_";

export function generateApiToken(): { raw: string; hash: string; prefix: string } {
  const raw = TOKEN_PREFIX + randomBytes(20).toString("hex"); // amigo_ + 40 hex chars
  return { raw, hash: hashApiToken(raw), prefix: raw.slice(0, 12) };
}

export function hashApiToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Resolve a Bearer token from an incoming request into a workspace context.
 * Returns null when the header is missing/invalid/unknown.
 * Mirrors the shape of getActiveWorkspace() closely enough for expense creation.
 */
export async function resolveApiToken(request: Request): Promise<{
  userId: string;
  workspace: { id: string; defaultCurrency: string; defaultBankAccountId: string | null };
} | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const raw = header.slice(7).trim();
  if (!raw.startsWith(TOKEN_PREFIX)) return null;

  const token = await prisma.apiToken.findUnique({
    where: { tokenHash: hashApiToken(raw) },
    include: {
      workspace: {
        select: { id: true, defaultCurrency: true, defaultBankAccountId: true },
      },
    },
  });
  if (!token) return null;

  // Fire-and-forget usage timestamp (don't block the request)
  prisma.apiToken
    .update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { userId: token.userId, workspace: token.workspace };
}
```

Notes:

- sha256 lookup is O(1) via the unique index - no bcrypt needed since tokens are high-entropy random strings (160 bits), not passwords.
- Token is bound to the workspace that was **active when the user created it** (captured at creation time). Wallet expenses land in that workspace regardless of what workspace the user is browsing later. This is deliberate - automations must be deterministic.

### 1.3 Token management API

**`src/app/api/tokens/route.ts`** - session-authenticated (cookie), NOT token-authenticated. Follow the existing pattern from other CRUD routes (`getActiveWorkspace()` guard).

- `GET` - list current user's tokens: `id, name, tokenPrefix, lastUsedAt, createdAt`. Never return the hash. Filter `where: { userId: context.userId }`.
- `POST` - body `{ name: string }` (validate: non-empty, max 100 chars, strip HTML via existing `stripHtmlTags`). Create with `workspaceId: context.workspace.id`. Response includes `token: raw` - **the only time the raw token is ever returned**. Cap: max 10 tokens per user (return 400 beyond that).

**`src/app/api/tokens/[id]/route.ts`**

- `DELETE` - revoke (hard delete). Guard: token must belong to `context.userId`, else 404.

---

## Phase 2 - Shortcuts endpoint

### 2.1 Refactor: extract quick-add creation into a lib

The quick-add logic currently lives inline in `POST /api/expenses` (`src/app/api/expenses/route.ts:122-160+`): parse input, match bank account hint, look up keyword mappings (longest keyword wins), resolve category/type, convert currency, create expense.

Extract it into **`src/lib/quick-add.ts`**:

```ts
export async function createQuickAddExpense(
  workspace: { id: string; defaultCurrency: string; defaultBankAccountId: string | null },
  input: string,
  opts?: { date?: Date; currency?: string; source?: string }
): Promise<{ expense: Expense; parsed: ParsedResult }>
```

- Move the existing parse + keyword-mapping + bank-account-hint + `convertToEur` + `prisma.expense.create` block verbatim (behaviour must not change).
- `opts.source` goes into `rawInput` metadata context: when source is `"shortcut"`, prefix `rawInput` with the untouched input as today - no schema change needed. (Optional nicety: store `description: "Added via iOS Shortcut"` - skip if it feels noisy.)
- `POST /api/expenses` quick-add branch becomes a thin call to this function. **Zero behaviour change for the web app** - verify by running the existing quick-add flow manually after the refactor.

### 2.2 `src/app/api/shortcuts/expense/route.ts`

`POST` only. Auth via `resolveApiToken` (Bearer). No session cookie involvement - Shortcuts' "Get Contents of URL" sends only the header we configure.

Request body (two modes):

```jsonc
// Mode A - free text (Siri dictation, manual prompt)
{ "text": "mcd 12" }

// Mode B - structured (Wallet Transaction trigger)
{
  "merchant": "CONTINENTE MATOSINHOS",  // Shortcuts "Merchant" variable
  "amount": "23.40",                    // Shortcuts "Amount" - may arrive as "€ 23,40" string
  "currency": "EUR",                    // optional, defaults to workspace defaultCurrency
  "date": "2026-07-09T18:22:00Z"        // optional ISO, defaults to now
}
```

Implementation rules:

- **Mode detection:** `text` present → Mode A, pass straight to `createQuickAddExpense`. Otherwise Mode B.
- **Mode B amount sanitation** (critical - Wallet passes localized currency strings): strip everything except digits, `,`, `.`, `-`; if both `.` and `,` present, the last one is the decimal separator; single `,` → treat as decimal comma. Reject `NaN`, zero and negative (Wallet refunds arrive negative - accept negatives, they're refunds, existing app semantics already support them).
- **Mode B merchant normalisation:** lowercase the merchant and run it through the same keyword-mapping lookup as quick-add (build the input string as `"${merchant} ${amount}"` and reuse `createQuickAddExpense` - simplest path, keeps one code path). Wallet merchant strings like `CONTINENTE MATOSINHOS PT` will hit the `continente` keyword and auto-categorize.
- **Duplicate guard:** same workspace + same amount + same normalized name within the last 3 minutes → return the existing expense with `"duplicate": true` instead of creating a second one. Wallet triggers occasionally fire twice.
- **Response** (Shortcuts shows/speaks `message`):

```json
{ "success": true, "message": "Added McDonald's €12.00", "duplicate": false,
  "expense": { "id": "...", "name": "McDonald's", "amount": 12, "currency": "EUR" } }
```

- Errors: `401 {"success":false,"message":"Invalid token"}`, `400` with a human-readable message ("Could not read the amount"). Always JSON, always include `message` - Shortcuts users see this.
- Format the amount in `message` with the existing `formatCurrency` helper.

### 2.3 `src/app/api/shortcuts/ping/route.ts`

`GET`, Bearer auth. Returns `{ success: true, workspace: "<name>", user: "<name>" }`. Used by the setup guide's "Test connection" step and by the pre-built Shortcut to validate the pasted token.

### 2.4 Security

- Endpoint creates expenses only - a leaked token cannot read history, change settings or delete anything (GET/PUT/DELETE do not exist under `/api/shortcuts/`, and `/api/tokens` is cookie-only).
- Rate limit: reuse the pattern from the OTP endpoints - in-memory counter, max 30 requests/token/minute, 429 beyond.
- Never log the raw token or Authorization header.
- Middleware: `src/middleware.ts` does not protect `/api/*` (auth is per-route), so no middleware change is needed - confirm this during build.

---

## Phase 3 - Deep link prefill (`/dashboard?add=...`)

For the "open app with the value and confirm" flow.

- In `src/app/dashboard/overview-client.tsx`: on mount, read `useSearchParams()` for `add`.
- If present: set `quickAddText` to the decoded value, focus the inline quick-add input (desktop) or dispatch the same event the bottom-nav "+" uses to open the mobile quick-add UI, pre-filled.
- Then immediately `router.replace("/dashboard")` (shallow) so refresh/back doesn't re-trigger.
- **Do not auto-submit.** The user confirms and taps save - that is the point of this mode.
- URL format: `https://amigo.slendyzo.pt/dashboard?add=continente%2023.40`.
- Caveat to document in the guide: iOS opens this in Safari, not inside the installed PWA (iOS never routes URLs into home-screen web apps). Works if the user is signed in on Safari. The silent API mode is the recommended default; this mode is the fallback for people who want to review before saving.

---

## Phase 4 - Settings UI + setup guide + i18n

### 4.1 Tokens section in Settings (`src/app/dashboard/settings/page.tsx`)

New card **"iPhone Shortcuts"** (placed after Salary/Budget sections):

- Empty state: short pitch ("Log expenses automatically when you pay with Apple Pay") + **Create token** button.
- Create flow: name input (default `"My iPhone"`) → POST `/api/tokens` → modal shows the raw token once with a copy button + warning "You won't see this again".
- Token list: name, `tokenPrefix…`, created date, last used (or "never"), delete button with confirm dialog.
- Link/button **"Setup guide"** that expands (accordion or modal) the guide below. Follow existing Settings card styling (Shadcn components already in the page).

### 4.2 Setup guide content (inside Settings, translated)

Three sub-guides, each a numbered list with the exact Shortcuts steps:

**A) Wallet auto-log (the headline feature)**
1. Create a token above, copy it.
2. Shortcuts app → Automation → New → **Transaction** → select cards → When I Tap → Run Immediately.
3. Add action **Get Contents of URL**: URL `https://amigo.slendyzo.pt/api/shortcuts/expense`, Method POST, Header `Authorization: Bearer <token>`, Request Body JSON: `merchant` = Shortcut Input → Merchant, `amount` = Shortcut Input → Amount.
4. Optional: add **Show Notification** with the `message` field from the response.
5. Pay with Apple Pay → expense appears in Amigo.

**B) Siri / Action Button quick-add**
1. New Shortcut: **Ask for Input** (text, "What did you buy?") → **Get Contents of URL** POST with body `text` = Provided Input → **Show Result** (`message`).
2. Name it "Log expense" → usable via Siri ("Hey Siri, log expense"), Action Button, Back Tap, home-screen icon.

**C) Back Tap to open Amigo**
1. Settings → Accessibility → Touch → Back Tap → Double Tap → pick the shortcut/app.
2. If Amigo is installed as a proper web app (see Phase 5), select **Open App → Amigo** if listed; otherwise use a one-action Shortcut **Open URL** `https://amigo.slendyzo.pt/dashboard`.

Also mirror this guide as a static doc: `docs/ios-shortcuts-setup.html` (self-contained HTML per repo convention for human-facing docs) so it can be linked publicly.

### 4.3 Pre-built Shortcut (optional, nice-to-have)

Build the Wallet shortcut once on a real device, share via iCloud link, hardcode the link in the guide ("Get the ready-made Shortcut"). The shortcut asks for the token on import (Import Questions). If no iCloud link is available at build time, ship the manual steps only - do not block the PR on this.

### 4.4 Translations

Add every new string to `messages/en.json`, `messages/pt-PT.json`, `messages/fr-FR.json` under a `shortcuts` namespace. No hardcoded UI strings - repo rule.

---

## Phase 5 - PWA standalone verification (bug Nuno hit)

Symptom: on iPhone 12 / iOS 18.7, Add to Home Screen produced a Safari bookmark-style launcher instead of a standalone app, and Amigo is not detectable as an app by iOS.

Checks (in order):

1. `curl -sI https://amigo.slendyzo.pt/manifest.json` - must be 200, `Content-Type: application/json` (or `application/manifest+json`), **no redirect to signin**. If Cloudflare or middleware rewrites it, fix that.
2. `manifest.json` `start_url: "/dashboard"` redirects unauthenticated users to `/signin` via middleware - that's fine for install detection, but confirm the redirect stays within `scope: "/"`.
3. Confirm `<link rel="manifest">` is present in the rendered HTML of `/` and `/signin` (unauthenticated pages - iOS reads the manifest at install time from whatever page the user is on; if the user installs from the signin page, that page must carry the manifest tag). `metadata.manifest` in `src/app/layout.tsx` covers all routes under the root layout - verify signin/signup actually use that root layout.
4. `apple-mobile-web-app-capable` is already present (`src/app/layout.tsx:58`) - good, that alone forces standalone on iOS even without manifest support.
5. Reinstall test on device: delete old icon → open site in **Safari** (not Chrome, not in-app browser) → Share → Add to Home Screen → confirm it launches full-screen without Safari chrome.
6. If it still installs as a bookmark, capture the exact iOS dialog (bookmark dialogs show a URL field; web-app dialogs don't) and debug from there.

Document findings in the PR description.

---

## Testing checklist (before PR)

- [ ] `npm run build` passes, no TypeScript errors
- [ ] `npx prisma generate` clean after schema change
- [ ] Web quick-add ("mcd 12" in dashboard) behaves exactly as before the refactor
- [ ] `POST /api/shortcuts/expense` Mode A + Mode B via curl with a real token
- [ ] Localized amount strings parse: `"23,40"`, `"€ 23,40"`, `"1.234,56"`, `"12.50"`
- [ ] Negative amount creates a refund (green, parentheses)
- [ ] Duplicate guard: same POST twice within 3 min → one expense
- [ ] Wrong/missing token → 401 JSON with message
- [ ] Token CRUD in Settings: create (raw shown once), list, delete
- [ ] Deleted token immediately stops working
- [ ] Deep link `/dashboard?add=mcd%2012` prefills, does not auto-submit, URL cleans up
- [ ] Translations present in en / pt-PT / fr-FR
- [ ] Real device: Wallet Transaction automation end-to-end with Apple Pay
- [ ] Real device: Back Tap → open app

## Out of scope (future)

- Spending summary endpoint for Siri ("how much this month")
- Income logging via Shortcuts
- Token scopes (read vs write)
- Android equivalent (Tasker/HTTP Shortcuts works against the same endpoint for free)

## Curl reference

```bash
# ping
curl -s https://amigo.slendyzo.pt/api/shortcuts/ping \
  -H "Authorization: Bearer amigo_xxx"

# free text
curl -s -X POST https://amigo.slendyzo.pt/api/shortcuts/expense \
  -H "Authorization: Bearer amigo_xxx" -H "Content-Type: application/json" \
  -d '{"text":"mcd 12"}'

# wallet-style
curl -s -X POST https://amigo.slendyzo.pt/api/shortcuts/expense \
  -H "Authorization: Bearer amigo_xxx" -H "Content-Type: application/json" \
  -d '{"merchant":"CONTINENTE MATOSINHOS PT","amount":"23,40"}'
```
