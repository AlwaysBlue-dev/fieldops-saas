# FieldKeel Full QA Report

**Date:** Oct 27, 2026 (PKT)
**Scope:** Web app (owner John Smith and technician John Doe, demo org `abc-organization`), the new features (Offline Mode, Missing Access Info), and the public website (66 pages).
**Test data created:** JOB-000011 "QA test – offline & access" (dispatched, John Doe), JOB-000012 "QA full test job" (draft, unassigned), work note "QA online note" on JOB-000011, and Summit Retail Plaza site access notes "Gate code 4521, ask for Ali, mornings only". Nothing was deleted; no billing, plan, member or org setting changes.

## Executive summary

| Area | Result |
|---|---|
| App navigation, pages, settings, permissions | Pass. Everything loads, no 404s or error toasts, dark theme fine |
| Missing Access Info | Mostly Pass. Schedule filter bug, and the site contact check looks wrong |
| Offline Mode | **Fail.** Prepare works; opening and saving jobs offline don't |
| App data and wording consistency | Several mismatches (Overview, Reports, billing dates, Inbox) |
| Public website | No broken pages or links; legal pages unfinished, some contradicting copy, no security headers |

## Top priorities

| # | Priority | Issue |
|---|---|---|
| 1 | High | Offline: prepared jobs don't open offline; offline work updates fail with "We couldn't reach the server" instead of queuing. |
| 2 | High | Legal pages (Terms, Privacy, Billing, Refund, Acceptable Use, Security) still show template and placeholder text. |
| 3 | High | Website promises offline field updates that don't work yet; the Install FieldKeel App doc says there's no offline mode. |
| 4 | High | fieldkeel.com sends no security headers (HSTS, frame protection); /login and /signup can be framed. |
| 5 | High | Missing access "site contact" looks wrong: jobs flagged "missing: site contact" and the job page says "No site contact on file", while My Day shows "Site contact · (614) 555-0193". |
| 6 | Medium | Schedule "Missing access only" filter hides unassigned JOB-000010 from the Unassigned lane. |
| 7 | Medium | No way to edit a job after creating it (the job page and Actions only offer Schedule/assign, Cancel job, Open job). |
| 8 | Medium | Overview dashboard is empty ("No jobs loaded", "…once dispatch is connected") despite 9 open jobs and 1 today. |
| 9 | Medium | Reports shows "Jobs today 7 / Active 7", while Jobs shows Today 1 / Open 9. |
| 10 | Medium | Billing dates disagree: Plan & Usage "Access until 10/20/2027", while Billing/Subscription renewal is 10/13/2027. |
| 11 | Medium | Pricing page contradictions (card payment, renewal wording, Starter branding, plan cards vs table); no mobile menu on the website; developer notes in customer docs. |
| 12 | Low | See the detailed sections below. |

## 1. Web app: Owner (John Smith)

| # | Area | Result | Notes |
|---|---|---|---|
| 1 | Navigation | Pass | Overview, My Day, Schedule, Jobs, Clients, Sites, Teams, Timesheets (/time), Approvals, Reports, Inbox and Settings all load; Help opens a panel; Documentation goes to /docs. |
| 2 | Jobs: tabs | Pass | All 11, Open 9, Today 1, Unassigned 1, Missing access 9, Needs approval 0. |
| 3 | Jobs: search | Pass | "generator" finds JOB-000006. |
| 4 | Jobs: create | Pass | JOB-000012 saved as a draft. |
| 5 | Jobs: edit | **Not Available** | No edit option for title or details after creation. |
| 6 | Schedule | Pass | Day/Week views, Today/Prev/Next, date picker, filters (team, technician, client, status, priority, Missing access only). No agenda view exists. |
| 7 | Clients and Sites | Pass | Client tabs (Overview, Sites, Contacts, Jobs); the site edit drawer opens and closes. |
| 8 | Teams | Pass | 3 teams; team page tabs Overview, Members, Skills, Certifications. |
| 9 | Timesheets and Approvals | Pass | Weekly grid, employee filter, week navigation; Approvals has Jobs, Timesheets (1 pending) and Overtime tabs. |
| 10 | Settings | Pass | All 9 tabs load; theme toggle works (restored to Dark). |
| 11 | Bell, profile, New menu | Pass | All work. |
| 12 | Global search | Note | Only searches views/pages, not jobs or clients ("generator" gives "No matching views."). |
| 13 | Responsive (narrow) | Pass | Jobs, Schedule and the job page switch to the mobile layout with a bottom tab bar; no breakage. |

