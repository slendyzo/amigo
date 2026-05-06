# Amigo Design System — Forest & Bracket

> **A private ledger for the modern household.** Bone paper, forest ink, gilt 1pt rules.
> Calm, professional, expensive-feeling. The brand of a confident concierge — never punchy, never corporate.

Amigo is a personal-finance and net-worth platform: expenses, income, recurring templates, projects, splits, and a full **Património** module (cash + portfolio + property + vehicles). Forest & Bracket replaces the previous Electric Blue identity in full. There is no dark mode — the brand is a single, opinionated paper-light surface.

---

## Sources

| Source | Path / URL |
|---|---|
| Codebase (mounted) | `AMIGO/` (Next.js 15 + Tailwind 4 + Shadcn New York) |
| Live URL | https://amigo.slendyzo.pt |
| Repo | https://github.com/slendyzo/amigo |
| Spec | `AMIGO/SPEC.md` |
| Internal design notes | `AMIGO/docs/DESIGN.md`, `AMIGO/docs/REDESIGN-FOREST-BRACKET.md`, `AMIGO/CLAUDE.md` |

---

## Index

| File | Purpose |
|---|---|
| `README.md` | This file — overview, fundamentals, visual + content rules. |
| `colors_and_type.css` | All color + type tokens. Drop-in stylesheet. The source of truth. |
| `assets/` | Logos, app icons, manifest. |
| `preview/` | Design-system spec cards (typography, colors, components). |
| `screens/` | High-fidelity recreations: Dashboard A/B, Portfolio, Add modal (Manual/Receipt/Split), mobile screens. |
| `ui_kits/web/` | Earlier React kit — superseded by `screens/` for layout fidelity. |

---

## Product Surfaces

Amigo is **one product, one surface**: a responsive web app installable as a PWA. The canonical sidebar is grouped:

1. **Visão** — Painel (Dashboard), Retrospetiva (AI Advisor monthly).
2. **Património** — Resumo, Ativos (crypto + ETFs), Imóveis, Veículos, Corretoras.
3. **Finanças** — Despesas, Receitas, Recorrentes.
4. **Ferramentas** — Importar, Categorias, Arrumar, Contas Bancárias, Mapeamentos, Projetos.
5. **Conta** — Definições, Caixa de Entrada, Workspace.

Auth surfaces (signin / signup / forgot / reset / OTP / setup-username) and onboarding live outside the dashboard shell and follow the **letterhead** treatment.

---

## Content Fundamentals

**Voice.** Calm, professional, a little warm. *Amigo* literally means "friend" — the product is a confident concierge, not a chatty buddy. Never punchy or jokey; never dry-corporate either. The voice in product UI is carried by **General Sans** and **Fraunces display** — not by italic serif. Italic serif belongs to the logo mark.

**Tone examples:**
- "O teu painel" / "Your friendly ledger"
- "Saldo do mês" · "Velocidade de gasto" · "Caixa livre" — domain terms are concrete and a touch financial.
- Empty states are quiet: "Sem despesas." not "Looks empty here! 🐰"

**Person.** Second-person, gentle. First-person plural ("we") is avoided.

**Casing.** **Title Case** for nav and section titles. **Sentence case** for buttons, descriptions, and helper text. All-caps with mono + 0.18em letter-spacing **only** for tiny eyebrow labels ("VALOR TOTAL", "P&L NÃO REALIZADO", "QUANTIDADE").

**Numbers & money.** Always `tabular-nums lining-nums` and rendered in **Fraunces** at every size. Currency symbol leads (`€1,234.56`). Negative amounts wrap in parentheses, tinted moss when refund (`(€12.00)`), crimson when loss. Percentages always carry a sign (`+2.41%` / `-0.83%`).

**Emoji.** **No.** Money apps that pepper emoji feel cheap. Iconography is lucide line icons, sized 14–20px, stroke 1.5–1.6.

**Punctuation.** Em-dashes for asides. The middle-dot (`·`) is the canonical separator in metadata rows ("EUR · Millennium · Hoje"). The bracket-with-dot mark `( · )` is the Amigo logo.

**Microcopy do/don't:**
- ✅ "Adicionar despesa" · ❌ "Adicionar uma nova despesa"
- ✅ "Entrar" · ❌ "Login"
- ✅ "Valor total" · ❌ "O Teu Património Total 💰"
- ✅ "Acima do orçamento por €23,40" · ❌ "Ups — passaste!"

