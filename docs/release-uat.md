# FieldOps Cloud — Release UAT Checklist

Use two seeded (or staging) organizations: **Org A** and **Org B**, with users in every org role. Prefer direct HTTP (curl/Postman/Insomnia) with cookie jars; do not trust UI-only navigation.

Mark each row: Pass / Fail / N/A. Any Fail on isolation or auth is a **release block**.

---

## 0. Setup

- [ ] Org A and Org B ACTIVE with distinct memberships (no shared users unless intentional multi-org user)
- [ ] Roles present in each org: OWNER, ADMIN, OPERATIONS_MANAGER, SUPERVISOR, TECHNICIAN
- [ ] One platform SUPER_ADMIN account (no tenant membership required for platform routes)
- [ ] Subscription states prepared: TRIALING, GRACE/ACTIVE, TRIAL_EXPIRED or SUSPENDED, CANCELLED (as applicable)
- [ ] Object storage configured (or API stream fallback documented)

---

## 1. Tenant isolation (Org A actor × Org B resource)

For each resource, try **own-org URL + B id** and **B-org URL + B id** as Org A member.

| Resource | GET | POST | PATCH | DELETE/action | Result |
| --- | --- | --- | --- | --- | --- |
| Organizations / settings | | | | | |
| Members | | | | | |
| Invitations | | | | | |
| Teams | | | | | |
| Clients | | | | | |
| Sites | | | | | |
| Jobs | | | | | |
| Job assignments | | | | | |
| Safety controls | | | | | |
| Work logs | | | | | |
| Materials | | | | | |
| Files (metadata + content) | | | | | |
| Signatures | | | | | |
| Clock sessions | | | | | |
| Timesheets | | | | | |
| Overtime | | | | | |
| Approvals | | | | | |
| Notifications | | | | | |
| Reports (summary, CSV, PDF) | | | | | |
| Subscription / usage | | | | | |

**Pass criteria:** 404 (or 403 only for in-org forbidden), never B payload fields.

---

## 2. Authentication

| Case | Steps | Expected |
| --- | --- | --- |
| Cookie flags | Inspect Set-Cookie after login | HttpOnly; Secure in prod; SameSite per env |
| Refresh rotation | Login → refresh → reuse old refresh | Second refresh 401; family revoked if reuse detected |
| Logout | Login → logout → `/auth/me` and refresh | 401; session `revokedAt` set |
| Access-only logout | Logout with access cookie present | Session revoked |
| Inactive user | Set user INACTIVE → login | 403 Account inactive |
| Expired access | Wait/expire access → call API → refresh | Refresh issues new cookies |
| Hash leakage | Login/signup/me JSON | No `passwordHash`, no JWT in body |
| Rate limit | Burst login failures (non-test env) | 429 |

---

## 3. Authorization by role

For each role, attempt: invite member, change role to OWNER, approve job, approve own timesheet, edit another team’s job, open platform dashboard.

| Role | Escalate to OWNER | Approve job | Self-approve | Cross-team job | `/api/platform/*` |
| --- | --- | --- | --- | --- | --- |
| OWNER | N/A / last-owner rules | Allow* | Deny | Allow | Deny |
| ADMIN | Allow* | Allow* | Deny | Allow | Deny |
| OPERATIONS_MANAGER | Deny | Allow* | Deny | Allow | Deny |
| SUPERVISOR | Deny | Scoped | Deny | Team-scoped | Deny |
| TECHNICIAN | Deny | Deny | Deny | Assigned only | Deny |

\*Subject to subscription gate and workflow rules.

---

## 4. SUPER_ADMIN

| Case | Expected |
| --- | --- |
| Tenant OWNER → `GET /api/platform/dashboard` | 403 |
| TECHNICIAN → platform activate | 403 |
| SUPER_ADMIN → platform list/activate | 200 / allowed |
| SUPER_ADMIN without membership → tenant job GET | 404 |

---

## 5. Subscription gates

Attempt create job / upload file / invite under each status:

| Status | Mutations |
| --- | --- |
| TRIALING | Allow within trial policy |
| GRACE / ACTIVE | Allow |
| TRIAL_EXPIRED | Block mutations (read may remain) |
| SUSPENDED | Block |
| CANCELLED | Block |

Confirm error body is authoritative (not UI-only).

---

## 6. Files

| Case | Expected |
| --- | --- |
| Upload wrong MIME / oversized | 400 |
| Object key path traversal in metadata | Rejected / 404 |
| Presign for Org B file as Org A | 404 |
| Download content without job visibility | 404 |
| Delete after completion lock | Forbidden per evidence rules |

---

## 7. Timesheets / clock

| Case | Expected |
| --- | --- |
| Double clock-in | 409 |
| Double clock-out | 409 |
| Client-supplied future/past abuse | Server clock / validation wins |
| Overlapping manual entries | Rejected |
| Concurrent timesheet approve | One wins; other 400 |

---

## 8. Jobs workflow

| Case | Expected |
| --- | --- |
| `PATCH` job with `{ status: COMPLETED }` | 400 whitelist |
| Illegal transition (e.g. DRAFT → COMPLETED) | 400 |
| Double complete | 409 or 400 |
| Self-approval by assignee | 403 |

---

## 9. Reports

| Case | Expected |
| --- | --- |
| Summary counts | Org-scoped only |
| CSV exports | No foreign job numbers/names |
| PDF for foreign job id | 404 |

---

## 10. Sign-off

| Role | Name | Date | Result |
| --- | --- | --- | --- |
| Engineering | | | |
| Security review | | | |
| Product owner | | | |

**Release decision:** Ready / Not ready  

**Open exceptions:** (list MEDIUM IDs from `docs/release-security-audit.md`)
