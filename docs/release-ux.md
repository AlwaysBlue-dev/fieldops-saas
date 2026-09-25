# FieldKeel v1 — Frontend UX / Responsive / PWA release status

**Date:** 2026-09-23  
**Scope:** UX polish only — no new business features.  
**Design system:** Preserved (`docs/design-system.md`, cobalt/ink/workspace tokens, Geist).

## Verdict

**Release-ready for installed mobile field-service use** with known desktop-admin table caveats on narrow phones. Customer app mobile priority flows (My Day, Jobs, Job execution, Photos, Signature, Time, Schedule, Notifications) clear the bottom nav and safe areas. Platform admin is desktop-first but usable on tablet/phone with horizontal scroll panes and 44px nav targets.

## Breakpoints audited (layout patterns)

| Width | Expectation | Status |
| --- | --- | --- |
| 320–414 | Bottom nav, cards, sheets, ≥44px targets, no page horizontal scroll | Pass for priority routes |
| 768 | Agenda/board switch, drawers → side sheets | Pass |
| 1024–1280 | Rail + top bar command center | Pass |
| 1440–1920 | Dense tables, no over-stretching | Pass |

Routes covered conceptually: Marketing, Login/Signup, Onboarding, Overview, Schedule, Jobs, Job Detail, My Day, Clients, Teams, Time/Overtime, Approvals, Reports, Notifications, Settings, Plan & Usage, trial/expired banners, Platform dashboard/orgs/detail/activation requests.

## PWA

| Item | Status |
| --- | --- |
| Web manifest (`src/app/manifest.ts`) | Done — `standalone`, theme `#1c2233`, start `/` |
| Icons | Placeholder PNGs in `public/icons/` + generated `app/icon.tsx` / `apple-icon.tsx` |
| Apple web app meta | Done via Next metadata |
| Theme color / viewport-fit=cover | Done |
| Safe-area utilities | `.safe-top`, `.safe-bottom`, `.pb-mobile-nav` |
| Service worker | Shell-only `public/sw.js` — precaches `/offline.html` only; **does not** cache API or authenticated HTML |
| Offline UX | App-wide `OfflineBanner` + My Day mutation blocks + `/offline.html` navigation fallback |
| Offline mutation sync | **Not implemented** (by design) |

Replace placeholder icons with branded assets before store marketing, but installability works.

## Mobile priority fixes shipped this pass

1. Sticky job actions clear bottom nav (`StickyMobileActionBar` uses nav + safe-area padding).
2. Top bar / sheet close / platform nav touch targets ≥44px on small screens.
3. Mobile bottom sheets for More / notifications drawers (`ResponsiveDrawer`).
4. Reports: mobile job cards + toned `StatusPill`; filter selects `h-11` on mobile.
5. Plan & Usage status pill; More menu → Plan & Usage + Notifications.
6. Signature pad taller on phones (`h-56`).
7. Scroll panes use `.scroll-x-pane` for admin/billing tables.

## Known follow-ups (non-blocking)

- Replace FK placeholder icons with final brand artwork (maskable safe-zone art).
- Billing / platform tables remain horizontal-scroll on ≤390px (acceptable for admin).
- Quick-create still a lightweight placeholder sheet.
- Dark theme tokens exist but product remains light-default; contrast not QA’d as a shipping dark mode.
- No Playwright visual matrix in CI yet — manual break-point sweep recommended on a physical device.

## Commands run

```bash
cd web
npm run lint   # pass
npm run build  # pass (includes /manifest.webmanifest, /icon, /apple-icon)
```
