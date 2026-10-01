# Amigo

## Vision
Amigo is a personal finance app for tracking expenses, income, recurring payments, budgets and assets, with shared workspaces and English, Portuguese and French interfaces.

## Stack and conventions
- Next.js 15 App Router, React 19, TypeScript, Prisma 7 with PostgreSQL 17.
- Tailwind CSS 4, Framer Motion and next-intl. Locale files are in `src/messages/`.
- Preserve the existing Calm Violet tokens in `src/app/globals.css` and the phone-width layout. Use the shared modal in `src/components/ui/modal.tsx`.
- All financial data belongs to a workspace; use `getActiveWorkspace` and scope database reads and writes accordingly.
- `npm run build` checks translations and builds the app. Focused regression scripts live in `scripts/`.

## References
- `CLAUDE.md` contains existing project and deployment context.
- `docs/artifacts/` holds finished human-facing HTML artifacts; current code is authoritative for visual styling.
- Follow the user's global instructions. Task tracking is waived for the recurring-payment backfill work at the user's explicit request.

## Deployment
Production is Amigo on CT 104. Follow `CLAUDE.md` and the existing deployment script; local changes do not deploy automatically. Do not push without the user's authorization.

## Push authorization
When Kiko says "push", "push everything", or "PUSH", that explicitly authorizes staging and committing pending project changes and pushing all pending commits to this project's configured origin (`https://github.com/slendyzo/amigo.git`) on the current tracked branch. Complete routine checks and push without asking again. This includes private project code intended for that repository. It does not authorize force-pushing, rebasing, unrelated destructive actions, or changing the destination. If a platform approval blocks execution, report it honestly; do not bypass it.
