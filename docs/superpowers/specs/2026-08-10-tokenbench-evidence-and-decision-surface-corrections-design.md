# TokenBench Evidence and Decision Surface Corrections

**Date:** 2026-08-10  
**Status:** Approved design, pending written-spec review  
**Visual direction:** Editorial Signal (Direction A)  
**Production origin:** `https://tokenbench.monomind.one`

## Outcome

This release makes TokenBench easier to understand at a glance while correcting evidence defects that currently undermine calculator conclusions and BenchAlign rankings. It must:

1. Replace the home page's structurally unavailable market snapshot with representative, validated leaderboard and comparison results.
2. Add clear Subscribe vs API and Guides pathways to the home page.
3. Redesign the global footer, newsletter signup, and MonoMind service banner using the approved Editorial Signal direction.
4. Add required first-name and company fields to every expanded newsletter form while preserving double opt-in and explicit alerts consent.
5. Model published and projected subscription usage ceilings without presenting hypotheses as guarantees.
6. Replace generic comparison copy with factual implications and add sourced modality fallbacks.
7. Correct BenchLM/BenchAlign values and ranks across ingestion, APIs, leaderboards, CSV, comparison, and home decision picks.

Correctness is a release prerequisite. Visual changes must not ship on top of known incorrect ranking data.

## Audience and visitor modes

- **Home and footer — Persuade:** an AI builder should understand what TokenBench provides and enter a decision path with minimal effort.
- **Calculator, comparison, and leaderboards — Operate:** a builder should reach a defensible cost or model decision without interpreting internal data mechanics.
- **Guides and methodology — Read:** evidence, assumptions, and provenance should be concise at the decision surface and expandable when the visitor wants details.

## Approved visual direction

Editorial Signal uses the existing TokenBench light-mode system as the default and translates the same hierarchy into dark mode. It is spacious, restrained, and publication-like rather than terminal-themed.

- Electric blue remains the scarce decision accent.
- Cards use subtle borders and elevation; decoration never competes with values or conclusions.
- MonoMind appears as a quiet expert recommendation, not a second hero.
- The MonoMind service sentence uses body-sized type, approximately the small-body role rather than a display role.
- Required fields and evidence states use text, icons, and borders in addition to color.
- Responsive layouts preserve 44px interactive targets and never require horizontal page scrolling.

The approved footer and home mockups are retained under the ignored `.superpowers/brainstorm/80050-1786348196/` review session.

## Global footer, signup, and MonoMind banner

### Footer structure

The global footer uses four desktop regions and a single-column mobile flow:

1. TokenBench brand and one-sentence purpose.
2. Explore links.
3. Trust links: methodology, data sources, and privacy.
4. The monthly cheatsheet signup.

The footer ends with MonoMind ownership, double-opt-in disclosure, and unsubscribe guidance. It does not repeat catalog refresh or source-update history.

### Newsletter form

Every expanded form accepts:

- `firstName` — required, trimmed, non-empty.
- `company` — required, trimmed, non-empty.
- `email` — required and validated under the existing contract.
- `modelAndPriceAlerts` — optional and unchecked by default.
- `monthlyCheatsheet` — always true for this offer.

The footer always shows the complete form. Compare pages keep the approved progressive disclosure: the alerts checkbox appears first; selecting it reveals first name, company, email, consent copy, and submit action.

The Pages Function sends Brevo contact attributes `FIRSTNAME` and `COMPANY`. The release checklist verifies those attributes exist in the configured Brevo account before a live submission. The endpoint retains same-origin, JSON-only, honeypot, timeout, generic-response, and double-opt-in protections. It never exposes Brevo errors or credentials to the browser.

### MonoMind service banner

The banner sits above the footer:

> Spending over $1,000/month on LLM tokens? MonoMind designs routing, caching, and agent pipelines that can cut API bills by up to 90%.

The sentence is smaller than the surrounding home section headings. The banner includes a compact MonoMind mark, `MonoMind AI Lab` label, and one `Talk to MonoMind` action.