---

## Visual Foundations

### Backgrounds & surfaces

- **Page background:** `--paper` `#f1ebdd` (warm bone). **Never** pure white at the page level.
- **Cards / inset surfaces:** `--paper-deep` `#e8e0cc` with 1px `--rule` `#d8cdb1` border, **6px radius**, and **no shadow**. Cards sit *flat* on the page; elevation appears only on modals/popovers.
- **No gradients.** The brand is paper-clean. The rare exception is the gilt hairline on charts.
- **No background images, no patterns, no textures, no full-bleed photography.** Imagery is functional only (charts, gauges, app icons).

### Color usage

- **Forest `#1e3a2c`** is the primary action surface — primary buttons, sidebar fill, active sidebar items, focus borders, the cashflow line, the active filter chip.
- **Gilt `#a8853a`** is the accent — **never** used as a fill. It appears as: 1pt rules under section headings, the today-marker on charts, dot-marker on income spikes, the centre dot of the bracket-with-dot mark, decorative date dividers in the ledger.
- **Ink ramp** does the heavy lifting for everything else: `--ink` `#14140f` (display), `--ink-soft` `#3d3a30` (body), `--ink-mute` `#6b6655` (secondary), `--ink-faint` `#8c8770` (tertiary, eyebrows).
- **Status colors (always muted, never saturated):**
  - **Moss `#4a6b3f`** → gains, positive deltas, refunds.
  - **Amber `#b06d1a`** → 80%+ budget consumed, warnings.
  - **Crimson `#7a2820`** → over budget, losses, destructive confirmations.
- Status chip backgrounds use the `-tint` variant (`--moss-tint`, `--crimson-tint`, `--amber-tint`). Text uses the base shade. **Never** saturated solid backgrounds.

### Category palette

Earth-tone derivatives of Forest, paper-friendly, used for category chips and donut slices:

| Token | Usage |
|---|---|
| `--cat-forest` `#3a5a45` | Casa · home |
| `--cat-clay` `#9b5a3c` | Carro · vehicle |
| `--cat-ochre` `#b08a3e` | Mercearia · grocery |
| `--cat-sage` `#8a9a6b` | Saúde · wellness |
| `--cat-rust` `#8b3a2c` | Impostos · taxes |
| `--cat-stone` `#6e6a5a` | Sem categoria |
| `--cat-plum` `#6a4458` | Eventos & Saídas |
| `--cat-bronze` `#7a5a2e` | Restaurantes |
| `--cat-moss-d` `#556b3f` | Contabilidade |
| `--cat-fog` `#8e8c84` | Serviços |

### Type

- **Fraunces** (variable, opsz 9–144, weight 300–900, SOFT 0–100, WONK 0/1) — display, headings, **all numerals**. `font-variant-numeric: tabular-nums lining-nums`.
- **General Sans** (400/500/600/700) — body, UI labels, button copy.
- **Instrument Serif** (italic) — **logo mark only** (the bracket-with-dot `( · )`). Not a voice/tone font; do not use for names, asides, subtitles, or microcopy in product UI.
- **JetBrains Mono** (400/500) — eyebrows, code, ledger metadata, value-tags.

Hero amount: `t-hero-amount` (Fraunces 64px, opsz 144, SOFT 30, tabular-lining). Body: 15px General Sans. Eyebrow: 11px JetBrains Mono uppercase, 0.18em tracking.

### Spacing & layout

- 4-pt grid. Card padding 24px. Tight rows 16px.
- Desktop dashboard: **240px sidebar** (forest fill, inset interior `--forest-deep`) + main content on `--paper`. Sidebar uses gilt-soft labels for group headers.
- Max content width 1240px on desktop. Forms cap at `max-w-md` for auth.
- Mobile: sidebar collapses to a bottom tab bar with a forest FAB (56px, 6px radius — restrained, ledger-paper, not iOS-circular).

### Borders & corners

- Default border: `1px solid var(--rule)` (`#d8cdb1`).
- Heavier rule: `1px solid var(--rule-strong)` (`#b8ad91`) for emphasized dividers.
- Statement frames (e.g. expense detail panel): `1px solid var(--ink)` (the ledger frame).
- Gilt rule: `1px solid var(--gilt)` for section accents (under titles, around hero amounts).
- **Restrained radii — ledger paper, not iOS:** `2px` hairline chips, `4px` inputs/tags, **`6px` cards/buttons** (the most common), `10–14px` modals, `9999px` only on pills/avatars.

