# Amigo — Design System (Forest & Bracket)

> **Source of truth:** `claude design/colors_and_type.css` and `claude design/README.md`. This file is the implementation companion — how Forest & Bracket maps onto the Next.js + Tailwind 4 + Shadcn codebase.

Forest & Bracket replaces the previous Electric Blue identity in full. There is no dark mode. The brand is one opinionated paper-light surface — bone paper `#f1ebdd`, forest green `#1e3a2c`, gilt accent `#a8853a`, Fraunces serif numerals.

---

## Tokens — Tailwind / CSS variables

All tokens live in `src/app/globals.css` under `@theme inline`, sourced from the kit's `colors_and_type.css`. Tailwind utilities map to semantic classes (e.g. `bg-paper`, `bg-paper-deep`, `text-ink`, `border-rule`, `text-forest`, `text-gilt`).

**Surface tokens**

| Token | Hex | Usage |
|---|---|---|
| `--paper` | `#f1ebdd` | Page background. Never pure white. |
| `--paper-deep` | `#e8e0cc` | Card / inset surface. |
| `--paper-soft` | `#ece5d4` | Hover row. |
| `--rule` | `#d8cdb1` | Default 1px divider. |
| `--rule-strong` | `#b8ad91` | Heavier divider. |

**Ink ramp**

| Token | Hex | Usage |
|---|---|---|
| `--ink` | `#14140f` | Display, hero text. |
| `--ink-soft` | `#3d3a30` | Body. |
| `--ink-mute` | `#6b6655` | Secondary, labels. |
| `--ink-faint` | `#8c8770` | Tertiary, eyebrows. |

**Brand**

| Token | Hex | Usage |
|---|---|---|
| `--forest` | `#1e3a2c` | Primary action, sidebar fill, focus border. |
| `--forest-deep` | `#122a1f` | Pressed, sidebar interior. |
| `--forest-soft` | `#2a4d3a` | Hover. |
| `--forest-tint` | `#e6ebe4` | Tinted bg for chips/highlights. |
| `--gilt` | `#a8853a` | Accent — never used as a fill. 1pt rules, today markers, dot accents, decorative. |
| `--gilt-soft` | `#c9a85a` | Gilt on dark forest fill. |
| `--gilt-deep` | `#876a2a` | Gilt on paper, denser. |

**Status (always muted; chip bg = `-tint`, text = base)**

| Token | Usage |
|---|---|
| `--moss` / `--moss-tint` | Gain · positive · refund. |
| `--amber` / `--amber-tint` | 80%+ budget · warning. |
| `--crimson` / `--crimson-tint` | Loss · destructive · over budget. |

**Category palette** (donut slices, chips): `--cat-forest`, `--cat-clay`, `--cat-ochre`, `--cat-sage`, `--cat-rust`, `--cat-stone`, `--cat-plum`, `--cat-bronze`, `--cat-moss-d`, `--cat-fog`. See kit README for the canonical mapping.

---

## Typography

**Font families** (all self-hosted via `next/font`):

| Token | Family | Where |
|---|---|---|
| `--font-sans` | General Sans (400/500/600/700) | Body, UI labels, button copy. |
| `--font-display` | Fraunces (variable, opsz 9–144, wght 300–900, SOFT 0–100, WONK 0/1) | Display, headings. |
| `--font-num` | Fraunces (opsz 144, SOFT 30, tabular + lining nums) | **All numerals.** |
| `--font-italic` | Instrument Serif (italic) | **The bracket-with-dot logo mark only.** Not a voice/tone font. |
| `--font-mono` | JetBrains Mono (400/500) | Eyebrows, code, ledger metadata. |

