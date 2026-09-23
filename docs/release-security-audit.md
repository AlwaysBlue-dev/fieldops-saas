# FieldOps Cloud — Release Security Audit

**Date:** 2026-09-23 (hardening pass)  
**Scope:** Backend controllers/services, tenant isolation, authn/authz, subscriptions, files, timesheets, jobs, reports, input validation, secrets  
**Assumption:** Multiple unrelated paying businesses will share one deployment  
**Verdict:** **Code ready for STAGING UAT** — not production-ready until `docs/release-uat.md` is signed off. **BLOCKER: 0 · HIGH: 0 · OPEN MEDIUM: 0**

---

## Executive summary

Tenant isolation is enforced server-side via `OrganizationMembershipGuard` + `{ id, organizationId }` queries. Platform routes require `SUPER_ADMIN`. Session tokens stay in HTTP-only cookies. This hardening pass closed remaining MEDIUM code findings (conditional status CAS, dead tenant helpers) and accepted M3 (presigned GET) with documented controls. Rich-text XSS remains a **FUTURE** rule only (no current unsafe rendering).

---

## Finding status

### BLOCKER

_None._ **OPEN: 0**

### HIGH

| ID | Status | Notes |
| --- | --- | --- |
| H1–H4 | **FIXED** (prior pass) | Approve/return CAS, refresh CAS, logout sid revoke, file visibility |

**OPEN HIGH: 0**

### MEDIUM

| ID | Finding | Status |
| --- | --- | --- |
| M1 | Unconditional `applyStatus` / cancel (and sibling transitions) | **FIXED** — CAS `updateMany` with expected `fromStatus`; conflict if count ≠ 1. Also submit, schedule DRAFT→SCHEDULED, clock DISPATCHED→IN_PROGRESS |
| M2 | Dead `TenantResourcesService` | **FIXED** — file deleted; removed from `OrganizationsModule` |
| M3 | Presigned GET URLs are capability tokens after issuance | **ACCEPTED WITH CONTROLS** — see below |
| M4 | (prior) Technician file visibility for visible jobs | **ACCEPTED** — product scope via `jobVisibilityWhere` |
| M5 | User text as JSON / future rich HTML | **FUTURE RISK** — documented; no current `dangerouslySetInnerHTML` |

**OPEN MEDIUM: 0** · **ACCEPTED: M3, M4** · **FUTURE: M5**

### LOW

| ID | Status |
| --- | --- |
| L1–L3 | Unchanged (test throttle skip, swagger in dev, seed passwords) |

---

## M3 — Presigned GET (accepted with controls)

Accepted architectural property after verifying:

1. Bucket remains private (no public-read ACL in app code; GET via stream or short presign only)  
2. Organization membership + job visibility checked **before** `presignGet`  
3. Object key must `belongsToOrganization`  
4. TTL from `S3_PRESIGNED_GET_EXPIRY_SECONDS` (default **300** seconds; clamped 30–3600)  
5. `StorageService` exposes **GET-only** presign; no PUT/DELETE presign helpers  
6. Signed URLs are not stored on `JobFile` rows; `objectKey` not returned in DTOs  
7. Signed URLs are not written to audit metadata or app logs  
8. Production must use HTTPS endpoints for S3/MinIO and `COOKIE_SECURE=true`  

Residual risk: anyone holding an unexpired URL can GET the object until TTL elapses. Mitigated by short TTL + private bucket + auth-before-issue.

---

## M5 — Rich-text XSS (future)

Confirmed: no `dangerouslySetInnerHTML`, rehype/remark, or HTML sanitizer usage in `web/`. Tenant notes/reasons are JSON text.

**Rule** (also in `.cursor/rules/project-rules.mdc`): any future rich HTML/Markdown rendering of user content must use an approved sanitizer; never raw HTML.

---

## Concurrency

Job transitions use expected-status CAS. Automated suite: `api/test/job-concurrency.e2e-spec.ts` (cancel/cancel, cancel/dispatch, submit/cancel, return/approve, stale dispatch).

---

## E2E parallel timeouts (root cause)

**Root cause:** Each e2e file bootstraps a full Nest app against **one shared Postgres**. Unbounded file parallelism + `testTimeout: 20_000` caused Nest boot + DB lock contention to exceed the budget for heavy suites (`approvals` job-flow, `platform-admin` dashboard). Failures were **timeouts**, not assertion errors (same tests passed alone).

**Fix:** Cap `maxWorkers` (≤4), raise suite `testTimeout`/`hookTimeout` modestly, and give the two heavy tests an explicit `90_000` ms budget. Documented in `vitest.config.e2e.ts`.

---

## Secrets

- Tracked: `api/.env.example` only (placeholders, including `S3_PRESIGNED_GET_EXPIRY_SECONDS=`)  
- `api/.env`, `web/.env.local` gitignored — not tracked  
- No production JWT/MinIO/SMTP values committed  

---

## Verification (hardening pass)

| Command | Result |
| --- | --- |
| `prisma validate` | Pass |
| API unit (`npm test`) | **87/87** pass |
| API e2e run 1 | **23 files / 130 tests** pass (~237s) |
| API e2e run 2 | **23 files / 130 tests** pass (~234s) |
| API e2e run 3 | **23 files / 130 tests** pass (~235s) |
| API build | Pass |
| Web lint | Pass |
| Web production build | Pass |

### Security suites (batched)

| Suite | Result |
| --- | --- |
| `tenant-isolation.e2e-spec.ts` | Pass |
| `release-security.e2e-spec.ts` | Pass |
| `object-storage.e2e-spec.ts` | Pass |
| `reports.e2e-spec.ts` | Pass |
| `platform-admin.e2e-spec.ts` | Pass |
| `subscription.e2e-spec.ts` | Pass |
| `job-concurrency.e2e-spec.ts` | Pass |
| **Batch total** | **7 files / 50 tests** pass (~89s) |

### Final counts

| Severity | OPEN | FIXED | ACCEPTED | FUTURE |
| --- | --- | --- | --- | --- |
| BLOCKER | **0** | — | — | — |
| HIGH | **0** | H1–H4 | — | — |
| MEDIUM | **0** | M1, M2 | M3, M4 | M5 |
| LOW | L1–L3 (unchanged) | — | — | — |

---

## Production blockers (unchanged for go-live)

1. Complete staging UAT in `docs/release-uat.md`  
2. Rotate production secrets; never reuse seed passwords  
3. Confirm `COOKIE_SECURE=true`, CORS allow-list, private bucket, HTTPS object endpoint  
