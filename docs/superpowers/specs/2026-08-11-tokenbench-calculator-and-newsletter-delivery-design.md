# TokenBench Calculator and Newsletter Delivery

**Date:** 2026-08-11  
**Status:** Approved design, pending written-spec review  
**Release:** 2 of 4

## Outcome

The Subscribe vs API page provides a useful token-equivalent cost result for every plan with valid pricing, even when the provider does not publish a comparable capacity allowance. A separate evidence result answers whether the plan can cover the workload.

New subscribers who complete double opt-in receive an immediate welcome email linking to a valid, deliberately blank test PDF. Automated production cheatsheet generation remains a later project.

## Reference interaction

The primary workflow follows the useful structure of [Flavio Copes' AI subscription vs API calculator](https://flaviocopes.com/tools/ai-subscription-vs-api/): select a plan, describe message-level usage, compare its subscription price with mapped API pricing, and show a same-workload comparison table.

TokenBench adds stricter source and entitlement handling. A token-equivalent calculation does not claim that a chat subscription literally meters or guarantees those tokens.

## Calculator inputs

The primary form contains:

- subscription plan;
- conversations per day;
- messages per conversation;
- average input tokens per message;
- average output tokens per message;
- active days per month.

Each input has a visible label, constraints, example guidance, and keyboard-friendly numeric control. Values must be finite and non-negative. Conversations, messages, and days use whole numbers; token averages may be whole numbers. Zero usage is valid and produces a zero API-equivalent cost with no finite breakeven.

The selected plan supplies a documented default comparable API model. An Advanced section allows an explicit alternative model or a complete weighted model mix. Defaults and overrides are visible in the share state and results; TokenBench never hides which API prices power the estimate.

## Derived workload and formulas

For:

- `C` conversations per day;
- `M` messages per conversation;
- `D` active days per month;
- `I` average input tokens per message;
- `O` average output tokens per message;

derive:

```text
monthlyMessages = C × M × D
monthlyInputTokens = monthlyMessages × I
monthlyOutputTokens = monthlyMessages × O
```

For a comparable model or complete weighted mix with per-million input rate `Ri` and output rate `Ro`:

```text
apiEquivalentCost = monthlyInputTokens / 1,000,000 × Ri
                  + monthlyOutputTokens / 1,000,000 × Ro
```

The base calculation does not assume cached input, batch discounts, or provider routing discounts. Advanced assumptions may be added only when explicitly selected and disclosed.

For subscription monthly fee `S` and API-equivalent cost `A`:

```text
subscriptionDifference = A - S
subscriptionEfficiencyPercent = A > 0 ? (A - S) / A × 100 : unavailable
apiCostPerMessage = monthlyMessages > 0 ? A / monthlyMessages : unavailable
breakEvenMessagesPerDay = apiCostPerMessage > 0 ? S / apiCostPerMessage / D : unavailable
```

When `D` is zero, breakeven messages per day is unavailable. Signed efficiency is allowed: positive favors the subscription; negative favors API billing. The UI explains the sign rather than presenting a context-free percentage.

Currency calculations use integer microdollars or equivalent exact integer units until formatting. Intermediate operations guard overflow and reject non-finite values.

## Recommendation and coverage separation

The cost recommendation is available whenever plan fee, pricing, and workload are valid:

- `Subscription is cheaper on a token-equivalent basis.`
- `API is cheaper on a token-equivalent basis.`
- `The token-equivalent costs are equal.`

The capacity result is independent:

- verified coverage when published entitlement dimensions directly support the workload unit and amount;
- verified non-coverage when a comparable hard maximum is lower than the workload;
- projected scenario for published relative or practical ranges;
- not independently verified for dynamic, unknown, stale, or incomparable units.

Unknown coverage never suppresses API-equivalent cost, difference, efficiency, or breakeven.

## Results experience

The primary result shows:

- monthly messages, input tokens, and output tokens;
- subscription fee;
- API-equivalent monthly cost;
- signed monthly difference;
- efficiency explanation;
- breakeven messages per day;
- capacity-evidence result;
- mapped model/route and source links;
- calculation timestamp and catalog freshness.

A selectable table compares every eligible subscription using the same workload and each plan's documented default API equivalent. Unsupported prices remain unavailable; the table never coerces them to zero.

The share URL serializes normalized, bounded inputs and the explicit model mapping. Invalid or obsolete shared values fall back safely and update the canonical URL.

## Newsletter delivery

### Double opt-in

The existing same-origin signup endpoint, Brevo double-opt-in contact creation, required subscriber fields, honeypot, generic responses, and alerts consent remain. No cheatsheet email is sent before confirmation.

After confirmation adds the contact to the final monthly-cheatsheet list, a Brevo automation triggered by that list sends the welcome email. This follows Brevo's documented contact-added-to-list workflow; double-opt-in contacts enter only after confirming.

### Test PDF

The repository contains one deterministic, valid PDF with one blank page and no visible cheatsheet content. A zero-byte file is not acceptable because it is not a PDF. The asset has:

- a versioned public filename, such as `tokenbench-cheatsheet-test-v1.pdf`;
- `application/pdf` content type;
- immutable cache headers on the versioned URL;
- a stable hash recorded in deployment documentation;
- no customer or benchmark data.

The welcome email links to the versioned test PDF and clearly identifies it as the current test delivery. It does not promise populated content. Later automatic generation can replace the delivery target without changing signup or confirmation semantics.

### Confirmation page

`/newsletter/confirmed/` is a dedicated route, not the SPA Home fallback. It contains confirmation copy and one action only:

> Start Exploring

The action links to `/`. The page has a unique title, description, canonical, Open Graph/Twitter metadata, and `robots: noindex,follow` because it is a transactional destination rather than an acquisition page.

## Privacy and observability

Delivery logs use Brevo message/automation identifiers and safe status values. Application logs never contain the subscriber email, first name, company, PDF URL tokens, or API key. The public test PDF has no secret query parameter.

## Acceptance criteria

- Default usage renders finite API cost, difference, efficiency, and breakeven for plans with valid pricing even when capacity is dynamic unknown.
- Zero usage, zero days, missing pricing, incomplete model mix, very large bounded inputs, and signed efficiency have explicit tests.
- Plan coverage cannot change the arithmetic result.
- Shared-state round trips retain all primary inputs and explicit model override.
- Same-workload plan rows use each plan's mapped API equivalent and disclose it.
- The test PDF parses as a valid one-page blank PDF, has the expected MIME type and immutable versioned URL, and is downloadable in production.
- A controlled test contact receives no welcome email before confirmation and receives exactly one after confirmation.
- The welcome email link resolves to the expected PDF hash.
- The confirmation page shows only Start Exploring as its button/link action and has complete metadata with `noindex,follow`.
- Desktop and mobile browser tests have no horizontal overflow and preserve 44px touch targets.

## Deployment gate

Deploy the static PDF and Pages changes, configure or verify the Brevo list-triggered automation, and perform a controlled double-opt-in test using an authorized test address. Verify delivery, link, PDF hash, confirmation page, calculator formulas, metadata, share state, console, and responsive layout before starting Release 3.

