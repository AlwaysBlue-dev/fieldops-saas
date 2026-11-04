# AI provider failover policy (FieldKeel)

This document defines how the Groq → Gemini → OpenRouter router **must** behave.
It does **not** claim exactly-once execution at external providers. Local `AiUsageEvent`
idempotency guarantees at-most-one **FieldKeel** SUCCEEDED row per `clientRequestId`, not
at-most-once upstream work under ambiguous network failures.

## Current implementation (Step 3.3)

- **Primary:** Groq (OpenAI-compatible chat completions) with a configurable Qwen model.
- **First fallback:** Google Gemini (`generateContent`).
- **Second fallback:** OpenRouter (OpenAI-compatible chat completions).
- **Stub:** development-only (`AI_PROVIDER=stub`). Finalizes as `SKIPPED` (non-billable).
  Never used as a production substitute.

Unconfigured providers (missing API keys) are **skipped** at chain resolution time. Application
startup does not require every key. If **no** live provider is configured, chat returns a clear
configuration error before reservation.

Streaming, voice, and autonomous background agents remain out of scope.
**Groq**, **Gemini**, and **OpenRouter** adapters send normalized tools and return
normalized `toolCalls`. NestJS tool registry/executor runs registered **read-only**
tools (`getJobs`, `findMissingAccess`, `getSchedule`) inside `AiService.sendMessage`
orchestration (see `docs/ai-tool-execution.md`).

## Normalized tool-calling contract (Steps 4.3.1 / 4.3.1.1)

FieldKeel uses **provider-independent** types in `api/src/ai/providers/ai-provider.types.ts`:

| Type | Purpose |
|------|---------|
| `AiJsonObject` / `AiJsonValue` | Structured JSON object vs nested JSON values |
| `AiToolDefinition` | `{ name, description, parameters }` — JSON Schema object; no vendor wrappers |
| `AiToolCall` | `{ id, name, arguments: AiJsonObject }` — parsed object args only (never `eval`) |
| `AiToolChoice` | `'auto' \| 'none' \| { name }` |
| `AiGenerateTextRequest.tools` / `.toolChoice` | Optional; omit for text-only (current behavior) |
| `AiFinishReason` | Closed set: `stop` \| `tool_calls` \| `length` \| `content_filter` |
| `AiGenerateTextResult.finishReason` / `.rawFinishReason` | Normalized reason vs unmapped vendor string |
| `AiGenerateTextResult.toolCalls` | Optional normalized tool-call requests (not execution) |
| `AiChatMessageInput` | Discriminated by `role`: user/system text; assistant (+ optional `toolCalls`); tool results **require** `toolCallId` |

Use `normalizeAiFinishReason()` in adapters to populate `finishReason` / `rawFinishReason`.

### Groq tool-call mapping (Step 4.3.2.1)

`GroqAiProvider` maps the normalized contract to OpenAI-compatible Chat Completions:

| FieldKeel | Groq request |
|-----------|--------------|
| `AiToolDefinition` | `tools[].{ type: "function", function: { name, description, parameters } }` |
| `toolChoice: 'auto' \| 'none'` | `tool_choice: "auto" \| "none"` |
| `toolChoice: { name }` | `tool_choice: { type: "function", function: { name } }` |
| Assistant `toolCalls` | `messages[].tool_calls` with `function.arguments` as a JSON **string** |
| Tool result (`role: 'tool'`) | `role: "tool"`, `tool_call_id`, `content` |

| Groq response | FieldKeel |
|---------------|-----------|
| `message.content` (string or null) | `content` (empty string when null / tool-only) |
| `message.tool_calls[]` | `toolCalls[]` as `AiToolCall` |
| `finish_reason` | `normalizeAiFinishReason` → `finishReason` / `rawFinishReason` |

**Argument validation:** `function.arguments` must be a JSON string that `JSON.parse`s to a
**plain object** (not array/primitive). Malformed JSON, non-object roots, missing `id` /
function `name`, or non-array `tool_calls` → `INVALID_RESPONSE` (no fallback). Text-only
responses (no tools on the request) still require non-empty assistant content. Tool-call-only
responses may have empty content when at least one valid tool call is present.

Tools on the request are omitted when `tools` is empty/undefined → existing text-only path.
The adapter **never** executes tools.

