# TokenBench production-preview audit

## Candidate and boundary

- Application candidate: `7696cfe2d46ea3ba9eaa1ccc6cdf8436f56729c6`
- Audit date: 2026-08-06 (Asia/Taipei)
- Runtime: local Vite preview serving the generated `dist` directory on
  `http://127.0.0.1:4175`
- Browser: locally installed Google Chrome, driven headlessly by Playwright

This is retained evidence for the committed local release candidate. It is not
evidence of a Cloudflare Pages deployment, a production D1 migration, a Worker
deployment, a domain change, or a public production smoke test. Those operations
remain pending explicit authorization.

## Production-build command and result

~~~sh
npm run test:browser:production
~~~

Recorded result:

~~~text
Generated 23 crawlable fixed pages and public/sitemaps/static.xml.
vite v6.4.3 building for production...
✓ 1729 modules transformed.
✓ built
Running 42 tests using 1 worker
42 passed
~~~

The command first runs `npm run build`, then starts `vite preview` through
`playwright.production.config.ts`. Handler-backed comparison pages retain the
document emitted by the real Pages Function and load `/assets/main.js` and
`/assets/tokenbench.css` directly from `dist`.

## Route, viewport, and theme matrix

Every row passed at 320, 375, 768, 1024, and 1440 CSS pixels in both light and
dark themes: 10 routes × 5 viewports × 2 themes = 100 production-preview
navigations.

| Route | Hydrated client marker | One H1 | Static shell removed | No horizontal overflow | Result |
| --- | --- | --- | --- | --- | --- |
| `/` | `.home-page` | Pass | Pass | Pass | Pass |
| `/tools/` | `.tools-page` | Pass | Pass | Pass | Pass |
| `/tools/subscriptions-vs-apis/` | `.calculator-page` | Pass | Pass | Pass | Pass |
| `/leaderboards/` | `.leaderboard-directory-page` | Pass | Pass | Pass | Pass |
| `/leaderboards/llm/coding/` | Named coding leaderboard results | Pass | Pass | Pass | Pass |
| `/leaderboards/media/text-to-image/` | Named media leaderboard results | Pass | Pass | Pass | Pass |
| `/compare/` | `.comparison-hub-page` | Pass | Pass | Pass | Pass |
| `/compare/alpha-vs-beta` | Client-only comparison hydration sentinel | Pass | Pass | Pass | Pass |
| `/guides/` | Hydrated guide hub | Pass | Pass | Pass | Pass |
| `/guides/track-claude-code-usage/` | Hydrated guide article | Pass | Pass | Pass | Pass |

The matrix also verified one banner, one main landmark, one content-info
landmark, primary navigation, persisted theme state, and the compact navigation
control below 768 CSS pixels.

## Interaction, state, and accessibility checks

- The real handler-rendered comparison remained crawlable without JavaScript,
  exposed one H1 and its canonical URL, then hydrated from production assets.
- Changing comparison workload from Balanced to Output-heavy recalculated
  Alpha's displayed workload price from `$3.50 / 1M` to `$5.00 / 1M`.
- Calculator focus order reached provider, plan, model, workload, language,
  theme, and evidence controls with a visible focus indicator.
- Activating skip links moved focus to the home main landmark, persistent
  calculator target (including before catalog data resolves), guide hub, and
  guide article targets.
- Escape closed compact navigation; chart alternative text exposed current
  tokens and API-equivalent value; reduced-motion behavior passed.
- Calculator loading, empty, error, bootstrap, and stale states passed.
- Leaderboard table/card transformations and fresh, stale, empty, and
  unavailable states passed.

## Production-preview screenshots

The screenshots below were captured after the production build from the local
preview server, with upstream requests blocked and deterministic local fixtures.
They were also inspected manually for hierarchy, spacing, type, contrast,
responsive composition, clipping, and unintended overlays.

| Surface | Viewport/theme | Evidence |
| --- | --- | --- |
| Calculator | 320 light | [production-calculator-320-light.png](production-calculator-320-light.png) |
| Coding leaderboard | 375 dark | [production-coding-375-dark.png](production-coding-375-dark.png) |
| Media leaderboard | 768 light | [production-media-768-light.png](production-media-768-light.png) |
| Dynamic comparison | 375 dark | [production-comparison-375-dark.png](production-comparison-375-dark.png) |
| Dynamic comparison | 1440 light | [production-comparison-1440-light.png](production-comparison-1440-light.png) |
| Guide article | 1024 dark | [production-article-1024-dark.png](production-article-1024-dark.png) |

Manual disposition: no unresolved critical, high, or medium visual finding.

The final independent review also required the calculator target to persist
during loading and the dynamic comparison's matrix marker to be client-only.
Both were reproduced as failing regressions, fixed, and included in the 42-test
suite recorded above.

## Impeccable audit disposition

The installed Impeccable source detector was run against the production UI
sources with the repository's `DESIGN.md` context. The CSS scan retained 129
documented design-system notices: 109 type-ramp endpoints, 15 radii, and 5
semantic colors. They implement the approved dense technical mockups and remain
low-severity, intentional design decisions. Inter remains the declared
abcDiatype substitute in `DESIGN.md`. The only broken-resource report is the
deliberately invalid `srcset` input in `scripts/mockup-contract.test.ts`; it is
not shipped.

Impeccable's optional URL detector could not run because Puppeteer is not
installed, and no dependency was installed for this audit. The production
browser inspection above used the repository's existing Playwright runtime and
served compiled assets rather than Vite source modules.
