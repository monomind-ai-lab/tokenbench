import { Check } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { LeaderboardSort } from '../benchmarks/leaderboards';
import { LEADERBOARD_DEFINITIONS } from '../benchmarks/leaderboards';
import { normalizeLeaderboardQueryState } from '../benchmarks/leaderboard-query';
import type { LeaderboardKey } from '../routing/routes';
import {
  leaderboardFilterCapabilities,
  type LeaderboardFilterState,
  type LeaderboardQueryCapabilities,
} from './leaderboard-filter-state';
import {
  createLeaderboardPriceDomain,
  priceBoundsAt,
  type LeaderboardPriceDomain,
} from './leaderboard-price-domain';

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

const METRIC_LENS_LABELS: Readonly<Record<string, string>> = {
  'benchlm:overall:raw': 'Overall',
  'benchlm:category:coding': 'Coding',
  'benchlm:category:agentic': 'Agentic',
  'benchlm:category:reasoning': 'Reasoning',
  'benchlm:category:knowledge': 'Knowledge',
  'benchlm:category:multimodal': 'Multimodal',
  'lmarena:text_style_control:overall': 'Human preference',
  'lmarena:vision_style_control:overall': 'Vision',
  'lmarena:document_style_control:overall': 'Documents',
  'lmarena:text_to_image:overall': 'Text to image',
  'lmarena:image_edit:overall': 'Image editing',
  'lmarena:text_to_video:overall': 'Text to video',
  'lmarena:image_to_video:overall': 'Image to video',
  'lmarena:video_edit:overall': 'Video editing',
};

const STRUCTURAL_METRIC_TOKENS = new Set(['category', 'overall', 'raw', 'style', 'control']);
const PRICE_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 4,
});