### Rules over shadows

- The brand uses **rules, not shadows**, on cards. A card is paper-deep with a 1px rule border. Period.
- Shadows appear only on modals (`shadow-md`) and popovers/dropdowns. Never colored, never glow.
- **No inner shadows. No neumorphism. No glassmorphism** except sparingly in mobile sheets and bottom-of-content fades.

### Animation & easing

- Default duration **200ms**, `cubic-bezier(0.16, 1, 0.3, 1)` (`--ease-out`).
- Filter list re-renders use simple opacity fades (120–150ms) — no staggered motion, no spring overshoot.
- One delightful motion: the bottom sheet's drag-up uses physics-style spring deceleration (320ms `--dur-slow`).
- Pull-to-refresh on mobile uses an animate-spin gilt-tinted loader.

### Hover & press states

- **Hover:** ghost rows go to `--paper-soft`; primary forest buttons darken to `--forest-deep`; cards do **not** elevate (no shadow on hover — the rule stays).
- **Press / active:** mobile uses `active:bg-paper-soft` (no scale-down). Desktop relies on hover + focus ring.
- **Focus ring:** `0 0 0 3px var(--forest-ring)` (forest at 32% opacity) + the element's border tightens to `--forest`. Never removed.
- **Disabled:** `opacity: 0.5`, `pointer-events: none`.

### Cards — the canonical recipe

```
background: var(--paper-deep)         /* #e8e0cc */
border: 1px solid var(--rule)         /* #d8cdb1 */
border-radius: var(--radius-md)       /* 6px */
padding: var(--space-6)               /* 24px */
box-shadow: none
```

For statement-style emphasis (expense detail, hero balance frame):

```
background: var(--paper)
border: 1px solid var(--ink)          /* the ledger frame */
border-radius: var(--radius-sm)       /* 4px */
```

Gilt accent rule under section headings:

```
border-bottom: 1px solid var(--gilt);
```

---

## Iconography

**System:** [Lucide](https://lucide.dev) (line icons, 1.5–1.6px stroke). Already loaded via `lucide-react` in the codebase.

- **Stroke weight:** 1.5 for nav/sidebar icons, 1.6–2 for inline indicators (P&L arrows, confirmations).
- **Sizes:** 14px (chips/inline), 16–20px (sidebar nav, buttons), 24px+ (illustrative use, rare).
- **Color:** inherits `currentColor` — `--ink-mute` by default, `--paper` when on forest fill (sidebar), `--gilt` when accenting a section heading, status color when semantic.
- **No emoji.** No Unicode symbols as icons (except `·` and `—` as punctuation, and currency glyphs `€$£R$zł`).
- **No custom SVG illustrations** are shipped today.

**Logo / brand mark:** The bracket-with-dot mark `( · )` — set in Fraunces with a forest-filled centre dot. Available as `assets/mark.svg`. App icons in `assets/icon-192.svg` / `icon-512.svg` use a forest-filled rounded square with the cream `( · )` mark inside.

---

## Tech context (for kit fidelity)

- **Framework:** Next.js 15 (App Router) + React 19 + TypeScript.
- **Styling:** Tailwind CSS 4 with `@theme inline` tokens (mapped from `colors_and_type.css` into `globals.css`).
- **UI:** Shadcn UI (style: `new-york`, base color: `neutral`, retokenized to Forest & Bracket).
- **Charts:** Recharts.
- **Icons:** lucide-react.
- **Fonts:** next/font self-hosted: `Fraunces`, `General Sans` (Fontshare), `Instrument Serif`, `JetBrains Mono`.
- **i18n:** next-intl (`en`, `pt-PT`, `fr-FR`).
- **Theme:** **single light/paper theme**. Dark mode is intentionally retired.

---

## Caveats

- **No marketing site / docs site / mobile native app exists** — the only product surface is the web/PWA, so this design system has a single UI kit (`screens/`).
- **No slide deck templates** — `slides/` intentionally absent.
- **Wordmark / lockup:** the bracket-with-dot mark is the brand's primary mark. A wordmark in Fraunces "amigo" lowercase pairs with it when needed.
