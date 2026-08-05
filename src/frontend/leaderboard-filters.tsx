import { LEADERBOARD_DEFINITIONS, sortLeaderboardEntries, type LeaderboardEntry, type LeaderboardSort } from '../benchmarks/leaderboards';
import { isWorkloadProfile, type WorkloadProfile } from '../benchmarks/value';
import type { LeaderboardKey } from '../routing/routes';
import { supportsEstimatedModels } from './use-benchmarks';

export interface LeaderboardFilterState {
  readonly query: string;
  readonly profile: WorkloadProfile;
  readonly sort: LeaderboardSort;
  readonly includeEstimated: boolean;
}

interface LeaderboardFiltersProps {
  readonly keyName: LeaderboardKey;
  readonly filters: LeaderboardFilterState;
  readonly onChange: (filters: LeaderboardFilterState) => void;
}

const SORT_OPTIONS: readonly { readonly value: LeaderboardSort; readonly label: string }[] = [
  { value: 'score-desc', label: 'Capability score' },
  { value: 'rank-asc', label: 'Source rank' },
  { value: 'pareto-score-desc', label: 'Value frontier' },
  { value: 'price-asc', label: 'Blended cost' },
  { value: 'context-desc', label: 'Context window' },
];

function isLeaderboardSort(value: unknown): value is LeaderboardSort {
  return typeof value === 'string' && SORT_OPTIONS.some((option) => option.value === value);
}

export function defaultLeaderboardFilters(keyName: LeaderboardKey): LeaderboardFilterState {
  return {
    query: '',
    profile: 'balanced',
    sort: LEADERBOARD_DEFINITIONS[keyName].defaultSort,
    includeEstimated: false,
  };
}

/** Reads only URL state; it does not infer a benchmark result or model identity. */
export function parseLeaderboardFilters(search: string, keyName: LeaderboardKey): LeaderboardFilterState {
  const defaults = defaultLeaderboardFilters(keyName);
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const profile = params.get('profile');
  const sort = params.get('sort');
  return {
    query: params.get('q')?.trim() ?? '',
    profile: isWorkloadProfile(profile) ? profile : defaults.profile,
    sort: isLeaderboardSort(sort) ? sort : defaults.sort,
    includeEstimated: supportsEstimatedModels(keyName) && params.get('estimated') === '1',
  };
}

/** Stable parameter ordering makes a filtered view shareable and deterministic. */
export function serializeLeaderboardFilters(filters: LeaderboardFilterState): string {
  const params = new URLSearchParams({ profile: filters.profile, sort: filters.sort });
  const query = filters.query.trim();
  if (query) params.set('q', query);
  if (filters.includeEstimated) params.set('estimated', '1');
  return params.toString();
}

/** Keeps source-only lenses available while requiring an explicit choice for estimates. */
export function visibleLeaderboardEntries(
  entries: readonly LeaderboardEntry[],
  filters: LeaderboardFilterState,
  keyName: LeaderboardKey,
): readonly LeaderboardEntry[] {
  const query = filters.query.trim().toLocaleLowerCase();
  const matchesQuery = (entry: LeaderboardEntry) => {
    if (!query) return true;
    return [entry.model.name, entry.model.creator, entry.model.slug]
      .some((value) => value.toLocaleLowerCase().includes(query));
  };
  const ranked = entries.filter((entry) => entry.model.evidenceStatus !== 'estimated' && matchesQuery(entry));
  const estimates = filters.includeEstimated
    ? entries.filter((entry) => entry.model.evidenceStatus === 'estimated' && matchesQuery(entry)).slice().sort((left, right) => left.model.slug.localeCompare(right.model.slug))
    : [];
  const keepsMultimodalLensOrder = keyName === 'multimodal-vision-documents'
    && filters.sort === LEADERBOARD_DEFINITIONS[keyName].defaultSort;
  return [
    ...(keepsMultimodalLensOrder ? ranked : sortLeaderboardEntries(ranked, filters.sort)),
    ...estimates,
  ];
}

export function LeaderboardFilters({ keyName, filters, onChange }: LeaderboardFiltersProps) {
  const update = (changes: Partial<LeaderboardFilterState>) => onChange({ ...filters, ...changes });
  const canIncludeEstimated = supportsEstimatedModels(keyName);

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

      <fieldset className="leaderboard-filter-field leaderboard-profile-field">
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
      </fieldset>

      <label className="leaderboard-filter-field">
        <span>Sort leaderboard</span>
        <select value={filters.sort} onChange={(event) => {
          const sort = event.target.value;
          if (isLeaderboardSort(sort)) update({ sort });
        }}>
          {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>
            {keyName === 'multimodal-vision-documents' && option.value === 'score-desc'
              ? 'Source lens order'
              : option.label}
          </option>)}
        </select>
      </label>

      {canIncludeEstimated ? <label className="leaderboard-estimated-control">
        <input
          type="checkbox"
          aria-label="Include estimated BenchLM models"
          checked={filters.includeEstimated}
          onChange={(event) => update({ includeEstimated: event.target.checked })}
        />
        <span>Include estimated BenchLM models</span>
        <small>Supported and source-only evidence remain visible by default.</small>
      </label> : null}
    </form>
  );
}
