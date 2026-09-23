# FieldOps Cloud — Design System

FieldOps Cloud is a premium B2B field-service operations product. The visual system is custom. shadcn/Radix primitives provide accessible behavior only.

This is **not** the default shadcn dashboard, a Bootstrap admin template, or a prior client application.

---

## Personality

Professional, operational, and trustworthy. Desktop is a command center. Mobile is an app. Ornament stays low: hairline borders, restrained fills, no glass stacks, no decorative authenticated heroes.

---

## Color

Tokens live in `web/src/app/globals.css`. Work in OKLCH.

| Token | Light | Role |
| --- | --- | --- |
| Workspace | `oklch(0.97 0.006 250)` | App canvas |
| Ink | `oklch(0.22 0.028 260)` | Primary text |
| Surface | `oklch(0.995 0.002 250)` | Cards, sheets |
| Line | `oklch(0.90 0.01 250)` | Borders |
| Cobalt | `oklch(0.46 0.17 262)` | Primary accent, focus, active nav |
| Teal | `oklch(0.52 0.10 175)` | Live / in progress |
| Emerald | `oklch(0.55 0.14 150)` | Success |
| Amber | `oklch(0.72 0.14 75)` | Warning |
| Crimson | `oklch(0.55 0.19 25)` | Error / destructive |
| Nav | `oklch(0.22 0.03 260)` | Desktop rail |

Semantic status always includes a text label. Color is never the only signal.

---

## Typography

- **UI and headings:** Geist Sans (`--font-geist-sans` → `--font-sans`, `--font-heading`)
- **Numeric / IDs / timestamps:** Geist Mono via `.type-numeric`
- **Section labels:** `.type-label` — 11px, medium, wide tracking, uppercase

| Name | Size | Weight | Use |
| --- | --- | --- | --- |
| Display | 30–48px | 600 | Marketing only |
| Title | 16–20px | 600 | Page titles |
| Body | 15px mobile / 14px desktop | 400 | App default |
| Label | 11px | 500 | Section labels |
| Numeric | 12–18px mono | 500–600 | Metrics, times |

Do not ship 12px body text on phones.

---

## Spacing

Scale: **4 / 8 / 12 / 16 / 24**.

- Desktop page padding: 16–24px (`px-4` / `md:px-6`)
- Pane padding: 12–16px
- Rail item height: 36px
- Mobile header: 48px plus `env(safe-area-inset-top)`
- Mobile bottom nav: 60px plus `env(safe-area-inset-bottom)`
- Touch targets: ≥ 44px (`h-11`)

---

## Radius

`--radius: 0.5rem`.

| Surface | Radius |
| --- | --- |
| Buttons / inputs / chips | `rounded-md` / `rounded-lg` |
| Panes / cards | `rounded-lg` |
| Status pills | `rounded-md` |

Avoid full pills except rare mobile FABs. Avoid 1.5rem “soft SaaS” cards.

---

## Elevation

| Token | Use |
| --- | --- |
| None + 1px border | Default panes |
| `--shadow-raise` | Compact raised controls |
| `--shadow-float` | Popovers, command launcher, sheets |

Most workspace surfaces are bordered, not floating white cards. Do not stack glass panels.

---

## Responsive rules

Tested widths: **320, 360, 375, 390, 414, 768, 1024, 1280, 1440, 1920**.

| Range | Shell |
| --- | --- |
| < 768 | Mobile field shell. No permanent sidebar. Bottom nav. Card lists, not tables. |
| 768–1023 | Collapsed ink rail (56px) + desktop content. |
| ≥ 1024 | Expanded rail (220px) unless the operator collapsed it. |
| ≥ 1440 | Content maxes near 1400px. Do not stretch a single pane across 1920. |

Rules:

- `overflow-x-hidden` on the document. Tables scroll internally via `DataGrid`.
- No body horizontal scrolling.
- Safe-area utilities: `.safe-top`, `.safe-bottom`, `.pb-mobile-nav`.
- `viewport-fit=cover` is set on the root viewport.

---

## Navigation behavior

### Desktop rail

- Compact, collapsible, ink surface.
- Brand mark + organization switcher at top.
- Primary: Overview, Schedule, Jobs, Clients, Teams, Time, Approvals, Reports.
- Secondary: Settings, Help.
- Active item: 2px cobalt rail + hover fill. Not a chubby pill.
- Collapse state is UI chrome only (`localStorage` key `fieldops.rail-collapsed`).

### Top bar

- Contextual page title.
- Command launcher (`⌘K` / `Ctrl+K`).
- Notifications, quick-create, profile menu.
- Height 48px.

### Command launcher

Keyboard-first jump to workspace views. No invented job or client records.

---

## Mobile behavior

At < 768px:

- Permanent sidebar is removed.
- Compact header + org switcher under the title row.
- Bottom navigation: **Home, Jobs, Schedule, Time, More**.
- More opens a full-height sheet for Clients, Teams, Approvals, Reports, Settings, Help, Sign out.
- Large touch targets, one-handed flows, sticky bottom actions (`StickyMobileActionBar`).
- Forms and create flows use `ResponsiveDrawer` / `ResponsiveForm`.
- Inputs in auth and mobile forms are `h-11`.
- Keyboard-safe forms: extra bottom padding with `env(safe-area-inset-bottom)`.
- Navigation is tap-based, not swipe-dependent.

---

## Motion and accessibility

- Prefer 120–180ms opacity/translate. No bounce or layout animation on data refresh.
- `prefers-reduced-motion` disables non-essential transitions.
- Visible cobalt focus rings.
- Semantic forms with bound labels.
- Skip-to-content link on the app shell.
- Icon-only controls have `aria-label`.

---

## Data states

Every operational pane must support **loading**, **empty**, and **error**.

Do not render hardcoded fake production records. Empty copy describes the absence of work.

---

## Implementation map

| Concern | Location |
| --- | --- |
| Tokens / global styles | `web/src/app/globals.css` |
| FieldOps components | `web/src/components/fieldops/` |
| Auth API client | `web/src/lib/api.ts`, `web/src/lib/auth.ts` |
| Marketing shell | `MarketingShell` |
| Authenticated shell | `AppShell` |