### OpenRouter tool-call mapping (Step 4.3.2.2)

`OpenRouterAiProvider` uses the same OpenAI-compatible Chat Completions tool shapes as Groq:

| FieldKeel | OpenRouter request |
|-----------|--------------------|
| `AiToolDefinition` | `tools[].{ type: "function", function: { name, description, parameters } }` |
| `toolChoice: 'auto' \| 'none'` | `tool_choice: "auto" \| "none"` |
| `toolChoice: { name }` | `tool_choice: { type: "function", function: { name } }` |
| Assistant `toolCalls` | `messages[].tool_calls` with `function.arguments` as a JSON **string** |
| Tool result (`role: 'tool'`) | `role: "tool"`, `tool_call_id`, `content` |

| OpenRouter response | FieldKeel |
|---------------------|-----------|
| `message.content` (string or null) | `content` (empty string when null / tool-only) |
| `message.tool_calls[]` | `toolCalls[]` as `AiToolCall` |
| `finish_reason` | `normalizeAiFinishReason` → `finishReason` / `rawFinishReason` |

**Argument validation:** identical to Groq — `function.arguments` must be a JSON string that
parses to a **plain object**. Malformed JSON, non-object roots, missing `id` / function
`name`, or non-array `tool_calls` → `INVALID_RESPONSE` (no fallback). Tool-only responses
may have empty content when at least one valid tool call exists.

**OpenRouter-specific:** optional `HTTP-Referer` / `X-Title` headers from
`OPENROUTER_SITE_URL` / `OPENROUTER_APP_NAME` are unchanged. Upstream model capability
varies by the configured OpenRouter model; FieldKeel still sends OpenAI-style tools and
normalizes responses the same way. The adapter **never** executes tools.

### Gemini function-calling mapping (Step 4.3.2.3)

`GeminiAiProvider` uses Google `generateContent` function calling (not OpenAI `tools`):

| FieldKeel | Gemini request |
|-----------|----------------|
| `AiToolDefinition` | `tools[{ functionDeclarations: [{ name, description, parameters }] }]` |
| `parameters` | Passed through `sanitizeSchemaForGemini` — strips JSON Schema keywords Gemini rejects (notably `additionalProperties`, `$schema`, `patternProperties`, `unevaluatedProperties`). Backend validators still enforce the full schemas. Groq/OpenRouter keep unsanitized definitions. |
| `toolChoice: 'auto'` / omitted | `toolConfig.functionCallingConfig.mode = AUTO` |
| `toolChoice: 'none'` | `mode = NONE` |
| `toolChoice: { name }` | `mode = ANY`, `allowedFunctionNames: [name]` |
| Assistant text + `toolCalls` | `role: "model"` parts: `text` and/or `functionCall{ name, args, id? }` |
| Tool result (`role: 'tool'`) | `role: "user"` part `functionResponse{ name, response }` |

**History:** Tool turns are **not** discarded. Function name is resolved from prior assistant
`toolCalls` via `toolCallId` (fallback: `message.name`). Unresolvable names → pre-transmit
`INVALID_RESPONSE`. Tool `content` is parsed as JSON object when possible; otherwise wrapped
as `{ result: "<text>" }` for Gemini Struct compatibility. Gemini has no OpenAI-style
`tool` role — results are always user `functionResponse` parts.

| Gemini response | FieldKeel |
|-----------------|-----------|
| `parts[].text` | concatenated `content` |
| `parts[].functionCall` | `toolCalls[]` as `AiToolCall` |
| `finishReason` | `normalizeAiFinishReason`; if any function calls, prefer `tool_calls` (Gemini often returns `STOP`) |

**ID strategy:** Prefer vendor `functionCall.id` when present. Otherwise synthesize a
deterministic per-candidate id: `gemini-fc-{index}-{safeName}` (index among functionCall
parts in that candidate). Collision-safe within one response; not a global UUID.

**Argument validation:** `functionCall.args` must already be a plain JSON object (Gemini
Struct). Arrays, primitives, null, or missing args → `INVALID_RESPONSE` (no fallback).
No `eval`. Tool-only responses may have empty text when ≥1 valid function call exists.

Empty/undefined `tools` on the request → existing text-only path (no `tools` / `toolConfig`).
The adapter **never** executes functions.

### Provider tool-call requests vs backend tool execution