## 2. Web app: Technician (John Doe)

| # | Area | Result | Notes |
|---|---|---|---|
| 1 | My Day | Pass | Clock panel and job cards load, including JOB-000011. |
| 2 | Job page | Pass | Work log, materials, signature, Start work. |
| 3 | Online work update | Pass | "QA online note" saved (John Doe · Oct 27, 4:08 PM). |
| 4 | Billing blocked | Pass | "Insufficient permission — Only the organization owner can view billing and invoices." |
| 5 | Settings | Pass | Read-only; only Organization, Appearance and App tabs. |
| 6 | Sidebar scope | Check | The technician sees Clients, Sites, Teams, Reports and Schedule, plus a Schedule button on the job page. Confirm this is intended. |
| 7 | My Day "Next up" | Fail (minor) | Shows old Oct 8 jobs (JOB-000005 to 009) with times only and no date. |

## 3. New feature: Missing Access Info

| # | Check | Result | Notes |
|---|---|---|---|
| A1 | Badge in Jobs list | Pass | Matching jobs show the amber badge. |
| A2 | Missing access tab and count | Pass | Tab with count, lists matching jobs. |
| A3 | Badge on Schedule | Pass | "Access" tag on lane and Unassigned cards. |
| A4 | "Missing access only" filter | **Fail** | Works for assigned jobs, but hides unassigned JOB-000010 from the Unassigned lane. |
| A5 | Job Details warning and rows | Pass | Amber warning lists what's missing; Site access notes and Site contact rows shown. |
| A6 | Add access info button | Pass | Opens the site edit form; the warning updates after saving. |
| A7 | Soft dispatch confirm | Pass (gap) | "…missing access information (missing: site contact). Dispatch anyway?" Cancel and Dispatch anyway work. No "Add access info" button inside the dialog. |
| A8 | Site contact detection | **Fail** | Jobs say "missing: site contact" / "No site contact on file", but My Day shows "Site contact · (614) 555-0193" for the same job. The contact source used by the warning and the job page doesn't match the one My Day uses. |

## 4. New feature: Offline Mode (technician, desktop Chrome, DevTools Offline)

| # | Check | Result | Notes |
|---|---|---|---|
| B1 | Prepare for offline | Pass | "Prepared 7 jobs for offline use", "7 saved offline". |
| B2 | Job details offline | **Fail** | My Day loads offline, but "Open job" keeps showing My Day; reloading a job page shows the "You're offline… could not open this page" fallback. |
| B3 | Save changes offline | **Fail** | A work update gives "We couldn't reach the server. Check your connection and try again."; nothing queued, no pending count. |
| B4 | Sync on reconnect | Not Available | Nothing was queued. |
| B5 | Offline messaging | **Fail** | The banner "…jobs, time, photos, and approvals won't save until you're back online" contradicts the panel "Your saved jobs are available, and new changes will sync…"; the panel sometimes shows "Online — Everything is already synchronized" while offline. |

Tested in desktop Chrome with DevTools Offline, not the installed phone app. Worth confirming on a phone, but B3 looks like a real bug.

## 5. App data and wording issues

| Issue | Where | Priority |
|---|---|---|
| Overview is empty: "No jobs loaded", "No work on the board", "…once dispatch is connected." | /overview | Medium |
| Reports "Jobs today 7 / Active 7" vs Jobs "Today 1 / Open 9" | /reports | Medium |
| "Access until 10/20/2027" vs renewal 10/13/2027 | Settings: Plan & Usage vs Billing/Subscription | Medium |
| Bell shows "Invoice ready" (FC-2026-000001), but Inbox says "Inbox is clear" | Bell vs /inbox | Low |
| "1 members" (plural) | Teams list | Low |
| Summit Retail Plaza site has no timezone | Sites | Low |
| A first visit to the login page shows "Your session has expired. Please sign in again." | /login | Low |
| Hidden duplicate list markup | Clients and Teams lists | Low |

---

## 6. Public website (detailed)


**Site:** https://fieldkeel.com (www redirects here)
**Date:** Tue 27 Oct 2026, around 4:00–4:30 PM PKT
**Method:** Read-only. I used curl/requests for a full crawl (60 sitemap URLs plus all nav and footer links, 66 URLs in total) and headless Chrome via Playwright for rendering, console errors, timing, desktop 1366px and mobile 390px. No forms were submitted and there were no sign-ins or sign-ups.
**Raw data:** `/workspace/fieldkeel-features/qa/raw/` (crawl.json, render.json, page HTML/text, screenshots)