## Home page

### Section order

1. Hero: approved title and subcopy.
2. `See the market at a glance`.
3. Subscribe vs API banner.
4. `What TokenBench gives you`.
5. Guides preview.
6. Builder positioning and MonoMind service banner.
7. Editorial Signal footer.

### See the market at a glance

The section no longer renders generic `Unavailable` cards or a source-update ledger. It contains:

- Five leaderboard leader cards: Overall, Coding, Agentic, Reasoning, and Multimodal.
- Two representative comparison cards.
- Direct actions to all leaderboards and the Compare tool.

Leaderboard cards consume corrected authoritative source values and ranks. A card appears only when the active revision has a validated display value, the relevant source rank or explicitly non-rankable evidence state, complete provenance, and a supported evidence status. It never derives a leader by sorting a filtered subset.

Representative comparisons come from a small reviewed pair allowlist. A pair must have at least four compatible shared metrics, at least one decision-relevant difference, and sufficient price/context evidence for a factual implication. Pair selection is editorially stable; implication copy regenerates from the active revision. No pair is described as a universal winner.

Transport failures use a dedicated retry state. Structurally unsupported cards are omitted rather than labelled unavailable.

### Subscribe vs API banner

The banner asks, `Should you subscribe or pay as you go?` It explains the three-step flow—model mix, workload, and cost implication—and links to the calculator. It does not display an unsourced savings claim.

### Guides preview

The page shows three curated guides, initially:

- Reduce LLM API costs with caching, batching, and output limits.
- OpenRouter model routing and cost controls.
- Track Claude Code usage without guessing.

The selection is curated for decision usefulness, not automatically sorted by update time. Home does not list data-update history.

## Subscription entitlement evidence

### Evidence model

Plan entitlement and its evidence must be separate from presentation copy:

```ts
type EntitlementEvidence = {
  status: 'verified' | 'projected' | 'dynamic_unknown' | 'stale';
  boundType: 'hard_max' | 'practical_upper' | 'outer_ceiling' | 'unknown';
  dimensions: Array<{
    metric: 'messages' | 'model_calls' | 'credits' | 'tasks' | 'feature_uses';
    min?: number;
    max?: number;
    unit: string;
    window: 'rolling_5h' | 'weekly' | 'monthly' | 'billing_cycle';
    resetRule?: string;
    modelId?: string;
    feature?: string;
    sharedPoolId?: string;
  }>;
  projection?: {
    formula: string;
    assumptions: string[];
    caveats: string[];
  };
  source: {
    url: string;
    accessedAt: string;
    publishedOrModifiedAt?: string;
    confidence: 'high' | 'medium' | 'low';
  };
};
```

`verified` may drive a coverage determination when the unit can be compared with the user's workload. `projected` provides a scenario only. It must never produce guaranteed savings or a verified-capacity badge. `dynamic_unknown` explains the provider policy without manufacturing a number. `stale` blocks a recommendation until refreshed.

### Research baseline

All sources were accessed 2026-08-10. Thirty-day figures derived from rolling windows are outer ceilings, not guaranteed allowances.