1. The **model** may return normalized `toolCalls` (a *request* to use a capability).
2. That is **not** tool execution. NestJS backend services alone validate arguments,
   enforce tenant/user authorization, and run read-only (or future approved) handlers.
3. Adapters **normalize** vendor-specific shapes (OpenAI `tool_calls`, Gemini
   `functionCall`, etc.) into `AiToolCall` / `AiToolDefinition` inside the adapter.
   The router and `AiService` must not import provider-specific tool DTOs.
4. Providers never receive database credentials, Prisma clients, JWTs, cookies,
   other providers’ API keys, or FieldKeel `executionToken`s.
5. Tool arguments are **untrusted input**. Future execution must validate every
   argument on the backend and must not trust the model for permissions.

### Metering / lease (future multi-step loops)

When orchestration later runs tools, **all model steps and tool invocations for one
user instruction remain under the same `AiUsageEvent` reservation** (`clientRequestId`,
`executionToken`, heartbeat). Tool calls must not create separate AI task reservations
or extra quota consumption. Mid-tool-loop failover policy is **not** defined in this
step; current failover remains single-shot text generation (Groq → Gemini → OpenRouter).

## Execution sequence

```
beginExecution          (one reservation, one executionToken, one clientRequestId)
→ heartbeat (~60s; lease TTL 300s) — single loop for the whole chain
→ Groq attempt
→ eligible rejection / config skip → noteProviderAttempt (stay PENDING)
→ Gemini attempt
→ eligible rejection / config skip → noteProviderAttempt (stay PENDING)
→ OpenRouter attempt
→ atomic success (completeTurnAtomically) OR final FAILED / INTERRUPTED
```

All attempts share: organization, user, session, `clientRequestId`, reservation, and
`executionToken`. Fallbacks do **not** create a new AI task or consume extra quota.

Only `beginExecution` kind `START` may run the chain. `IN_PROGRESS` / terminal retries never
call providers again. Never retry an earlier provider within the same execution after leaving it.

## Provider order and configuration

| Order | Provider | Enable when | Env |
|------:|----------|-------------|-----|
| 1 | Groq | `GROQ_API_KEY` set | `GROQ_MODEL`, `GROQ_TIMEOUT_MS` (default 120000) |
| 2 | Gemini | `GEMINI_API_KEY` set | `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS` (default 120000) |
| 3 | OpenRouter | `OPENROUTER_API_KEY` set | `OPENROUTER_MODEL`, `OPENROUTER_TIMEOUT_MS` (default 120000); optional `OPENROUTER_SITE_URL`, `OPENROUTER_APP_NAME` |
| — | Stub | `AI_PROVIDER=stub` and non-production | — |

Defaults (free-tier oriented; override in env; confirm against vendor catalogs):

- Groq model: `qwen/qwen3.8-27b`
- Gemini model: `gemini-3.5-flash-lite` (prefer over `gemini-2.5-flash` for new API keys)
- OpenRouter model: `qwen/qwen3.8-27b:free` (tool-capable free variant)

Endpoints:

- Groq: `https://api.groq.com/openai/v1/chat/completions`
- Gemini: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
  (API key via `x-goog-api-key` header)
- OpenRouter: `https://openrouter.ai/api/v1/chat/completions`
  (optional `HTTP-Referer` / `X-Title` when site URL / app name env vars are set)

`AI_PROVIDER` selects stub vs live mode; live failover order remains Groq → Gemini → OpenRouter
when keys exist. Only later providers configured → chain starts at the first configured one.

## Heartbeat and timeouts

- Provider timeout default: **120 seconds** per provider (`GROQ_TIMEOUT_MS`,
  `GEMINI_TIMEOUT_MS`, `OPENROUTER_TIMEOUT_MS`).
- Heartbeat interval: approximately **60 seconds** (`AI_EXECUTION_HEARTBEAT_INTERVAL_MS`).
- Reservation TTL: currently **300 seconds** (`AI_TASK_RESERVATION_TTL_SECONDS`).
  Do not raise TTL casually; change only with a specific technical reason.
- Three sequential providers can consume up to **360 seconds** of provider wait time
  (3 × 120s) in the worst case. That exceeds the initial 300s lease, so **heartbeat must
  remain healthy throughout the chain** to extend `expiresAt` while attempts run.
