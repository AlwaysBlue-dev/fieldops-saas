# AI Workforce usage accounting

Server-authoritative ledger: `AiUsageEvent`. Clients never submit used/limit counters or final status.

## Status lifecycle

| Status | Holds monthly quota? | Meaning |
|--------|----------------------|---------|
| `PENDING` | **Yes** (while not expired) | Atomic reservation before a provider call |
| `SUCCEEDED` | **Yes** | Provider (or billable) execution completed successfully |
| `FAILED` | No | Execution failed after reservation; quota released |
| `INTERRUPTED` | No | Stopped unexpectedly, timed out, or scaffold/no-provider path; quota released |
| `SKIPPED` | No | Non-billable completion (development stub); stores `resultPayload` for idempotent retries; does not hold quota |

## Monthly limit

- Window: **UTC calendar month** (same convention as `jobsCreatedThisMonth`).
- Counted rows: `SUCCEEDED` + non-expired `PENDING` for the organization.
- Limits come from `Plan.features` (`AI_WORKFORCE`, `maxAiTasksPerMonth`) via `resolveMaxAiTasksPerMonth` — not plan-code branching in controllers.
- Defaults: Starter 0 (feature off), Professional 100, Business 500 (configurable in features JSON).

## Atomic reservation + execution ownership

`AiUsageService.beginExecution`:

1. Evaluate entitlement / feature gate.
2. Begin transaction; `SELECT … FROM "Organization" WHERE id = $org FOR UPDATE`.
3. If `(organizationId, clientRequestId)` exists for this user → **expire-then-map**: when the row is still `PENDING` but `expiresAt <= now`, ownership-safe update to `INTERRUPTED` (no provider replay), then map the refreshed row. Non-expired `PENDING` → `IN_PROGRESS`. Terminal rows map to `COMPLETED` / `FAILED` / `INTERRUPTED`. Lookup outcomes **never** return `executionToken`.
4. Expire other stale org `PENDING` leases (`expiresAt <= now` → `INTERRUPTED`).
5. Count toward-limit rows; if `used >= limit` → throw structured `PLAN_LIMIT_REACHED` / `AI_TASKS` **inside** the transaction (no audit write while `FOR UPDATE` is held). After the transaction releases the org row, `recordAiLimitBlocked` runs, then the same exception is rethrown to the client.
6. Insert `PENDING` with `executionToken` (owner secret) and `expiresAt = now + TTL`.
7. Return `START` **only** to the creator — sole caller allowed to invoke providers.

Concurrent inserts with the same `clientRequestId` hit the unique constraint; the loser resolve-maps the winner as `IN_PROGRESS` (or terminal after expire). Two callers never both receive `START` / `executionToken` for the same reservation.

### Quota audit and locking

Do **not** write `PLAN_LIMIT_BLOCKED` audit rows on a second Prisma connection while the organization row is locked. That pattern can stall on `AuditLog.organizationId` FK (`FOR KEY SHARE` vs `FOR UPDATE`). Audit after the reservation transaction ends; never weaken the in-transaction count + reject.

## HTTP authorization (AI controller)

`AiController` guard order must be:

1. `JwtAuthGuard`
2. `OrganizationMembershipGuard` (binds `request.organization`)
3. `OrganizationRolesGuard`
4. `SubscriptionAccessGuard` (`@RequiresActiveSubscription`)

Class decorators are applied bottom-up and Nest appends `UseGuards`, so `@RequiresActiveSubscription()` is declared **above** `@UseGuards(Jwt…, Membership…, Roles…)` on the controller class. Membership must run before subscription entitlement checks.

## Migrations (quota / enum)

| Migration | Role |
|-----------|------|
| `20261103140000_ai_workforce_foundation` | Tables + initial `AiUsageStatus` (`SUCCEEDED`/`FAILED`/`SKIPPED`) |
| `20261103150000_ai_usage_quota_idempotency` | Add enum values `PENDING`/`INTERRUPTED` + columns/indexes (**does not** `SET DEFAULT 'PENDING'`) |
| `20261103150500_ai_usage_pending_default` | `ALTER COLUMN status SET DEFAULT 'PENDING'` after enum commit |
| `20261103160000_ai_execution_lease` | Execution token / lease columns |
| `20261103170000_ai_tool_call_history` | `toolCalls` / `toolCallId` / `toolName` on messages |

PostgreSQL rejects using a newly added enum value in the same transaction that added it (`55P04`). Keep ADD VALUE and DEFAULT usage in separate migrations.

## Tests

Focused Vitest coverage (do not treat as full e2e):

- `ai-message-history.spec.ts` — fail-closed history + tool ordering
- `ai-tool-round.validation.spec.ts` — duplicate ids / result order
- `ai-tool.registry.spec.ts` — read-only registration only
- `gemini-schema.spec.ts` — Gemini schema keyword stripping
- `ai-usage.begin-execution.spec.ts` — entitlement, idempotent PENDING, expired → INTERRUPTED, quota audit outside lock
- `ai.session-isolation.spec.ts` — `withTenant` session/usage query contract
- `plan-features.spec.ts` — AI allowance resolution

