# Design System & Workflow

## Blueprint-First Design Process

When making significant UI/UX changes, use the **blueprint workflow** to explore options before implementation.

### Workflow Steps

1. **Create Blueprint HTML**
   - Generate a standalone HTML file in `blueprints/` folder
   - Include multiple design variants (3-4 options)
   - Add light/dark mode toggle for testing both themes
   - Include comparison table summarizing trade-offs

2. **Review & Select**
   - Open blueprint in browser
   - Test interactions and responsiveness
   - Choose preferred option with stakeholder

3. **Plan Implementation**
   - Enter plan mode to design architecture
   - Document in `.claude/plans/` for complex features
   - Consider mobile UX separately

4. **Implement & Iterate**
   - Build chosen design
   - Keep blueprint for reference
   - Update if design evolves

### Blueprint Template Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[Feature] Design Options</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    /* CSS variables matching project theme */
    :root {
      --color-background: #ffffff;
      --color-surface: #f8fafc;
      --color-text-primary: #1e293b;
      /* ... */
    }
    .dark {
      --color-background: #0f172a;
      --color-surface: #1e293b;
      --color-text-primary: #f1f5f9;
      /* ... */
    }
  </style>
</head>
<body>
  <!-- Dark mode toggle -->
  <button onclick="document.documentElement.classList.toggle('dark')">
    Toggle Dark Mode
  </button>

  <!-- Option A -->
  <section id="option-a">
    <h2>Option A: [Name]</h2>
    <!-- Design implementation -->
  </section>

  <!-- Option B, C, D... -->

  <!-- Comparison Table -->
  <table>
    <tr><th>Criteria</th><th>Option A</th><th>Option B</th></tr>
    <!-- ... -->
  </table>
</body>
</html>
```

### Naming Convention

```
blueprints/
├── [feature]-blueprint.html      # Main exploration file
├── [feature]-v2-blueprint.html   # Iteration if needed
└── archived/                     # Old blueprints for reference
```

### Example: Gym Zone Redesign

The Gym zone was redesigned using this workflow:

1. Created `blueprints/gym-redesign-blueprint.html` with 4 options:
   - Vercel-style minimal grid
   - App Store card carousel
   - Webflow two-panel sidebar (selected)
   - Bumble swipe cards

2. User reviewed and selected Webflow style + "All" category

3. Implementation plan created with mobile UX (horizontal pills)

4. Built and iterated based on feedback

---

## Design System

### Color Palette

Use semantic CSS variables for consistent theming:

```css
/* Text */
--color-text-primary    /* Main text */
--color-text-secondary  /* Subdued text */
--color-text-muted      /* Hint text, placeholders */

/* Surfaces */
--color-background      /* Page background */
--color-surface         /* Card backgrounds */
--color-surface-elevated /* Raised elements */

/* Borders */
--color-border          /* Default borders */
```

### Accent Colors

| Color   | Use Case |
|---------|----------|
| Indigo  | Primary actions, active states, links |
| Emerald | Success, positive, Tempo tools |
| Blue    | Info, Fretboard tools |
| Rose    | Ear training tools |
| Amber   | Theory tools, warnings |
| Violet  | Chord/harmony tools |
| Cyan    | Technique tools |

### Glassmorphism

```css
.glass {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.dark .glass {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
```

### Animation Guidelines

- Use `AnimatePresence mode="wait"` for filtering (not `popLayout`)
- Simple opacity fades (0.15s) for list transitions
- Avoid staggered delays on filter changes
- Use `transition-transform` and `transition-shadow` for hover states

### Loading Skeletons

All async-loading pages use **structural skeletons** instead of spinners or "Loading..." text. Skeletons must match the actual content layout to prevent layout shifts.

**Skeleton colors (theme-aware):**

- `bg-[var(--color-surface-elevated)]` — lighter blocks (badges, cards)
- `bg-[var(--color-border)]` — darker blocks (text lines, icons)

**Rules:**

1. Use `animate-pulse` on the outermost wrapper only (not per-element)
2. Match the exact grid/flex/spacing of real content
3. Wrap loaded content in a fade-in transition:

```tsx
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.2 }}
>
  {/* Content that just loaded */}