---

### Prioritised findings

| # | Priority | Finding | Where |
|---|---|---|---|
| 1 | **High** | Legal pages show template/placeholder text publicly. Every legal page says *"This is a product template for legal review, not legal advice."* Terms §12 says *"This section is a placeholder for counsel: limitation of liability, warranty disclaimer, and indemnity terms should be completed before large-scale commercial launch."* Terms §13 says *"These Terms are governed by Pakistan, except where a signed order states otherwise. Do not treat this as a selected jurisdiction unless that value has been configured by the operator."* | /terms, /privacy, /billing-policy, /refund-policy, /acceptable-use, /security |
| 2 | **High** | The Install doc contradicts the new offline mode: *"An internet connection is required for current business data. FieldKeel does not provide full offline job, customer, or timesheet functionality in this release."* | https://fieldkeel.com/docs/install-fieldkeel-on-phone (section "Internet connection and icons") |
| 3 | **High** | The offline marketing and docs claims are ahead of the app. Features, Home and /docs/offline-field-operations say technicians can *"record supported field updates without coverage, and sync queued changes"*. In today's app QA, opening a prepared job offline failed and saving a work update offline failed ("We couldn't reach the server"). Either fix the app first or soften the copy until it is fixed. | /features, /, /docs/offline-field-operations, /docs/my-day |
| 4 | **High** | No security headers on the website (fieldkeel.com). There is no HSTS, CSP, X-Frame-Options/frame-ancestors, X-Content-Type-Options, Referrer-Policy or Permissions-Policy. That includes **/login and /signup**, which can therefore be framed (clickjacking). The API (api.fieldkeel.com) already sends all of them, so copy that header set to the Next.js app. `x-powered-by: Next.js` is also exposed. | all pages |
| 5 | **Medium** | Payment copy contradicts itself on Pricing. *"Paid subscriptions are activated through an official FieldKeel invoice. We do not currently collect card details in the app."* The same page also says *"Pay by card through Paddle for 1–5 years upfront."* The Terms also say *"No credit card is collected in the application"* (that one is about the trial, but it reads as general). | /pricing, /terms |
| 6 | **Medium** | Renewal wording conflicts. The Billing policy says *"A card purchase creates an annual Paddle subscription that renews automatically each year"* and *"Paddle card subscriptions renew automatically each year."* Trust says *"Paddle card subscriptions renew annually."* Pricing says multi-year terms renew *"at the end of the selected term"*. | /billing-policy, /trust vs /pricing |
| 7 | **Medium** | Branding plan conflict on Pricing. The text says *"Organization logo uploads are included with Professional and Business"*, but the comparison table shows **Organization Branding: Yes** for Starter. | /pricing |
| 8 | **Medium** | The plan cards and the comparison table don't match. The Professional card lists "Safety & Job Execution", "Materials & Work Logs" and "Technician Mobile Experience" as extras over Starter, but the table doesn't list those rows. The Starter card says "Basic Reports" and omits Approvals, yet the table shows Reports and Approvals as Yes for all plans. "Technician Mobile Experience" being Professional-only also implies Starter techs don't get mobile/offline. | /pricing |
| 9 | **Medium** | Developer and internal content appears in customer docs: *"Local developers: with SMTP pointed at Mailpit (`SMTP_HOST=localhost`, `SMTP_PORT=1025`)…"*, *"OrganizationSettings.allowManualTime gates manual timesheet entry on the API… changing it requires an operator/data path"*, *"Never treat a JWT claim…"*, *"Other historical enum values may exist in the schema"*, *"Reports open at `/app/[orgSlug]/reports`"*, *"The backend refuses approve when the job is not PENDING_APPROVAL…"* | /docs/verify-work-email, /docs/forgot-password, /docs/organization-settings, /docs/time-gps, /docs/roles, /docs/approvals, /docs/reports, /docs/security-privacy |
| 10 | **Medium** | On mobile (390px) the header nav has no menu. Features, Pricing, Compare, Documentation and Trust are hidden (`display:none`) and there is no hamburger button. Only Sign in and Start trial show, so mobile visitors can reach Pricing and the other pages only from the footer. | all pages, mobile |
| 11 | Medium | The Schedule & dispatch and Jobs overview docs don't mention the new Missing access warning, the filter or the dispatch confirm (carried over from the earlier QA). | /docs/schedule-dispatch, /docs/jobs-overview |
| 12 | Low | **Paddle is named publicly** on Pricing, Billing policy, Refund policy, Trust, Terms and 8 billing docs. The refund policy links out to paddle.com/legal/refund-policy and buyer-terms. This is a note only, in case you'd rather not name the processor. PayPal is not mentioned anywhere on the site. | /pricing, /refund-policy, etc. |
| 13 | Low | /refund-policy has no "Version 1.0 · Effective 2026-09-28" line, unlike the other legal pages. | /refund-policy |
| 14 | Low | Every page calls `api.fieldkeel.com/api/auth/me` and `/auth/refresh` for logged-out visitors. Both return 401 and log 2 console errors per page ("Failed to load resource: 401"). This is harmless but noisy; skip the session probe on marketing pages or treat 401 quietly. | all marketing and doc pages |
| 15 | Low | The og:image is the same `/icons/logo.png` on all 65 pages: 1448×1086 and **496 KB**, with no 1200×630 social card. `twitter:card` is "summary". The header logo is served through `_next/image` at `w=3840` (78 KB) for a small logo. | all pages |
| 16 | Low | Meta descriptions are too long (176–276 chars, ideal ≤160) on 43 of 44 docs pages, /terms and /compare/housecall-pro. Compare titles are long (74–84 chars): /compare/jobber, /compare/housecall-pro, /compare/servicetitan. | docs, compare |
| 17 | Low | The compare pages list competitors' "offline support/viewing", but FieldKeel's own "Field app" row doesn't mention offline prep or Missing access warnings, which is a missed selling point. | /compare/* |
| 18 | Low | The docs home "Popular topics" and the article lists don't surface the two new guides. /docs/offline-field-operations is linked only from /features and /docs/my-day, and /docs/sites-access-notes only from /features and /docs/sites-overview. | /docs |
| 19 | Low | Emails use Cloudflare email obfuscation. Without JS they show "[email protected]" and link to `/cdn-cgi/l/email-protection` (404 without JS). They work in normal browsers and decode to support@fieldkeel.com. | /support, /pricing (Contact Sales), legal pages |
| 20 | Low | The home logo link has no accessible name (empty text, no aria-label). One home image (`icon.png`) has no alt. "labour" is British spelling on a US-targeted site (/docs, /docs/reports). | /, /docs/reports |
| 21 | Low | The sitemap has no `<lastmod>`; only changefreq and priority. robots.txt has a non-standard `Host:` line, which is harmless. | /sitemap.xml, /robots.txt |
| 22 | Low | Marketing pages are sent with `cache-control: private, no-cache, no-store`, so every visit is rendered dynamically. /pricing TTFB was around 1.07 s and the legal pages 0.6–1.0 s. Static generation and caching would help. | /, /pricing, legal |

