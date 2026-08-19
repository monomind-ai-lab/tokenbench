# TokenBench Next.js preservation contract

Status: active

Approved: 2026-08-19

Authority: `https://8bf19b96.tokenbench-27t.pages.dev/`

This contract governs the section-to-section Next.js rebuild. The immutable deployment is the source of truth for route coverage, page structure, section order, information hierarchy, features, interactive behavior, and important visual elements. The authorized AI Components and Cult UI resources may change presentation and implementation details; they may not silently remove or replace existing product behavior.

## Non-negotiable preservation rules

1. Keep every published page and route family, including all model profiles, leaderboard categories, generated comparisons, articles and guides, tools, price-performance, and subscribe-versus-API experiences.
2. Rebuild every section on every retained page. A new component may improve the section, but it may not stand in for unrelated existing content.
3. Preserve interactive charts, filters, sort controls, tabs, toggles, user inputs, URL/query state, validation, and dynamic result presentation.
4. Preserve result actions wherever a result surface supports them: card/list view, copy link, download image, and export CSV.
5. Preserve the dark/light theme toggle.
6. Preserve multilingual navigation using the same interaction model: searchable language selector with languages arranged in two columns.
7. Preserve the footer marketing form and use the current global navigation and footer on every non-transactional page, including article details.
8. `/cost` remains redirect-only unless the user explicitly changes it.
9. `/subscribe-vs-api/` must be reconstructed section for section. A new API cost calculator may be additive, but it must not replace any existing section, chart, input, or result.
10. Additive improvements are allowed only after the preserved experience is accounted for and remain compatible with accessibility, responsive behavior, SEO/no-JS usefulness, and existing route/query semantics.

## Required route families

The immutable sitemaps currently expose:

- 28 static routes.
- 29 generated comparison routes under `/compare/<model>-vs-<model>`.
- 4,455 generated model profile routes under `/models/<slug>/`.

Required static routes:

- `/`
- `/guides/`
- `/articles/`
- `/articles/track-claude-code-usage/`
- `/articles/monitor-openai-codex-usage/`
- `/articles/openrouter-guide-model-routing-cost-controls/`
- `/articles/legitimate-free-ai-api-access-credits/`
- `/articles/reduce-llm-api-costs-caching-batch-output-limits/`
- `/articles/hybrid-router/` (accepted sixth substantive article; linked by the immutable deployment even though absent from its static sitemap)
- `/tools/`
- `/llm-price-performance/`
- `/compare/`
- `/models/`
- `/popular-models/`
- `/make-it-yours/` (custom weighted ranking; linked from global navigation even though absent from the current static sitemap)
- `/leaderboards/`
- `/leaderboards/llm/overall/`
- `/leaderboards/llm/coding/`
- `/leaderboards/llm/agentic/`
- `/leaderboards/llm/reasoning/`
- `/leaderboards/llm/knowledge/`
- `/leaderboards/llm/human-preference/`
- `/leaderboards/llm/value/`
- `/leaderboards/llm/pricing-context/`
- `/leaderboards/multimodal/vision-documents/`
- `/leaderboards/media/text-to-image/`
- `/leaderboards/media/image-editing/`
- `/leaderboards/media/text-to-video/`
- `/leaderboards/media/image-to-video/`
- `/leaderboards/media/video-editing/`
- `/subscribe-vs-api/`
- `/model-lifecycle/` when reached from the immutable navigation/content, even though it is absent from the current static sitemap.
- `/model-profile?model=<slug>` legacy/query entry semantics, with canonical model-profile handling preserved.
- `/cost` as a redirect only.

## Published article rule

`/articles/` preserves the immutable index’s eight intentional entries: six substantive URL-backed published guides and two explicitly prototype-labeled insight concepts that resolve to an in-page disclosure rather than fabricated detail pages. The current category counts are therefore `8 / 6 / 2 / 0` for all, guides, insights, and news. Empty or accidental unpublished records remain excluded, and the substantive published detail set remains exactly six.

## Data and comparison semantics

- `null` is not zero.
- Ordered comparisons accept 2–4 distinct model slugs.
- Mixed-source rankings may have `effectiveAt: null` while retaining per-source time and provenance.
- Custom rankings use the exact submitted weight/filter matrix.
- Model and comparison routes must remain shareable and reconstructible from their path/query state.

## Design-system boundary

- Preserve the card/list interaction language and motion from the authorized AI Components.
- Use AI Component-derived tokens for custom sections so the complete site reads as one system.
- Use Cult UI as a supporting component catalog; no single catalog entry, including Hero Color Panels, has privileged status.
- Use Chart.js for quantitative charts.
- Use logos shipped with authorized components first, Brandfetch only for missing logos, and a colored dot fallback when no logo is available.

## Acceptance gate for every route

Before a route is considered rebuilt, record:

- Route and canonical/query behavior.
- Immutable section inventory in order.
- Feature/control inventory and initial state.
- Preserved charts, inputs, outputs, and result actions.
- Global navigation, language, theme, and footer-form presence.
- Desktop and mobile visual evidence.
- Keyboard/accessibility check.
- SEO/no-JS evidence where practical.
- Any intentional additive element, clearly separated from preserved content.

No route may be marked complete solely because its visual style matches the approved preview.
