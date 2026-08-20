# Checkpoint 5 — article chrome and live-data wiring

Date: 2026-08-21

## UI checkpoint

- Rebuilt the article directory around the immutable deployment's compact
  navigation and cover composition, using `#1111ff` as the primary accent and
  `#9dabff` as the dark-theme secondary accent.
- Kept exactly six substantive guides and two clearly labeled prototype
  insights. Empty/unpublished records remain excluded.
- Article topics use responsive wrapping/grid placement rather than a horizontal
  strip. The sort control is compact on desktop and full-width on mobile.
- Every published article title and CTA is a real route link; prototype titles
  link to the in-page disclosure rather than pretending a detail route exists.
- Header and footer use the transparent MonoMind mark without a white backing.
  Desktop menus are bounded overlays; language search/two-column layout,
  light/dark mode, mobile navigation, skip link, and the footer marketing form
  remain present.

## Data checkpoint

- Shared top-model navigation and `/popular-models/` now use the same validated
  weekly popularity order. Strict benchmark rows only enrich exact identities;
  they never supply a substitute popularity rank.
- Published child leaderboards load and validate their per-key HTTP endpoint in
  production. Evidence mode remains the retained exact preview path.
- Make It Yours no longer posts a retained fixture dimension set in production.
  It loads published candidates and re-ranks only complete six-axis candidates;
  incomplete producer facts stay unavailable.
- Models, profiles, and comparisons now support an exact reviewed
  LiveBench-to-canonical-directory-to-active-catalog join. Route pricing,
  context/output limits, supported modalities, and expiration facts preserve
  their independent revisions and provenance. No names, display labels, or
  similar prices are used as join keys.
- `/cost` remains redirect-only and no longer asserts a stale provider, plan,
  model, or price in its destination URL.
- Production mode is HTTP-only. Local evidence remains explicit and cannot
  become a production fallback.

## Verification

- Next ESLint and production build passed.
- Impeccable detector returned no findings on the changed UI surfaces.
- Focused tests cover weekly/strict Popular Models merging, per-key leaderboard
  parsing/projection, Home comparison selection, Make It Yours completeness,
  strict catalog joining, null-versus-zero behavior, and shared-menu ranking.
- Local browser inspection confirmed the article directory semantics, real
  title links, bounded Models menu, correct `#model-catalog` deep link, supplied
  top-model ranks, shared footer form, and no document-level horizontal overflow.

No deployment, endpoint activation, or live infrastructure change occurred.
The canonical hosted origin still requires a separately authorized producer
deployment/migration before these new strict endpoints and joins can be reviewed
with real production responses.