---

### 1. Crawl, status codes and redirects

| Check | Result | Notes |
|---|---|---|
| sitemap.xml (60 URLs) | **Pass** | All 60 return **200**, with no redirect chains. |
| Nav links (Features, Pricing, Compare, Documentation, Trust, Sign in, Start trial) | **Pass** | All 200. |
| Footer links (16) | **Pass** | All 200. |
| /signup, /login, /forgot-password | **Pass** | 200. |
| /documentation | Pass | 307 to /docs; no loop. |
| /sign-in (guessed URL) | Note | 404. Only /login exists, which is fine. Nothing links to /sign-in. |
| Unknown URL | Pass | Returns a real 404 status. |
| www vs non-www | **Pass** | `https://www.fieldkeel.com/*` returns 301 to `https://fieldkeel.com/*`. Canonicals and og:url use non-www consistently. |
| http to https | Note | My box blocks outbound port 80, so I couldn't read the hop status. An external fetch of `http://www.fieldkeel.com/pricing` landed on the HTTPS page, so the redirect works. |
| Redirect loops | Pass | None found. |
| TLS certificate | Pass | Let's Encrypt, `*.fieldkeel.com` + `fieldkeel.com`, expires Dec 27 2026 (auto-renewal expected). |

### 2. Broken links and anchors

