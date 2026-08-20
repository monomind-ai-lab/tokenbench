# Checkpoint 1 — browser annotations

Date: 2026-08-20  
Branch: `codex/frontend-rebuild`  
Deployment: not performed or authorized

## Completed annotations

- Header and footer use the exact MonoMind mark without a white/light swatch.
- Models, Leaderboards, Articles, and Language open as bounded anchored panels
  instead of full-width strips. Selection, outside pointer, and Escape dismiss
  the panel; Language retains search and its two-column menu.
- The shared footer marketing form now has a semantic accent wash, stronger
  border/elevation, clearer inputs, and a more prominent CTA in both themes.
- Both Subscribe-vs-API evidence tables retain every column and fit their
  desktop grid cells without a nested scrollbar at the 1691px review width.
  Narrow screens keep table-local scrolling and do not create page overflow.
- Popular Models desktop result rows are vertically centered.
- Leaderboard and Insights category controls are non-wrapping horizontal
  strips on narrow screens.
- Popular Models comparison actions occupy the top-right section-header rail on
  desktop and wrap beneath the heading on mobile.
- The Compare models CTA links to `/compare?models=<ordered IDs>`; the local
  evidence selection resolves to `models=alpha,beta` and keeps order.

## Subscription monitoring decision

The active daily `tokenbench-subscription-plan-monitor` automation is limited
to ChatGPT/OpenAI, Claude/Anthropic, Gemini/Google, Grok/xAI, GLM Coding/Z.ai,
Perplexity, and Microsoft Copilot. Official provider pages are primary and AI
Pricing Guru is a discrepancy check. See `subscription-monitor.md` for the
normalization, robots, review, and publication boundaries.

## Verification

- Popular Models projection tests: 13 passed.
- Root TypeScript: passed.
- Next ESLint and production build: passed.
- Impeccable layout detector: no findings.
- Browser checks: bounded menu panels do not alter the 65px header height;
  outside-click and Escape close correctly; language remains searchable and
  two-column; both subscription table hosts measured equal client/scroll width
  at 1691px; 390px rendering had no page-level overflow.
- `git diff --check`: passed.
