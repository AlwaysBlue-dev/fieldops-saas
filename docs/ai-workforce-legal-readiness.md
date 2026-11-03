# AI Workforce — Legal readiness (product-owner decisions)

**Status:** Decision document only. Legal policy pages were **not** edited in Step 4.7.1.  
**Source:** Step 4.7 public launch readiness audit + current Privacy/Security/Trust/Terms/Acceptable Use source and version constants.  
**Audience:** Product owner and counsel.

## Current version constants (source)

From `api/src/common/constants.ts` (overridable via env in `LegalService`):

| Constant | Current value |
|----------|---------------|
| `TERMS_VERSION` | `2026-09-23` |
| `PRIVACY_VERSION` | `2026-09-23` |
| `BILLING_POLICY_VERSION` | `2026-09-23` |
| `LEGAL_EFFECTIVE_DATE` | `2026-09-23` |

Web fallback in `web/src/lib/trust.ts` still shows `1.0` / `2026-09-28` when `/trust` is unavailable — confirm which surface customers see in each environment.

## What already shipped in product copy (not a legal version bump)

Customer-facing **Privacy** and **Security** pages already include AI Workforce sections describing:

- Organization membership / role / job-visibility scope
- Read-only MVP (no assign / reschedule / status / customer messaging / autonomous dispatch)
- User review of AI answers
- Possible use of configured third-party AI providers and fallback
- Explicit refusal to invent provider retention, training-use, or certification claims

**Trust** links to AI Workforce documentation. **Terms** and **Acceptable Use** do **not** currently mention AI.

---

## 1. Which policies need version / effective-date changes?

| Policy | Recommendation | Decision needed |
|--------|-----------------|-----------------|
| **Privacy Policy** | **Yes — bump version and effective date** before treating the AI sections as the governing published policy, if counsel agrees the added AI processing language is a material update. | Confirm bump wording with counsel; set new `PRIVACY_VERSION` / `LEGAL_EFFECTIVE_DATE` (or privacy-specific date) in constants/env. |
| **Security** | Security is product/practice copy versioned via trust payload similarly to terms in the UI. Decide whether Security is a versioned legal document or product disclosure; if versioned, bump when AI section is considered authoritative. | Classify Security as legal vs product; bump if legal. |
| **Terms of Service** | **Likely yes**, if AI features process customer operational data via third parties — Terms should at least incorporate Privacy by reference for AI processing (already does Privacy generally) and optionally call out AI assistant use / customer responsibility for reviewing outputs. | Counsel: add AI subsection or rely on Privacy + Permitted use? |
| **Acceptable Use** | **Likely yes** — consider prohibitions on abusing AI Workforce (e.g. attempts to extract other tenants’ data, prompt-injection style abuse, automated scraping via AI beyond entitled use). | Counsel: minimal AI abuse bullets vs leave under general misuse. |
| **Billing / Refund** | **No change required** for AI content alone unless commercial AI overage/packaging is sold (today: no invented overage charges in docs). | Only if new AI commercial terms. |
| **Trust Center** | Not a contract; no version constant. Keep aligned with Privacy/Security after legal edits. | N/A |

---

## 2. AI-related terms that may need to be added

Candidates for counsel (do **not** invent final language here):

1. **Customer responsibility** — AI answers are assistive; customer reviews before operational decisions (already in Privacy/Security; may belong in Terms).
2. **Third-party AI processors** — FieldKeel may transmit conversation content and authorized operational lookup results to configured AI providers to generate answers.
3. **Scope limits** — AI does not grant rights beyond membership/role; no cross-organization access.
4. **No warranty of AI accuracy** — standard AI disclaimer if counsel requires.
5. **Acceptable Use** — misuse of AI to probe tenancy, evade quotas, or generate harmful content.
6. **International transfer / hosting** — only if counsel wants AI providers called out beyond existing US hosting language.

Do **not** publish provider retention, model-training, or “we do not train on your data” statements until provider documentation and commercial configuration are confirmed (see §4).

---

## 3. Public subprocessor list or DPA?

| Item | Finding | Decision needed |
|------|---------|-----------------|
| **Public subprocessor list** | Not present on Trust/Privacy/Security. AI providers are described generically (“configured AI providers”). | Decide whether B2B launch requires a named public list (hosting, email, payments/Paddle, object storage, AI providers). |
| **DPA** | No public DPA route or download found in marketing/legal pages audited. | Decide whether enterprise/Business sales require a DPA; if yes, own drafting with counsel — do not invent one in product copy. |
| **Paddle / hosting** | Payment and US hosting already mentioned in places; AI providers are the new gap for naming. | Align payment/hosting naming with any new subprocessor list. |

**Recommendation for product owner:** Treat **named AI subprocessors + DPA availability** as a **commercial/legal launch gate for production**, not as a blocker for internal staging smoke of product UI — unless counsel says otherwise for your jurisdiction/customers.

---

## 4. Provider documentation required before retention / model-training claims

Before any public claim such as retention periods, “not used for training,” encryption-at-rest at the provider, or certifications:

| Need | Why |
|------|-----|
| Confirmed list of AI providers enabled in each environment (staging vs production) | Product can use multiple providers with failover; claims must match config. |
| Each provider’s current customer DPA / data processing terms | Retention and training use are provider-controlled. |
| Whether FieldKeel’s accounts are under zero-retention / no-training options | Cannot assert without commercial/provider confirmation. |
| Region / transfer terms for those providers | Privacy currently states FieldKeel app/DB hosting in the US; AI provider regions may differ. |
| Incident / subprocessors update process | If publishing a list, define how updates are announced. |

**Until then:** Keep the current honest stance (providers may process conversation + retrieved operational results; no invented retention/training guarantees).

---

## 5. Commercial / counsel decisions checklist

- [ ] Approve Privacy version bump (and effective date) for AI processing disclosures already in source.
- [ ] Decide Terms AI subsection vs Privacy-only incorporation.
- [ ] Decide Acceptable Use AI misuse bullets.
- [ ] Decide public subprocessor list (yes/no/timing) and whether AI vendors are named.
- [ ] Decide DPA offering for Business/enterprise.
- [ ] Confirm production AI provider set and obtain provider docs before stronger privacy claims.
- [ ] Align `web` trust fallback versions with API constants if customers can hit fallback.
- [ ] Confirm no AI overage billing language is needed (product currently blocks at allowance).

---

## Explicit non-actions (Step 4.7.1)

- Legal policy page content was **not** rewritten in this task.
- Version constants were **not** changed.
- No provider retention, training, certification, or DPA text was invented.
- Pricing, entitlements, and AI backend behavior were not changed.