**Type semantics** (utility classes from kit's `colors_and_type.css`, mirrored as Tailwind classes):

- `t-eyebrow` — 11px JetBrains Mono uppercase, `0.18em` letter-spacing, `--ink-mute`.
- `t-h1` — 46px Fraunces light, opsz 144, SOFT 50, WONK 1, `-0.02em` tracking.
- `t-h2` — 36px Fraunces light, same axis settings.
- `t-h3` — 22px General Sans semibold.
- `t-h4` — 16px General Sans semibold.
- `t-hero-amount` — 64px Fraunces regular, opsz 144 SOFT 30, tabular + lining nums.
- `t-amount` — 28px Fraunces regular, tabular + lining nums.
- `t-pull` — **Reserved.** Originally Instrument Serif 22px italic. Do **not** use in product UI; the resolved brand uses italic serif only for the logo mark. Keep the class definition for future marketing/cover surfaces only.
- `t-body` — 15–16px General Sans regular, `--ink-soft`.
- `t-small` — 13px General Sans, `--ink-mute`.
- `t-meta` — 11px JetBrains Mono, `0.04em` tracking.

All numerals **must** use Fraunces with `font-variant-numeric: tabular-nums lining-nums`. The `tabular` class enforces this.

### Italic serif — the law

Instrument Serif italic exists in the system **for the logo mark only** — the bracket-with-dot `( · )`. It is **not** a voice / tone / aside / casual-emphasis font. The earlier brand iteration treated it that way; the resolved brand does not.

✅ Allowed: the logo mark, marketing/cover surfaces if/when they exist.

❌ Not allowed in product UI:
- Person names (Eu / Ana / Francisco) → General Sans
- Subtitles, page subs, descriptive copy → General Sans
- Empty-state messages, error messages, helper text, hints → General Sans
- Settle-up summaries, observations, advisor asides → General Sans (or Fraunces display where it's a real heading)
- "Pull-quote" decorative emphasis → drop unless explicitly approved per surface
- Modal subheadings, field labels → General Sans / JetBrains Mono eyebrow

When in doubt, default to General Sans.

---

## Component conventions (codebase-side)

### Cards

```tsx
<div className="bg-paper-deep border border-rule rounded-md p-6">
  ...
</div>
```

No shadow on cards. Hover does **not** elevate — the rule stays. Statement-style emphasis (e.g. expense detail panel, hero balance frame) uses `border-ink rounded-sm` on a `paper` background.

### Buttons

- Primary: `bg-forest text-paper hover:bg-forest-deep rounded-md px-4 py-2`. Focus ring `0 0 0 3px var(--forest-ring)`.
- Ghost: `text-ink-soft hover:bg-paper-soft rounded-md px-3 py-2`.
- Destructive: `bg-crimson-tint text-crimson hover:bg-crimson hover:text-paper`.
- Icon-only: 36–40px square, ghost by default.

### Inputs

`bg-paper border border-rule rounded-sm px-3 py-2 focus:border-forest focus:ring-3 focus:ring-forest/30`. Inputs sit on paper, never on paper-deep cards (visual depth comes from the rule and the paper-on-paper-deep contrast).

### Chips / Pills

- Filter chips: `bg-paper border border-rule rounded-sm px-2.5 py-1` for inactive, `bg-forest text-paper border-forest` for active.
- Status chips: `bg-{moss|amber|crimson}-tint text-{moss|amber|crimson} rounded-sm px-2 py-0.5 text-xs`.

### Eyebrows + section headers

Every section gets a JetBrains Mono uppercase eyebrow (`text-xs tracking-eyebrow text-ink-mute`) **above** the heading. Optional **gilt rule** under the heading: `border-b border-gilt`.

### Animation

- Default `transition-colors duration-200 ease-out` (the `--ease-out` curve is `cubic-bezier(0.16, 1, 0.3, 1)`).
- List/filter re-renders use opacity fades 120–150ms. **No staggered motion, no spring overshoot.**
- Bottom sheet drag-up: physics spring 320ms.

### Loading skeletons

All async-loading pages use **structural skeletons**, not spinners. Skeleton blocks are `bg-paper-soft` with `animate-pulse`. Skeleton must match content layout — never a generic full-card grey block when the content is a multi-row list.

### Iconography

`lucide-react` only. Stroke 1.5 for nav, 1.6–2 for inline indicators. Sizes 14–20px standard. Colour inherits `currentColor` — typically `text-ink-mute`, `text-paper` on forest fill, `text-gilt` on accents, status colour when semantic.

---

## Sidebar & shell

Desktop layout: 240px sidebar (forest fill, `--forest-deep` interior detail, gilt-soft group labels) + main content on `--paper`. Sidebar groups (PT-PT canonical):

- **Visão** — Painel, Retrospetiva
- **Património** — Resumo, Ativos, Imóveis, Veículos, Corretoras
- **Finanças** — Despesas, Receitas, Recorrentes
- **Ferramentas** — Importar, Categorias, Arrumar, Contas Bancárias, Mapeamentos, Projetos
- **Conta** — Definições, Caixa de Entrada, Workspace

Mobile: sidebar collapses to a 5-tab bottom bar (Painel, Património, Despesas, Ferramentas, Conta) with a centered forest **FAB** (56×56, 6px radius — restrained, ledger-paper, not iOS-circular). The FAB opens the Add Expense **bottom sheet**.

---

## Add Expense modal — three modes

The desktop modal and mobile bottom sheet share the same three-mode tab strip:

1. **Manual** — name + amount + category + tags + accounts.
2. **Recibo (IA)** — Tesseract OCR receipt scanner, image preview + extracted fields.
3. **Dividir** — Split mode. Picks workspace members or ad-hoc names; equal / by-value / by-percentage; per-participant paid status.

Footer fixed across modes: ghost "Cancelar" + primary "Guardar despesa" with `⌘+ENTER` shortcut hint.

---

## Letterhead — auth & onboarding

Auth surfaces (signin, signup, OTP, forgot, reset, setup-username) and the onboarding wizard sit outside the dashboard shell. They use the **letterhead** treatment:

- Centred form, `max-w-md`, paper-deep card, ink-bordered statement frame.
- Fraunces wordmark / mark at the top.
- Gilt 1pt rule under the heading.
- Brand voice paragraph on desktop two-column layout uses **Fraunces display** (light, opsz 144), not Instrument Serif italic. Italic serif is reserved for the logo mark.
- Mobile collapses to single column. Pull-quote becomes a small italic line above the form.

OTP boxes: 6 inputs, each Fraunces serif numeral on inset paper with a 4px radius. Input inactive border `--rule`, active `--forest`, error `--crimson`.

---

## Dark mode — retired

The codebase has historically used Tailwind `dark:` variants (~145 occurrences). All are stripped under Forest & Bracket. The brand is paper-only. `prefers-color-scheme: dark` is ignored; the app renders the paper theme regardless.

---

## Mock workflow

When designing new surfaces or significantly reworking existing ones:

1. **Static HTML mock first** in `docs/mocks/<surface>.html`. PT-PT copy. Tokens via `<link rel="stylesheet" href="../../claude design/colors_and_type.css">`.
2. **One file per surface.** Keep cross-links in the mock footer for navigation.
3. **Approve before coding.** No production component edits before the static mock is signed off.
4. **Ship in waves of 4–6 surfaces** so feedback rounds short and code never drifts far ahead of approved design.

---

## Anti-patterns

- ❌ Pure white backgrounds. White only exists on the OTP input squares.
- ❌ Drop shadows on cards. Cards use rules.
- ❌ Saturated fills for status. Status is always `-tint` background + base text.
- ❌ Gilt as a fill. Gilt is rules, dots, and accent strokes.
- ❌ Inter, system-ui, or any sans-serif other than General Sans for body. No fallback to Helvetica.
- ❌ `dark:` Tailwind variants — paper-only.
- ❌ Emoji in product UI.
- ❌ Big drop-shadowed iOS-radius (12–24px) cards. Cards are 6px.
- ❌ Stacked-letter logo treatments. The brand mark is `( · )` and the wordmark is `amigo` lowercase Fraunces.