- Heartbeat **continues between providers**; it is not stopped/restarted on fallback.
- If provider timeouts increase, review **reservation TTL and heartbeat together** before
  deploying. A timeout near/above the TTL without a shorter heartbeat risks false
  `INTERRUPTED` recovery while work is still running.

## Error classification

| `failureClass` | Fallback / skip? | Local outcome when chain ends |
|----------------|------------------|-------------------------------|
| `DEFINITIVE_REJECTION` (e.g. 429) | **Yes** (continue if next configured) | `FAILED` if exhausted |
| `PRE_TRANSMISSION_FAILURE` | **Yes** | `FAILED` if exhausted |
| `INVALID_CONFIGURATION` | **Skip** provider; try next; admin warn if none succeed | `FAILED` |
| `INVALID_RESPONSE` | **No** | `FAILED` (chain stops) — includes non-JSON HTTP 200 and empty content |
| `AMBIGUOUS_OUTCOME` | **No** | `INTERRUPTED` (chain stops; no earlier-provider retry) |

Orchestration handles `INVALID_RESPONSE` / `invalid_response` **before** generic ambiguous
certainty so a malformed HTTP 200 cannot become `INTERRUPTED`.

Never fallback after timeout/abort after possible transmission, lost response, ambiguous 5xx,
or malformed success bodies (`INVALID_RESPONSE` → `FAILED` only).

Client responses use stable user-facing messages. Logs / `noteProviderAttempt` metadata may
include provider, model, attempt number, failure class, and HTTP status — never API keys,
auth headers, full prompts, credentials, or execution tokens. Token usage is recorded on
successful completion when the vendor returns it.

## Allowed automatic fallback (same reservation)

| Condition | Action |
|-----------|--------|
| Explicit HTTP 429 | Continue to next provider |
| Connection/DNS failure before transmission | Continue to next provider |
| Auth/config rejection (401/403 / missing key) | Skip provider; continue if another configured |
| Clear non-accept reject where policy marks eligible | Continue |

Keep `PENDING` + `executionToken`. Call `noteProviderAttempt`. Do **not** create a new
`clientRequestId`.

## Forbidden automatic fallback

| Condition | Action |
|-----------|--------|
| Timeout / abort after `fetch` started | `interruptReservation`; stop chain |
| Ambiguous HTTP 5xx / lost response | `interruptReservation`; stop chain |
| `INVALID_RESPONSE` | `failReservation`; stop chain |
| Success | Finalize once via `completeTurnAtomically` |

## Post-tool generation failover (Step 4.9)

After the first successful provider response, FieldKeel **locks** that provider for
tool rounds. Tool handlers run only in NestJS; results are persisted under the same
`AiUsageEvent` reservation **before** the next generation call.

When the **follow-up generation** (after tools were persisted) fails:

| Condition | Action |
|-----------|--------|
| HTTP 429 / definitive rejection / pre-transmission / invalid config (`fallbackEligible`, certainty `rejected` \| `not_transmitted` \| `invalid_configuration`) | May try **later** providers only (never earlier). Rebuild transcript from DB. **Do not** re-execute tools. Same reservation / `clientRequestId`. |
| Ambiguous timeout / lost response / `INVALID_RESPONSE` | **No** failover. Terminalize as INTERRUPTED or FAILED with partial-completion user copy. |
| No later provider configured | Terminalize; do not invent a new task. |

HTTP `Retry-After` is parsed and logged when present. FieldKeel does **not** sleep and
retry the same provider automatically (avoids duplicate upstream work).

## Idempotency (local vs upstream)

- **`organizationId` + `clientRequestId`**: FieldKeel-local idempotency and quota identity.
- Groq / OpenRouter may receive `Idempotency-Key` as a **best-effort** hint only — not
  guaranteed upstream exactly-once. Vendors may ignore or interpret it differently.
- Gemini requests do not rely on an idempotency header for FieldKeel correctness.
- Never claim exactly-once across external providers.

## Atomic success persistence

`completeTurnAtomically` verifies `PENDING` + `executionToken`, inserts the assistant message,
writes `resultPayload`, and marks `SUCCEEDED` (or `SKIPPED` for stub) in one transaction.
Ownership loss rolls back so no orphan assistant message is committed. Late responses cannot
overwrite terminal rows.
