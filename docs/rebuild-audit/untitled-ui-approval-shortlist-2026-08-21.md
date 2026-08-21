# Untitled UI approval shortlist — 2026-08-21

The retained local Untitled UI primitives are intentionally limited to the namespaced data-value layer: activity feed, filter bar, compact metrics, and table framing. They use TokenBench's existing blue tokens; no Untitled global theme was imported.

The following are optional upgrades only. None is approved or applied by this change.

| Screenshot | Component name | Target | Benefit | Risk |
| --- | --- | --- | --- | --- |
| Browser QA: `/models/`, 1440×1000, dark | `filter-dropdown-menu` | Models workbench advanced facets | Adds keyboard-friendly multi-select provider, route, and capability facets beside the existing compact filter bar. | Changes established URL/filter semantics and can make the current scan-friendly controls denser. |
| Browser QA: `/model-profile/?model=alpha`, 1440×1000, light | `table` sortable/selection variants | Models and future benchmark listings | Could add explicit sort affordances and selectable detail rows where the service supports stable ordering. | Sorting/selection requires route-query and accessibility review; it could imply a ranking that the evidence does not publish. |
| Browser QA: `/model-profile/?model=alpha`, 390×844, light | `activity-feed` connected variants | Data Sources and profile provenance sections | Can make verified chronology easier to scan when source events are genuinely ordered. | A connected timeline could wrongly imply that every provenance receipt is an activity event; requires source-event typing first. |
| Browser QA: `/subscribe-vs-api/`, 1440×1000, light | `table` expandable detail variant | Plan entitlement dimensions | Could keep larger provider entitlement matrices compact while retaining keyboard access to direct source facts. | More disclosure state may hide limits too aggressively; requires evidence and responsive review. |

## Reader-facing unavailable-value sweep

The integrated Model Profile, Models workbench, Compare, Lifecycle, and Subscribe-vs-API surfaces render absent factual values as an accessible `-` through `DataValueText`/`DataText`: the dash carries its source reason in both a title and screen-reader text. This includes table cells, metric cards, route meters, comparison cells, plan annual amounts, and entitlement bounds.

Intentional narrative uses of “unavailable” remain in error, empty-state, chart-unavailable, preview/caveat, and explanatory copy. Those sentences describe a missing response or why a visualization cannot be drawn; they are not substituted numeric or categorical values.
