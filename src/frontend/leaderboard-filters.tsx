import type { LeaderboardSort } from '../benchmarks/leaderboards';
import { LEADERBOARD_DEFINITIONS } from '../benchmarks/leaderboards';
import { normalizeLeaderboardQueryState } from '../benchmarks/leaderboard-query';
import type { LeaderboardKey } from '../routing/routes';
import {
  leaderboardFilterCapabilities,
  type LeaderboardFilterState,
  type LeaderboardQueryCapabilities,
} from './leaderboard-filter-state';

export {
  defaultLeaderboardFilters,
  parseLeaderboardFilters,
  serializeLeaderboardFilters,
  visibleLeaderboardEntries,
} from './leaderboard-filter-state';
export type { LeaderboardFilterState } from './leaderboard-filter-state';

interface LeaderboardFiltersProps {
  readonly keyName: LeaderboardKey;
  readonly filters: LeaderboardFilterState;
  readonly onChange: (filters: LeaderboardFilterState) => void;
  readonly capabilities?: LeaderboardQueryCapabilities;
}

const SORT_OPTIONS: readonly { readonly value: LeaderboardSort; readonly label: string }[] = [
  { value: 'score-desc', label: 'Capability score' },
  { value: 'rank-asc', label: 'Source rank' },
  { value: 'pareto-score-desc', label: 'Value frontier' },
  { value: 'price-asc', label: 'Price per 1M' },
  { value: 'context-desc', label: 'Context window' },
];

function toggle(values: readonly string[], value: string): readonly string[] {
  const next = values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
  return next.slice().sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function parseOptionalPrice(value: string): number | null {
  if (value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function sortLabel(keyName: LeaderboardKey, sort: LeaderboardSort): string {
  if (keyName === 'multimodal-vision-documents' && sort === 'score-desc') return 'Source lens order';
  return SORT_OPTIONS.find((option) => option.value === sort)?.label ?? sort;
}

function FilterChecks({
  legend,
  values,
  selected,
  onToggle,
}: {
  readonly legend: string;
  readonly values: readonly string[];
  readonly selected: readonly string[];
  readonly onToggle: (value: string) => void;
}) {
  return <fieldset className="leaderboard-filter-field leaderboard-check-filter">
    <legend>{legend}</legend>
    <div className="leaderboard-check-options">
      {values.map((value) => <label key={value}>
        <input
          type="checkbox"
          checked={selected.includes(value)}
          onChange={() => onToggle(value)}
        />
        <span>{value}</span>
      </label>)}
    </div>
  </fieldset>;
}

export function LeaderboardFilters({ keyName, filters, onChange, capabilities }: LeaderboardFiltersProps) {
  const routeCapabilities = capabilities ?? leaderboardFilterCapabilities(keyName);
  const update = (changes: Partial<LeaderboardFilterState>) => onChange(normalizeLeaderboardQueryState(
    { ...filters, ...changes },
    LEADERBOARD_DEFINITIONS[keyName],
    routeCapabilities,
  ));
  const sortOptions = SORT_OPTIONS.filter((option) => routeCapabilities.sorts.includes(option.value));

  return (
    <form className="leaderboard-filters" aria-label="Leaderboard filters" onSubmit={(event) => event.preventDefault()}>
      <label className="leaderboard-filter-field leaderboard-search-field">
        <span>Search model or provider</span>
        <input
          type="search"
          value={filters.query}
          onChange={(event) => update({ query: event.target.value })}
          placeholder="Search model or provider"
        />
      </label>

      {routeCapabilities.supportsProfile ? <fieldset className="leaderboard-filter-field leaderboard-profile-field">
        <legend>Workload profile</legend>
        <div className="leaderboard-profile-options">
          {([
            ['inputHeavy', 'Input-heavy'],
            ['balanced', 'Balanced'],
            ['outputHeavy', 'Output-heavy'],
          ] as const).map(([profile, label]) => (
            <label key={profile}>
              <input
                type="radio"
                name={`workload-profile-${keyName}`}
                checked={filters.profile === profile}
                onChange={() => update({ profile })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset> : null}

      {routeCapabilities.metricKeys.length > 1 ? <label className="leaderboard-filter-field">
        <span>Metric lens</span>
        <select
          aria-label="Metric lens"
          value={filters.metricKey ?? ''}
          onChange={(event) => update({ metricKey: event.target.value || null })}
        >
          <option value="">All published lenses</option>
          {routeCapabilities.metricKeys.map((metricKey) => <option key={metricKey} value={metricKey}>{metricKey}</option>)}
        </select>
      </label> : null}

      {sortOptions.length > 1 ? <label className="leaderboard-filter-field">
        <span>Sort leaderboard</span>
        <select value={filters.sort} onChange={(event) => {
          const sort = event.target.value as LeaderboardSort;
          if (routeCapabilities.sorts.includes(sort)) update({ sort });
        }}>
          {sortOptions.map((option) => <option key={option.value} value={option.value}>{sortLabel(keyName, option.value)}</option>)}
        </select>
      </label> : null}

      {routeCapabilities.providers && routeCapabilities.providers.length > 1 ? <FilterChecks
        legend="Providers"
        values={routeCapabilities.providers}
        selected={filters.providers}
        onToggle={(provider) => update({ providers: toggle(filters.providers, provider) })}
      /> : null}

      {routeCapabilities.sourceTypes && routeCapabilities.sourceTypes.length > 1 ? <FilterChecks
        legend="Source type"
        values={routeCapabilities.sourceTypes}
        selected={filters.sourceTypes}
        onToggle={(sourceType) => update({ sourceTypes: toggle(filters.sourceTypes, sourceType) as LeaderboardFilterState['sourceTypes'] })}
      /> : null}

      {routeCapabilities.evidenceStatuses && routeCapabilities.evidenceStatuses.length > 0 ? <label className="leaderboard-filter-field">
        <span>Evidence</span>
        <select aria-label="Evidence" value={filters.evidence ?? ''} onChange={(event) => update({ evidence: event.target.value || null })}>
          <option value="">All evidence</option>
          {routeCapabilities.evidenceStatuses.map((status) => <option key={status} value={status}>{status === 'source_only' ? 'Source-only' : status[0].toUpperCase() + status.slice(1)}</option>)}
        </select>
      </label> : null}

      {routeCapabilities.supportsPrice ? <fieldset className="leaderboard-filter-field leaderboard-price-filter">
        <legend>Price per 1M</legend>
        <div className="leaderboard-price-inputs">
          <label><span>Minimum</span><input aria-label="Minimum price per 1M" type="number" min="0" step="any" value={filters.priceMinimum ?? ''} onChange={(event) => update({ priceMinimum: parseOptionalPrice(event.target.value) })} /></label>
          <label><span>Maximum</span><input aria-label="Maximum price per 1M" type="number" min="0" step="any" value={filters.priceMaximum ?? ''} onChange={(event) => update({ priceMaximum: parseOptionalPrice(event.target.value) })} /></label>
        </div>
      </fieldset> : null}

      {routeCapabilities.supportsEstimated ? <label className="leaderboard-estimated-control">
        <input
          type="checkbox"
          aria-label="Include estimated BenchLM models"
          checked={filters.includeEstimated}
          onChange={(event) => update({ includeEstimated: event.target.checked })}
        />
        <span>Include estimated BenchLM models</span>
        <small>Estimated records remain visibly unranked and never receive leader badges.</small>
      </label> : null}
    </form>
  );
}