function toggle(values: readonly string[], value: string): readonly string[] {
  const next = values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
  return next.slice().sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function sortLabel(keyName: LeaderboardKey, sort: LeaderboardSort): string {
  if (keyName === 'multimodal-vision-documents' && sort === 'score-desc') return 'Source lens order';
  return SORT_OPTIONS.find((option) => option.value === sort)?.label ?? sort;
}

function metricLensLabel(metricKey: string): string {
  const known = METRIC_LENS_LABELS[metricKey];
  if (known) return known;
  const words = metricKey
    .split(':')
    .slice(1)
    .flatMap((segment) => segment.split(/[_-]+/))
    .map((word) => word.trim().toLocaleLowerCase())
    .filter((word) => word.length > 0 && !STRUCTURAL_METRIC_TOKENS.has(word));
  const fallback = words
    .map((word) => word[0]!.toLocaleUpperCase() + word.slice(1))
    .join(' ');
  return fallback || 'Published metric';
}

function formatPrice(value: number): string {
  return PRICE_FORMATTER.format(value);
}

function activePriceSummary(domain: LeaderboardPriceDomain): string | null {
  const bounds = priceBoundsAt(domain, domain.minimumIndex, domain.maximumIndex);
  if (bounds.priceMinimum !== null && bounds.priceMaximum !== null) {
    return `${formatPrice(bounds.priceMinimum)}–${formatPrice(bounds.priceMaximum)}`;
  }
  if (bounds.priceMinimum !== null) return `${formatPrice(bounds.priceMinimum)} or more`;
  if (bounds.priceMaximum !== null) return `Up to ${formatPrice(bounds.priceMaximum)}`;
  return null;
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

function ProviderTags({
  values,
  selected,
  onToggle,
}: {
  readonly values: readonly string[];
  readonly selected: readonly string[];
  readonly onToggle: (value: string) => void;
}) {
  return <fieldset className="leaderboard-filter-field leaderboard-provider-filter">
    <legend>Providers</legend>
    <div className="leaderboard-check-options leaderboard-provider-options">
      {values.map((value) => {
        const isSelected = selected.includes(value);
        return <button
          key={value}
          className="leaderboard-provider-tag"
          type="button"
          aria-pressed={isSelected}
          onClick={() => onToggle(value)}
        >
          {isSelected ? <Check aria-hidden="true" size={14} /> : null}
          <span>{value}</span>
        </button>;
      })}
    </div>
  </fieldset>;
}

function PriceFilter({
  keyName,
  domain,
  onChange,
}: {
  readonly keyName: LeaderboardKey;
  readonly domain: LeaderboardPriceDomain;
  readonly onChange: (minimumIndex: number, maximumIndex: number) => void;
}) {
  if (domain.publishedMinimum === domain.publishedMaximum) {
    const activeSummary = domain.values.length > 1 ? activePriceSummary(domain) : null;
    const publishedIndex = domain.values.indexOf(domain.publishedMinimum);
    return <fieldset className="leaderboard-filter-field leaderboard-price-filter">
      <legend>Price per 1M tokens</legend>
      <div className="leaderboard-single-price-published">
        <span>Published price</span>
        <output>{formatPrice(domain.publishedMinimum)}</output>
      </div>
      {activeSummary ? <div className="leaderboard-single-price-active">
        <span>Active filter</span>
        <output>{activeSummary}</output>
        <button type="button" className="button button-secondary button-small" onClick={() => onChange(publishedIndex, publishedIndex)}>Clear price filter</button>
      </div> : null}
    </fieldset>;
  }

  const lastIndex = domain.values.length - 1;
  const minimumId = `leaderboard-minimum-price-${keyName}`;
  const maximumId = `leaderboard-maximum-price-${keyName}`;
  const minimumFraction = domain.minimumIndex / lastIndex;
  const maximumFraction = domain.maximumIndex / lastIndex;
  const minimumPercent = minimumFraction * 100;
  const maximumPercent = maximumFraction * 100;
  const minimumShift = 22 * (1 - 2 * minimumFraction);
  const maximumShift = 22 * (1 - 2 * maximumFraction);
  const position = (percent: number, shift: number) => `calc(${percent}% ${shift < 0 ? '-' : '+'} ${Math.abs(shift)}px)`;
  const rangeTrackStyle = {
    '--range-start': `${minimumPercent}%`,
    '--range-end': `${maximumPercent}%`,
    '--range-start-position': position(minimumPercent, minimumShift),
    '--range-end-position': position(maximumPercent, maximumShift),
  } as CSSProperties & Record<
    '--range-start' | '--range-end' | '--range-start-position' | '--range-end-position',
    string
  >;
  return <fieldset className="leaderboard-filter-field leaderboard-price-filter">
    <legend>Price per 1M tokens</legend>
    <div className="leaderboard-price-values">
      <label htmlFor={minimumId}>
        <span>Minimum</span>
        <output htmlFor={minimumId}>{formatPrice(domain.values[domain.minimumIndex]!)}</output>
      </label>
      <label htmlFor={maximumId}>
        <span>Maximum</span>
        <output htmlFor={maximumId}>{formatPrice(domain.values[domain.maximumIndex]!)}</output>
      </label>
    </div>
    <div className="leaderboard-price-range-stack" style={rangeTrackStyle}>
      <input
        id={minimumId}
        aria-label="Minimum price per 1M tokens"
        aria-valuetext={formatPrice(domain.values[domain.minimumIndex]!)}
        type="range"
        min="0"
        max={lastIndex}
        step="1"
        value={domain.minimumIndex}
        onChange={(event) => {
          const proposedIndex = Number(event.currentTarget.value);
          onChange(Math.min(proposedIndex, domain.maximumIndex), domain.maximumIndex);
        }}
      />
      <input
        id={maximumId}
        aria-label="Maximum price per 1M tokens"
        aria-valuetext={formatPrice(domain.values[domain.maximumIndex]!)}
        type="range"
        min="0"
        max={lastIndex}
        step="1"
        value={domain.maximumIndex}
        onChange={(event) => {
          const proposedIndex = Number(event.currentTarget.value);
          onChange(domain.minimumIndex, Math.max(proposedIndex, domain.minimumIndex));
        }}
      />
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
  const dataReady = routeCapabilities.dataReady;
  const showMetric = dataReady && routeCapabilities.metricKeys.length > 1;
  const showSort = dataReady && sortOptions.length > 1;
  const showProviders = dataReady && (routeCapabilities.providers?.length ?? 0) > 1;
  const showSourceTypes = dataReady && (routeCapabilities.sourceTypes?.length ?? 0) > 1;
  const showEvidence = dataReady && (routeCapabilities.evidenceStatuses?.length ?? 0) > 0;
  const priceDomain = dataReady
    ? createLeaderboardPriceDomain(
      routeCapabilities.priceValues,
      filters.priceMinimum,
      filters.priceMaximum,
    )
    : null;
  const showSupplementary = routeCapabilities.supportsProfile
    || showSourceTypes;

  return (
    <form className="leaderboard-filters" aria-label="Leaderboard filters" onSubmit={(event) => event.preventDefault()}>
      <div className="leaderboard-filter-search-row">
        <label className="leaderboard-filter-field leaderboard-search-field">
          <span>Search model or provider</span>
          <input
            type="search"
            value={filters.query}
            onChange={(event) => update({ query: event.target.value })}
            placeholder="Search model or provider"
          />
        </label>
      </div>

      {showMetric || showSort || showEvidence ? <div className="leaderboard-filter-selector-row">
        {showMetric ? <label className="leaderboard-filter-field">
          <span>Metric lens</span>
          <select
            aria-label="Metric lens"
            value={filters.metricKey ?? ''}
            onChange={(event) => update({ metricKey: event.target.value || null })}
          >
            <option value="">All published lenses</option>
            {routeCapabilities.metricKeys.map((metricKey) => <option key={metricKey} value={metricKey}>{metricLensLabel(metricKey)}</option>)}
          </select>
        </label> : null}

        {showSort ? <label className="leaderboard-filter-field">
          <span>Sort leaderboard</span>
          <select value={filters.sort} onChange={(event) => {
            const sort = event.target.value as LeaderboardSort;
            if (routeCapabilities.sorts.includes(sort)) update({ sort });
          }}>
            {sortOptions.map((option) => <option key={option.value} value={option.value}>{sortLabel(keyName, option.value)}</option>)}
          </select>
        </label> : null}

        {showEvidence ? <label className="leaderboard-filter-field">
          <span>Evidence</span>
          <select aria-label="Evidence" value={filters.evidence ?? ''} onChange={(event) => update({ evidence: event.target.value || null })}>
            <option value="">All evidence</option>
            {routeCapabilities.evidenceStatuses!.map((status) => <option key={status} value={status}>{status === 'source_only' ? 'Source-only' : status[0].toUpperCase() + status.slice(1)}</option>)}
          </select>
        </label> : null}
      </div> : null}

      {showProviders ? <div className="leaderboard-filter-provider-row">
        <ProviderTags
          values={routeCapabilities.providers!}
          selected={filters.providers}
          onToggle={(provider) => update({ providers: toggle(filters.providers, provider) })}
        />
      </div> : null}

      {priceDomain || routeCapabilities.supportsEstimated ? <div className="leaderboard-filter-range-row">
        {priceDomain ? <PriceFilter
          keyName={keyName}
          domain={priceDomain}
          onChange={(minimumIndex, maximumIndex) => update(priceBoundsAt(priceDomain, minimumIndex, maximumIndex))}
        /> : null}

        {routeCapabilities.supportsEstimated ? <label className="leaderboard-estimated-control">
          <input
            type="checkbox"
            aria-label="Include estimated models"
            checked={filters.includeEstimated}
            onChange={(event) => update({ includeEstimated: event.target.checked })}
          />
          <span>Include estimated models</span>
          <small>Estimated entries stay unranked and do not receive leader badges.</small>
        </label> : null}
      </div> : null}

      {showSupplementary ? <div className="leaderboard-filter-supplementary-row">
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

        {showSourceTypes ? <FilterChecks
          legend="Source type"
          values={routeCapabilities.sourceTypes!}
          selected={filters.sourceTypes}
          onToggle={(sourceType) => update({ sourceTypes: toggle(filters.sourceTypes, sourceType) as LeaderboardFilterState['sourceTypes'] })}
        /> : null}

      </div> : null}
    </form>
  );
}