| Check | Result | Notes |
|---|---|---|
| Internal links (all pages) | **Pass** | There are no broken internal links. The only 404 is `/cdn-cgi/l/email-protection`, which is Cloudflare's email obfuscation and decodes to support@fieldkeel.com when JS runs (finding 19). |
| In-page anchors (#…) | **Pass** | All the docs "On this page" anchors resolve. The only anchors without a target are the 17 email-protection links. |
| External links | **Pass** | paddle.com/legal/refund-policy and paddle.com/legal/buyer-terms both return 200. No external 404s. |

### 3. Images and assets

| Check | Result | Notes |
|---|---|---|
| `<img>` sources | **Pass** | No broken images on any rendered page (naturalWidth check). |
| favicon `/icons/favicon.ico` | Pass | 200. |
| apple-touch-icon, icon-192, icon-512, maskable-192/512 | Pass | All 200. |
| manifest.webmanifest | Pass | Valid JSON, standalone, start_url /app, 4 icons. |
| CSS/JS chunks (31) | Pass | All 200, `cache-control: public, max-age=31536000, immutable`. |
| og:image | Note | Present on 65 pages, but it's the logo at 496 KB and not 1200×630 (finding 15). |

### 4. SEO basics

| Check | Result | Notes |
|---|---|---|
| Title present | **Pass** | Present on every page. |
| Title unique | **Pass** | Unique, except /docs and /documentation, which is the same page via redirect. |
| Title length | Note | The 3 compare titles are 74–84 chars. |
| Meta description | **Pass / Note** | Present everywhere. Too long on 45 pages (finding 16). /login has only 36 chars, which is fine for a noindex page. |
| One H1 per page | **Pass** | Exactly one H1 on every public page. /login's H1 "Sign in" only appears after JS; the server HTML has none, which is fine because it's noindex. |
| Canonical | **Pass** | Present and self-referencing on all 60 sitemap pages. /signup, /login and /forgot-password have no canonical (noindex). |
| og tags (title, description, image, url) | **Pass** | Present on all pages. Auth pages use og:url = homepage (minor). |
| robots meta | **Pass** | No noindex on any marketing or docs page. noindex,nofollow is only on /signup, /login and /forgot-password, which is intended. |
| robots.txt | **Pass** | `Allow: /`, disallows `/app/` and `/platform/`, and points to the Sitemap. |
| sitemap.xml validity | **Pass** | Valid XML in the sitemaps.org namespace with 60 URLs, all 200 and all canonical. It has no `lastmod` (Low). |
| Viewport meta | **Pass** | Present on all pages. |

### 5. Content consistency

| Check | Result | Notes |
|---|---|---|
| Starter $299/yr, up to 5 users | **Pass** | Same on Pricing, Docs, Billing docs, all 3 compare pages and /compare. |
| Professional $499/yr, up to 10 users | **Pass** | Same on Home, Pricing, Docs, Billing policy and Compare. |
| Business = Contact Sales | **Pass** | It's Contact Sales everywhere, also shown as "up to 100 users, 250 GB". The Contact Sales button links to support@. |
| 14-day free trial, no card | **Pass** | Same on Home, Pricing, Signup, Docs, Compare and Billing policy. |
| Multi-year discounts 5/7/10/15% for 2–5 yrs | **Pass** | On Pricing and /docs/billing-plans and /docs/paying-an-invoice. I checked the table math: all 8 totals are correct (e.g. $299×5×0.85 = $1,270.75). |
| Payment method wording | **Fail** | "We do not currently collect card details" vs "Pay by card through Paddle" (finding 5). |
| Renewal wording | **Fail** | "renews automatically each year" vs "renews at the end of the selected term" (finding 6). |
| Plan features | **Fail** | Branding on Starter, and the cards vs the table (findings 7, 8). |
| Offline mode statements | **Fail** | The Install doc says there's no offline mode (finding 2). The new offline claims run ahead of the app QA (finding 3). |
| Missing access info statements | **Pass** | Home, Features, Pricing and /docs/sites-access-notes are accurate ("a warning, not a hard dispatch block"). The Schedule and Jobs docs still need it (finding 11). |
| "Coming soon" claims | **Pass** | None for offline or access warnings. The only "not yet" items are the manual time toggle and continuous GPS tracking, which are accurate. |
| Placeholder or template text | **Fail** | It's on the legal pages (finding 1), plus dev content in the docs (finding 9). There's no lorem ipsum. |
| Typos | **Pass** | Spell check of all page text found no real typos. "labour" is British spelling (Low). |

### 6. Signup and login pages (not submitted)

| Check | Result | Notes |
|---|---|---|
| /signup renders | **Pass** | 200, H1 "Create your account". Fields: Full name, Work email, Password (autocomplete=new-password, show/hide toggle), Terms + Privacy checkbox (required), Create account. Links to /terms, /privacy and /login. |
| /signup console | **Pass** | 0 console errors. The 2 aborted `?_rsc` prefetches are normal Next.js behaviour. |
| /login renders | **Pass** | 200, H1 "Sign in". Fields: Work email, Password (current-password, show/hide), Sign in. Links: Forgot password and Create an account. |
| /login console | **Pass** | 0 errors, 0 failed requests. |
| /forgot-password | **Pass** | 200. Work email field plus Send reset link, and Back to sign in. |
| Mobile layout (390px) | **Pass** | No horizontal overflow on signup or login. |
| Clickjacking protection | **Fail** | No X-Frame-Options or CSP frame-ancestors (finding 4). |

### 7. Performance and basics

Headless Chrome, cold load, desktop:

| Page | TTFB | Load | Requests | Transferred | HTML (uncompressed) | Result |
|---|---|---|---|---|---|---|
| / | 0.53 s | 0.66 s | 58 | 450 KB | 29.6 KB (6.6 KB compressed) | Pass |
| /pricing | 1.07 s | 1.18 s | 43 | 119 KB | 93 KB | Note: slowest TTFB |
| /features | 0.25 s | 0.32 s | 62 | 79 KB | 27.7 KB | Pass |
| /docs | 0.25 s | 0.30 s | 63 | 157 KB | 52 KB | Pass |
| /privacy, /terms | 0.6–1.0 s | ~1.0 s | 42 | ~55 KB | ~30 KB | Note |
| Mobile / | 0.65 s | 0.78 s | 38 | 420 KB | | Pass |

| Check | Result | Notes |
|---|---|---|
| Overall speed | **Pass** | Every page loaded in under 1.2 s. The JS is about 870 KB decoded and shared and cached long-term. The home page weight is mostly the two logo PNGs (finding 15). |
| HTML caching | Note | `no-store` on the marketing pages (finding 22). |
| Mobile viewport meta | **Pass** | Present on all pages, with no horizontal scroll at 390px on 7 key pages. |
| Mobile nav | **Fail** | No menu button; the nav links are hidden (finding 10). |
| HTTPS | **Pass** | Valid cert, and www redirects to the apex domain. |
| Security headers (website) | **Fail** | None are set (finding 4). The API has them all. |
| JS console errors | **Note** | Only the two 401s from `/api/auth/me` and `/api/auth/refresh` per page (finding 14). There are no page errors or uncaught exceptions. |
| Lighthouse | Not run | Lighthouse isn't installed. I used Playwright timings instead. |

### 8. Legal pages

| Check | Result | Notes |
|---|---|---|
| Privacy, Terms, Billing & Subscription, Refund, Acceptable Use, Security exist | **Pass** | All return 200. |
| Linked from the footer | **Pass** | All 6 are in the footer "Legal" column on every page. Signup links Terms and Privacy. |
| Content is final | **Fail** | Template and placeholder text is visible (finding 1). |
| Version and effective date | Note | Version 1.0, effective 2026-09-28 on 5 pages. Missing on /refund-policy (finding 13). |
| Contact address | Pass | support@fieldkeel.com (obfuscated, works with JS). |

---

### Suggested fix list (paste-ready)

1. Legal pages: remove "This is a product template for legal review, not legal advice." from all pages. Finish Terms §12 (liability, warranty, indemnity) and replace the Terms §13 governing-law sentence with a final one. Add a Version and Effective line to /refund-policy.
2. /docs/install-fieldkeel-on-phone: replace "FieldKeel does not provide full offline job, customer, or timesheet functionality in this release." with a short note linking to /docs/offline-field-operations. Ship this after the offline bugs are fixed.
3. Add security headers to the Next.js site (HSTS, CSP with frame-ancestors 'self', X-Frame-Options SAMEORIGIN, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy) and set `poweredByHeader: false`.
4. Pricing: remove "We do not currently collect card details in the app" (or reword it to "Card payments are processed securely by our payment provider"). Fix the Organization Branding row for Starter. Align the plan cards with the comparison table.
5. Billing policy and Trust: change "renews automatically each year" to "renews at the end of the selected term (1–5 years)".
6. Docs: remove the Mailpit/localhost "Local developers" lines and the schema, enum, JWT, API and route wording. Add the Missing access badge, filter and dispatch confirm to the Schedule & dispatch and Jobs overview docs. Surface the Offline and Site access guides on the docs home.
7. Add a mobile hamburger menu to the header.
8. Low: add a 1200×630 og:image (under 200 KB) and use `summary_large_image`. Shorten meta descriptions to ≤160 chars. Skip the auth/me probe on public pages. Add `lastmod` to the sitemap. Add an aria-label to the logo link. Add offline prep and access warnings to the FieldKeel row on the compare pages.