| Plan | Published entitlement | Calculator baseline |
| --- | --- | --- |
| Alibaba Coding Pro | 6,000 calls/5h, 45,000/week, 90,000/month | Verified hard maximum 90,000 calls; practical 3,000–18,000 queries using the provider's 5–30 calls/query range. |
| Alibaba Token Lite | 10,000 credits/month | Verified credits; no token conversion. |
| Alibaba Token Standard | 40,000 credits/month | Verified credits; no token conversion. |
| Alibaba Token Pro | 160,000 credits/month | Verified credits; no token conversion. |
| Claude Pro | At least 5x free usage/5h plus weekly cap | Projected relative ceiling `5 × F × 144`, where `F` is the unknown free-session capacity; weekly cap may dominate. |
| Claude Max 5x | 5x Pro/5h plus weekly cap | Projected relative ceiling `25 × F × 144`. |
| Claude Max 20x | 20x Pro/5h plus weekly cap | Projected relative ceiling `100 × F × 144`. |
| Google AI Plus | 2x standard, 5h refresh plus weekly cap | Projected relative ceiling `288 × S`, where `S` is the dynamic standard-session capacity. |
| Google AI Pro | 4x standard | Projected relative ceiling `576 × S`. |
| Google AI Ultra 5x | 20x standard | Projected relative ceiling `2,880 × S`. |
| Google AI Ultra 20x | 80x standard | Projected relative ceiling `11,520 × S`. |
| SuperGrok | Higher limits; no number or reset published | Dynamic unknown; no numeric projection. |
| Kimi Moderato | 60 Agent, 25 Swarm, 2,000 DB uses/month | Verified feature-specific practical limits; no token conversion. |
| Kimi Allegretto | 150 Agent, 50 Swarm, 5,000 DB uses/month | Verified feature-specific practical limits. |
| Kimi Allegro | 360 Agent, 120 Swarm, 12,000 DB uses/month | Verified feature-specific practical limits. |
| Kimi Vivace | 720 Agent, 240 Swarm, 24,000 DB uses/month | Verified feature-specific practical limits. |
| ChatGPT Go | No numeric allowance published | Dynamic unknown. |
| ChatGPT Plus | Sol 10–100, Terra 25–200, Luna 250–2,000 messages/5h | Projected 30-day outer ceilings 14,400, 28,800, and 288,000; weekly caps may lower them. |
| ChatGPT Pro 5x | Sol 50–500, Terra 125–1,000, Luna 1,250–10,000/5h | Projected outer ceilings 72,000, 144,000, and 1.44M. |
| ChatGPT Pro 20x | Sol 200–2,000, Terra 500–4,000, Luna 5,000–40,000/5h | Projected outer ceilings 288,000, 576,000, and 5.76M. |
| Z.AI Lite | 10,000 credits/week | Projected 42,900 credits/30d before unpublished 5h cap. |
| Z.AI Pro | 60,000 credits/week | Projected 257,100 credits/30d before 5h cap. |
| Z.AI Max | 140,000 credits/week | Projected 600,000 credits/30d before 5h cap. |

Primary sources:

- [Alibaba Coding Plan](https://www.alibabacloud.com/help/en/model-studio/coding-plan)
- [Alibaba Token Plan](https://www.alibabacloud.com/en/campaign/ai-landing-page-token)
- [Claude Pro](https://support.claude.com/en/articles/8325606-what-is-the-pro-plan)
- [Claude Max](https://support.claude.com/en/articles/11049741-what-is-the-max-plan)
- [Google Gemini limits](https://support.google.com/gemini/answer/16275805?hl=en)
- [xAI pricing](https://x.ai/pricing)
- [Kimi membership pricing](https://www.kimi.com/help/membership/membership-pricing)
- [OpenAI pricing and usage limits](https://learn.chatgpt.com/docs/pricing)
- [Z.AI usage policy](https://docs.z.ai/devpack/usage-policy)

The catalog refresh must correct observed drift before the calculator uses these rows: Alibaba Token entitlements and Standard/Pro prices, Google AI Plus price, Z.AI Pro/Max prices, OpenAI model-specific windows, Kimi feature limits, and Z.AI weekly credits.

## Calculator result design

The result area always starts with the user's API-equivalent monthly cost. It then separates three questions:

1. **What does API usage cost?** Exact calculation from the selected model mix and workload.
2. **What does the subscription cost?** Published plan price and billing period.
3. **Can the plan cover this workload?** Verified, projected, or unknown entitlement evidence.

Copy names the actual condition:

- Verified coverage: `The published allowance covers this workload under the selected model limits.`
- Projected coverage: `Potential coverage: up to N messages per 30 days, projected from the published five-hour maximum. Weekly limits may reduce this total.`
- Non-token credits: `The plan includes N credits. The provider does not publish a stable token conversion, so TokenBench cannot verify token coverage.`
- Dynamic unknown: `The provider advertises higher limits but does not publish a numeric cap or reset schedule.`
- Insufficient fixed limit: `The published allowance is below this workload.`
- Unsupported model: `The plan does not publish access to one or more selected models.`

Only verified comparable capacity may produce verified savings, breakeven, and efficiency metrics. Projected capacity may show a clearly labelled potential fee difference and coverage scenario, never guaranteed savings. Unknown capacity preserves the API-equivalent cost and plan fee while withholding coverage-dependent metrics.

The right rail is normal document flow. The full summary is not sticky. If persistent context is later desired, only a compact viewport-safe KPI strip may be sticky. The chart cannot overlap the summary at any supported viewport.

## Compare page

### Key implications

`Comparison Summary` and `Evidence Highlights` become one `Key implications` section. It contains two to four evidence-backed findings in this order:

1. Shared-metric capability lead and the largest meaningful gap.
2. Selected-route input/output price implication when both values are verified.
3. Selected-route or model context implication.
4. Verified modality difference when relevant.

The section never uses metric-count filler such as `Four or more compatible metrics are available`. Coverage is disclosed separately as `Broad`, `Limited`, or `Insufficient shared-metric coverage`; it is not called evidence strength.

Route-sensitive findings use the selected route and must be reproducible from shared state. If the shared URL does not encode routes, route-sensitive claims stay out of the share summary.

### Pricing and context

Keep:

- Selected route and verification badge.
- Input API price.
- Cached input price when either side publishes it.
- Output API price.
- Context window with explicit route/model scope.
- Input modalities.
- Output modalities.

Remove:

- Maximum input.
- Maximum output.
- Supported parameters.

Verification status is shown with the route rather than as a full table row. Rows remain visible when one side has evidence; a missing side reads `Not verified` rather than `Not published`.

### Modality evidence

Use this fallback hierarchy:

1. Exact first-party API-route metadata or provider documentation.
2. Exact first-party model documentation.
3. Reviewed, provider-owned Hugging Face repository with a pinned revision and explicit directional facts.
4. Reviewed Hugging Face task metadata plus pinned card/config corroboration.
5. Exact routed metadata from OpenRouter.
6. Exact LiteLLM or another approved corroborating source.
7. `Not verified`.

Free-text Hugging Face search, community derivatives, quantizations, family-name matching, benchmark prose, and generic `multimodal` tags cannot populate directional facts.

Modality facts have explicit scope:

```ts
type ModalityFact = {
  modelKey: string;
  scope: 'api_route' | 'model' | 'checkpoint';
  routeId: string | null;
  inputModalities: readonly ('text' | 'image' | 'audio' | 'video')[] | null;
  outputModalities: readonly ('text' | 'image' | 'audio' | 'video')[] | null;
  status: 'verified' | 'partial' | 'conflict' | 'not_verified';
  semanticBasis: 'explicit_directional' | 'mapped_task' | 'generic_only';
  confidence: 'high' | 'medium' | 'low';
  identityStatus: 'reviewed' | 'unverified' | 'conflict';
  sourceArtifactId: string;
};
```

Initial reviewed coverage is:

- Provider docs: Claude Fable 5, Claude Opus 4.8, Claude Opus 5, GPT-5.6 Sol — text/image input and text output.
- First-party Hugging Face: Inkling and Inkling-Small — text/image/audio input and text output; Kimi K3 — verified text/image input and text output, with video unverified due conflicting card metadata.
- Not verified: Muse Spark 1.1, Qwen3.7 Max, and Qwen3.7 Plus.

## BenchLM and leaderboard correctness

### Root cause

TokenBench currently:

1. Discards BenchLM `displayScore`, `overallRank`, and `categoryRanks`.
2. Persists `rawOverallScore` as the public overall value.
3. Uses `verifiedDisplayCategoryScores` in place of the public display category value in some categories.
4. Sets source rank to null.
5. Sorts values and synthesizes row positions after filtering.
6. Treats local evidence eligibility as if it could erase a source-published score and rank.
7. Requests `multimodal` while BenchLM publishes `multimodalGrounded`.

This contradicts the product claim that TokenBench republishes BenchLM's BenchAlign results without recalculation.

The active source reconciliation proves the defect is systemic:

- Raw overall score matches upstream for 104/104 rows.
- Public display score differs from the raw value for 104/104 rows.
- TokenBench overall positions differ from BenchLM source rank for 101/104 rows.
- Coding positions differ for 29/30 comparable rows.
- Agentic positions differ for 31/32 comparable rows.

### Correct data contract

BenchLM metrics preserve:

- `rawValue` — diagnostic raw composite.
- `displayValue` — public BenchAlign value.
- `sourceRank` — published overall/category rank or null.
- `rankingMode` and method version.
- `sourceRankingEligible` — source policy.
- `evidenceStatus` — TokenBench support/estimate classification.
- `decisionEligible` — TokenBench endorsement policy.
- Score interval or uncertainty fields when published.

Public leaderboards use `displayValue`. They display `sourceRank` when published. They never export a filtered row index as a source rank. Filtering preserves absolute source rank and cannot create a new leader badge.

Rows with equal source scores/ranks share the published rank. When a source publishes a value without a rank, the UI shows the value and `Not ranked by source`; it does not synthesize a rank.

Estimated rows may display the source-published value and rank with a clear status label, while remaining ineligible for TokenBench winner badges, value-frontier claims, and home decision picks. Evidence status never rewrites source truth.

Map `multimodalGrounded` to the Multimodal route. Expose non-rankable published Reasoning evidence without promoting it into a ranking.

### GPT-5.6 reconciliation examples

| Model | Correct public overall | Current production | Required outcome |
| --- | --- | --- | --- |
| GPT-5.6 Sol | 81.48 / #4 | 81 / synthesized #4 | 81.48 / source #4 |
| GPT-5.6 Terra | 72.28 / #12 | 77 / unranked | 72.28 / source #12, status shown separately |
| GPT-5.6 Luna | 66.86 / #23 | 70 / unranked | 66.86 / source #23, status shown separately |

Sol category examples: Agentic 94.9/#5, Coding 54.8/#3, Knowledge 83.3/#6, Multimodal Grounded 84.7/#5. The current Coding value/position 52.8/#21 is incorrect.

LMArena `gpt-5.6-*-xhigh` and `codex-harness` identities remain separate from BenchLM canonical models unless explicit upstream evidence proves equivalence. LMArena values and source ranks already reconcile and must not be changed by the BenchLM correction.

## Provenance and timestamps

- `observedAt` or retrieval time is labelled `Checked` or `Observed`, never `Updated`.
- Upstream publication/generated time is labelled `Source published`.
- Method identifier is distinct from publication time.
- Home does not show a source-artifact ledger.
- Leaderboard provenance includes only artifacts that contribute displayed models/metrics, not every artifact belonging to the same broad source.
- Hugging Face artifacts pin owner/repository, SHA, selected card/config files, content hashes, license metadata, and observation time.

## Error, empty, and uncertainty states

- Transport or publication failure: concise temporary message plus Retry.
- No supported result in the active revision: omit optional home card; detail pages explain the missing evidence.
- Projected entitlement: visible `Projected outer ceiling` label, formula, assumptions, source, and caveats.
- Dynamic entitlement: `Numeric limit not published` with provider policy and source.
- Modality unknown after all reviewed sources: `Not verified` with tooltip explaining that no exact-model source establishes the direction.
- Conflicting modality evidence: `Conflicting source evidence`; do not choose one silently.
- Source value without rank: `Not ranked by source`.

## Implementation boundaries

This specification authorizes a later implementation plan; it does not itself mutate production data or external services.

In scope:

- Catalog research refresh and entitlement schema.
- Calculator behavior and layout.
- BenchLM ingestion, storage, projections, and ranking semantics.
- Comparison implication and modality fact contracts.
- Home, footer, signup, and MonoMind banner UI.
- Brevo first-name/company attributes and form contract.
- Focused migrations, fixtures, tests, and production verification needed by these changes.

Out of scope:

- Fuzzy or automated cross-source identity matching.
- Treating community Hugging Face repositories as facts for closed models.
- Inventing token conversions for credits, tasks, or messages.
- Removing or altering `ai-plans.monomind.one`.
- Cover-image work.
- Brevo campaign sending or scheduling.

## Delivery order

1. Correct catalog prices/entitlements and add evidence/projection contracts.
2. Correct BenchLM ingestion/data contract and publish a fully reconciled revision.
3. Add model/modality evidence sources and reviewed identity links.
4. Update API projections, CSV, home decision picks, and comparison implications.
5. Implement calculator result behavior and non-overlapping layout.
6. Implement Editorial Signal home, footer, signup, and MonoMind banner.
7. Run local gates, controlled production refresh, deploy, and production reconciliation.

No home leaderboard leader, comparison implication, or ranking badge ships before step 2 passes its release gate.

## Acceptance and release gates

### Catalog and calculator

- All 23 subscription plans have a current source, evidence status, and entitlement dimensions.
- Stale prices identified in this specification are corrected or blocked with a visible stale status.
- Verified, projected, dynamic, and stale states render distinct copy.
- Every projected number shows formula, assumptions, and caveats.
- Only verified comparable capacity produces verified savings/breakeven/efficiency.
- Calculator summary and chart do not overlap at 320, 375, 768, 1024, or 1440 CSS pixels.

### Benchmark validation

- For every BenchLM model in the pinned revision, stored and projected public display values exactly equal upstream `displayScore`/public category values.
- Every published overall/category source rank is preserved exactly.
- Raw values remain available only as disclosed diagnostics and never replace public display values.
- API, model detail, leaderboard, UI, CSV, comparison, and home decision picks agree on display value and source rank.
- Full-source golden tests include deliberately divergent raw/display values and current category vocabulary.
- Filtering cannot change absolute rank or create a leader badge.
- Ties remain ties.
- `multimodalGrounded` appears in Multimodal.
- Published non-rankable evidence remains visible without a synthetic rank.
- LMArena's audited 788 facts retain exact source values/ranks and distinct `xhigh`/harness identities.
- OpenRouter price samples retain exact prompt/completion values and disclosed workload weighting.

### Compare and modality

- Key implications state factual capability, price, context, or modality findings and contain no metric-count filler.
- Maximum input/output and supported-parameter rows are absent.
- Modality facts identify scope and source.
- Provider docs and reviewed pinned Hugging Face repositories populate the initial seven covered models.
- The remaining three reviewed models render `Not verified` unless new exact evidence is reviewed.
- Community or fuzzy HF matches fail identity validation tests.

### Signup and visual QA

- First name, company, and email are required in every expanded form.
- Compare preserves progressive disclosure and optional alerts consent.
- Brevo receives `FIRSTNAME` and `COMPANY` through double opt in.
- Light mode remains the default; dark mode is a semantic translation.
- Footer, signup, home, and MonoMind banner pass keyboard, focus, contrast, reduced-motion, and responsive checks.
- The home page contains no data-update history and no structurally unavailable market cards.

## Research evidence summary

The design rests on read-only audits completed against production and pinned upstream sources on 2026-08-10:

- Subscription inventory: 23/23 plans across seven providers.
- BenchLM overall reconciliation: 104/104 raw matches, 104/104 public-display differences, 101/104 rank disagreements under current TokenBench ordering.
- Category rank disagreement: Coding 29/30, Agentic 31/32.
- LMArena reconciliation: 788/788 audited metric facts matched the pinned source revision.
- Modality coverage among 10 reviewed comparison models: three exact first-party Hugging Face repositories, four additional exact provider-document records, three not verified.
- Current worktree remained clean during all research audits.