</motion.div>
```

4. For elements that appear async within an already-loaded page (e.g. HeroBanner continue button), render an invisible placeholder with the same dimensions to reserve space

**Pages with skeletons:** LevelDetail, ProfilePage, EducationalHub, LearningMap, Header/Sidebar/BottomNav

### Responsive Breakpoints

| Breakpoint | Width | Use |
|------------|-------|-----|
| Mobile | < 768px | Single column, bottom nav |
| Tablet | 768-1023px | 2 columns, bottom nav |
| Desktop | 1024px+ (lg:) | Sidebar navigation |
| Wide | 1280px+ (xl:) | EducationalHub panel |

### Mobile Patterns

**Horizontal Category Pills:**
```tsx
<div className="sticky top-0 z-10 bg-[var(--color-background)]">
  <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory">
    {categories.map(cat => (
      <button className={`
        snap-start flex-shrink-0 px-4 py-2 rounded-full
        ${isActive ? 'bg-indigo-500 text-white' : 'glass border'}
      `}>
        {label}
      </button>
    ))}
  </div>
</div>
```

**Category Filtering:**
```tsx
const [selectedCategory, setSelectedCategory] = useState<'all' | Category>('all')

const filteredItems = useMemo(() => {
  return items.filter(item =>
    selectedCategory === 'all' || item.category === selectedCategory
  )
}, [selectedCategory, items])
```

---

## Component Patterns

### Tool/Card Grid

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <AnimatePresence mode="wait">
    {items.map(item => (
      <motion.div
        key={item.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="h-full"
      >
        <Card />
      </motion.div>
    ))}
  </AnimatePresence>
</div>
```

### Two-Panel Layout (Webflow Style)

```tsx
<div className="flex min-h-screen">
  {/* Desktop Sidebar */}
  <aside className="hidden lg:flex w-56 border-r">
    {/* Navigation */}
  </aside>

  {/* Main Content */}
  <main className="flex-1 p-4">
    {/* Mobile: Category pills */}
    <div className="lg:hidden">
      {/* Horizontal pills */}
    </div>

    {/* Content grid */}
  </main>
</div>
```

### Friends & Social UI Patterns

**Tab Bar Navigation (FriendsManager):**
```tsx
<div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
  {tabs.map((tab) => (
    <button
      key={tab.id}
      onClick={() => setActiveTab(tab.id)}
      className={`
        inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl
        text-sm font-medium whitespace-nowrap touch-manipulation flex-shrink-0
        ${isActive
          ? 'bg-blue-500 text-white shadow-sm'
          : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)]'
        }
      `}
    >
      {tab.icon}
      <span>{label}</span>
      {badge > 0 && <span className="badge">{badge}</span>}
    </button>
  ))}
</div>
```

Tabs: Friends, Requests, Search, Feed, Invite. Each tab uses `AnimatePresence mode="wait"` for content transitions.

**Notification Bell (Header):**
- Bell icon with unread count badge (red dot with number)
- Polls every 30 seconds when authenticated
- Dropdown shows latest notifications, links to full inbox
- Badge uses `bg-red-500 text-white` absolute-positioned circle

**Activity Feed Items:**
- Avatar + display name + event description + emoji icon
- Relative timestamps (`timeAgo()` utility)
- Emoji reaction bar below each item (6 emojis: guitar, fire, clap, flex, party, heart)
- Compact mode (3 items) for EducationalHub sidebar

**Friend Card:**
- Avatar (gradient fallback with initials) + name + online status
- Nudge button (opens NudgePicker popover at z-[100])
- Remove button with confirmation step
- View profile link

**Public Profile Page (`/u/:username`):**
- Large avatar with gradient ring
- Display name, username, role badge
- Friend action button (contextual: Add, Pending, Accept, Friends/Remove)
- 2x2 stats grid (XP, Lessons, Challenges, Best Streak)
- Earned badges grid
- Member since date

**Invite Section:**
- Invite URL display with copy button
- Share button (uses Web Share API with clipboard fallback)
- QR code toggle (uses `qrcode.react`)

**Weekly Leaderboard:**
- Podium display for top 3 (gold/silver/bronze styling)
- Scrollable list for remaining friends
- Current user's rank highlighted
- Compact mode for EducationalHub sidebar
