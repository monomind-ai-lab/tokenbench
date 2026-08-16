# Articles mega-menu channel design

## Outcome

Keep the shared Articles mega menu and the article-index tabs on one channel contract. The mega menu will expose `All`, `Guides`, `Insights`, and `News`, and its supporting description will read `Everything about AI models`.

## Navigation contract

The shared mega menu will use these destinations:

- `All` → `/articles`
- `Guides` → `/articles?channel=guides`
- `Insights` → `/articles?channel=insights`
- `News` → `/articles?channel=news`

The article-index tabs will use the same labels and plural channel identifiers. Existing guide and insight cards will migrate from the singular `guide` and `insight` data values to `guides` and `insights`. News will be a visible tab with a count of zero and will use the page's existing empty-result treatment until News content is available.

## State flow

On page load, the article index will read the `channel` query parameter and activate the matching tab. Valid channel values will be derived from the rendered tabs instead of maintained in a separate hard-coded allowlist. Missing or invalid values will fall back to `All`.

Selecting a tab will update the URL without a reload, filter cards by the shared channel identifier, update the tab-panel label, and retain the existing keyboard navigation behavior. Selecting News will produce the standard empty state rather than an error.

## Scope

This change is limited to the shared Articles mega menu, article-index tabs, channel data values, and their browser behavior. It does not create News articles, change article-topic filters, or redesign the mega-menu layout.

## Verification

Browser coverage will verify:

- The Articles mega menu has the four requested labels, destinations, and revised description.
- Direct navigation to each channel URL activates the matching tab.
- Guides and Insights retain their current article counts.
- News activates successfully and displays the existing empty state.
- Tab clicks write the plural query values.
- The shared header remains functional without console errors.
