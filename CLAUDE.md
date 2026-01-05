# Claude Code Project Guide

This file contains project-specific instructions for Claude Code when working on VibeFinance.

## Project Overview

VibeFinance is a personal finance management app built with:
- **Next.js 15** (App Router + Turbopack)
- **Prisma 7** with PostgreSQL (Neon)
- **NextAuth v5** (credentials + OAuth ready)
- **Tailwind CSS 4**
- **TypeScript 5.7, React 19**

## Bug-Fixing Workflow

When the user asks to "fetch bugs" or "check for unresolved feedback", use this workflow:

### 1. Query Unresolved Feedback from Database

Use the Neon MCP tool to fetch unresolved bugs:

```sql
SELECT f.id, f.type, f.message, f."pageUrl", f."isRead", f."isResolved", f."createdAt", f."imageUrl", u.email, u.name
FROM feedback f
LEFT JOIN users u ON f."userId" = u.id
WHERE f."isResolved" = false
ORDER BY f."createdAt" DESC
```

Project ID: `super-fog-13274723`

### 2. Investigate Each Bug

For each bug found:
- Analyze the error message and page URL
- Search the codebase for relevant files
- Identify the root cause
- Formulate a fix

### 3. Present Findings to User

Before fixing, present:
- Bug description (from feedback)
- Root cause analysis
- Proposed fix
- Files that will be modified

### 4. Implement Fixes

After user approval:
- Make the necessary code changes
- Run `npm run build` to verify no TypeScript errors
- Test the fix if possible

### 5. Mark as Resolved

After confirming the fix works, update the database:

```sql
UPDATE feedback SET "isResolved" = true WHERE id = '<feedback-id>'
```

## Key Directories

- `src/app/` - Next.js App Router pages and API routes
- `src/components/` - React components
- `src/lib/` - Utility functions, auth, database
- `prisma/schema.prisma` - Database schema
- `messages/` - i18n translation files (en.json, pt-PT.json, fr-FR.json)

## Common Tasks

### Adding a New Field to a Model

1. Update `prisma/schema.prisma`
2. Run `npx prisma db push` to sync with database
3. Run `npx prisma generate` to regenerate client
4. Update relevant API routes
5. Update frontend components
6. Run `npm run build` to verify

### Mobile Responsiveness

Use Tailwind responsive prefixes:
- Default (no prefix): Mobile styles
- `md:` Desktop styles (768px+)

For modals/popups, prefer:
- Mobile: Fixed position, centered with backdrop
- Desktop: Absolute position, floating near trigger

## Testing Checklist

Before marking a bug as fixed:
- [ ] Code compiles (`npm run build` passes)
- [ ] No TypeScript errors
- [ ] UI renders correctly on mobile and desktop
- [ ] API endpoints return expected data
- [ ] Database schema matches API expectations