## Heartbeat lease

- Backend-only `heartbeatReservation({ organizationId, usageEventId, executionToken })`.
- Conditional: `PENDING` + matching `executionToken`; extends `expiresAt`.
- Interval ≈ **60s**; default lease TTL **300s**; per-provider timeout default **120s**.
- Worst-case Groq → Gemini → OpenRouter waits can total **360s**; heartbeat must stay healthy
  for the full chain. If timeouts increase, review TTL and heartbeat together (do not bump
  TTL without a concrete reason).
- Terminal / wrong-token / foreign org → no-op (`false`).
- Never expose `executionToken` or heartbeat endpoints to the browser.

## Idempotency

- `clientRequestId` is a client-generated UUID, unique per `organizationId`.
- Network retries reuse the same id → `IN_PROGRESS` or stored `COMPLETED` result (`resultPayload`).
- Terminal `FAILED` / `INTERRUPTED` require a **new** `clientRequestId` for a new attempt.
- Cross-org reuse is impossible: uniqueness and lookups are org-scoped.

## Finalize / release

| API | Effect |
|-----|--------|
| `completeTurnAtomically` | Token-gated transaction: final assistant text message + `SUCCEEDED`/`SKIPPED` + `resultPayload`; rolls back message if ownership lost |
| `appendToolRoundWhilePending` | Token-gated transaction: assistant `toolCalls` row + matching `TOOL` result rows; **stays PENDING**; extends lease; rolls back if ownership lost (Step 4.3.7) |
| `completeReservation` | `PENDING` + token → `SUCCEEDED` + `resultPayload`; clears token (low-level; prefer atomic turn) |
| `noteProviderAttempt` | Stays `PENDING`; keeps token; appends attempt metadata; extends lease (eligible fallback/skip) |
| `failReservation` | `PENDING` + token → `FAILED`; clears token (chain exhausted or non-fallback failure) |
| `interruptReservation` | `PENDING` + token → `INTERRUPTED`; clears token; never success |
| `skipReservation` | `PENDING` + token → `SKIPPED` + `resultPayload`; clears token; **non-billable** (legacy helper; stub uses atomic turn) |

Late responses after expiry/interrupt cannot overwrite terminal states (status must still be `PENDING` + token).

Eligible fallback must **not** call `failReservation` while another provider remains in the chain.

## Expired PENDING recovery

- `expireStaleReservations` only touches `PENDING` with `expiresAt <= now` (abandoned leases).
- `resolveExistingReservation` (same-`clientRequestId` lookup / P2002 path) also expires that specific row before mapping so abandoned leases are never sticky `IN_PROGRESS`.
- Actively heartbeating owners keep `expiresAt` fresh and are not interrupted.
- Expired / ambiguous work becomes `INTERRUPTED` — **not** `SUCCEEDED`, and providers are **not** re-executed automatically.
- Terminal `FAILED` / `INTERRUPTED` require a **new** `clientRequestId` for a new attempt.

## Unsuccessful turn message history

- USER messages and tool-round rows are tagged with `metadata.usageEventId`.
- On `FAILED` / `INTERRUPTED`, matching rows are marked `metadata.excludeFromModelHistory=true` (rows kept for audit/UI; optimization only).
- Provider history reconstruction is **fail-closed**: for any message with `usageEventId`, a batched org-scoped `AiUsageEvent` status lookup decides eligibility. `FAILED` / `INTERRUPTED` and missing usage rows are excluded; `SUCCEEDED`, non-billable `SKIPPED`, and in-flight `PENDING` remain eligible. Final assistant rows are tagged with `usageEventId`. Legacy rows without `usageEventId` stay compatible. Incomplete tool-call groups are **skipped** without discarding later USER/ASSISTANT turns. Truncation is reported when the DB fetch was capped. Usage IDs / accounting metadata are never sent to providers.
- Same `clientRequestId` against a **different** session returns `409 Conflict` (does not replay another conversation’s result). Foreign-user reuse uses the same generic conflict message (no existence oracle).

## Soft preflight

`UsageService.assertAiTaskAvailable` remains a soft check. **Authoritative** enforcement is `beginExecution`.

## Provider failover

See `docs/ai-provider-failover.md`. Live order is Groq → Gemini → OpenRouter under one
reservation / `executionToken` / `clientRequestId` (no extra quota for fallback). Ambiguous
timeouts interrupt and stop the chain. Local idempotency is `organizationId` +
`clientRequestId`; upstream idempotency headers are best-effort only.

## Stub vs production

- Live path (Groq): `SUCCEEDED` counts once toward the monthly limit.
- Development stub (`AI_PROVIDER=stub`, non-production): replies finalize as `SKIPPED` and **must not** be recorded as `SUCCEEDED`.
- Production must configure `GROQ_API_KEY`; stub must not substitute for a real provider.
