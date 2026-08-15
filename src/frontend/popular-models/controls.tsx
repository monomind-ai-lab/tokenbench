import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { BenchmarkCategoryKey } from './types';

interface PopularLeaderboardControlsProps {
  readonly search: string;
  readonly onSearchChange: (value: string) => void;
  readonly openWeightsOnly: boolean;
  readonly onOpenWeightsOnlyChange: (value: boolean) => void;
  readonly excludeFinetunes: boolean;
  readonly onExcludeFinetunesChange: (value: boolean) => void;
  readonly showOrganization: boolean;
  readonly onShowOrganizationChange: (value: boolean) => void;
  readonly organizations: readonly string[];
  readonly selectedOrganizations: readonly string[];
  readonly onSelectedOrganizationsChange: (value: readonly string[]) => void;
  readonly activeCategory: BenchmarkCategoryKey | 'all';
  readonly categories: readonly BenchmarkCategoryKey[];
  readonly categoryLabels: Readonly<Record<BenchmarkCategoryKey, string>>;
  readonly onCategoryChange: (value: BenchmarkCategoryKey | 'all') => void;
  readonly resultCount: number;
}

function toggle(values: readonly string[], value: string): readonly string[] {
  return values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value];
}

function OrganizationFilter({
  organizations,
  selectedOrganizations,
  onChange,
}: Pick<PopularLeaderboardControlsProps, 'organizations' | 'selectedOrganizations'> & {
  readonly onChange: (value: readonly string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const panelId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const visibleOrganizations = organizations.filter((organization) => organization.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  return <div ref={rootRef} className="popular-models-organization-filter">
    <button
      className="popular-models-control-button popular-models-touch-target"
      type="button"
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-controls={panelId}
      onClick={() => setIsOpen((open) => !open)}
    >
      <span>Organizations{selectedOrganizations.length ? ` (${selectedOrganizations.length})` : ''}</span>
      <ChevronDown aria-hidden="true" size={16} />
    </button>
    {isOpen ? <div id={panelId} className="popular-models-organization-popover" role="dialog" aria-label="Filter by organization">
      <label className="popular-models-organization-search-label">
        <span className="popular-models-sr-only">Search organizations</span>
        <Search aria-hidden="true" size={16} />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search organizations"
        />
      </label>
      <div className="popular-models-organization-options" role="group" aria-label="Organizations">
        {visibleOrganizations.map((organization) => {
          const selected = selectedOrganizations.includes(organization);
          return <button
            key={organization}
            className="popular-models-organization-option popular-models-touch-target"
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(toggle(selectedOrganizations, organization))}
          >
            <span className="popular-models-option-check" aria-hidden="true">{selected ? <Check size={15} /> : null}</span>
            <span>{organization}</span>
          </button>;
        })}
        {visibleOrganizations.length === 0 ? <p className="popular-models-empty-organizations">No organizations match.</p> : null}
      </div>
      {selectedOrganizations.length ? <button
        className="popular-models-clear-selection popular-models-touch-target"
        type="button"
        onClick={() => onChange([])}
      ><X aria-hidden="true" size={15} /> Clear organizations</button> : null}
    </div> : null}
  </div>;
}

function ToggleButton({ label, pressed, onPressedChange }: {
  readonly label: string;
  readonly pressed: boolean;
  readonly onPressedChange: (value: boolean) => void;
}) {
  return <button
    className="popular-models-toggle-button popular-models-touch-target"
    type="button"
    aria-pressed={pressed}
    onClick={() => onPressedChange(!pressed)}
  >
    <span className="popular-models-toggle-indicator" aria-hidden="true">{pressed ? <Check size={15} /> : null}</span>
    {label}
  </button>;
}

export function PopularLeaderboardControls({
  search,
  onSearchChange,
  openWeightsOnly,
  onOpenWeightsOnlyChange,
  excludeFinetunes,
  onExcludeFinetunesChange,
  showOrganization,
  onShowOrganizationChange,
  organizations,
  selectedOrganizations,
  onSelectedOrganizationsChange,
  activeCategory,
  categories,
  categoryLabels,
  onCategoryChange,
  resultCount,
}: PopularLeaderboardControlsProps) {
  return <div className="popular-models-controls">
    <div className="popular-models-controls-main">
      <label className="popular-models-search-label">
        <span className="popular-models-sr-only">Search models</span>
        <Search aria-hidden="true" size={17} />
        <input
          className="popular-models-search-input popular-models-touch-target"
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search models"
        />
      </label>
      <OrganizationFilter organizations={organizations} selectedOrganizations={selectedOrganizations} onChange={onSelectedOrganizationsChange} />
      <ToggleButton label="Open weights" pressed={openWeightsOnly} onPressedChange={onOpenWeightsOnlyChange} />
      <ToggleButton label="Exclude finetunes" pressed={excludeFinetunes} onPressedChange={onExcludeFinetunesChange} />
      <ToggleButton label="Show org" pressed={showOrganization} onPressedChange={onShowOrganizationChange} />
    </div>
    <div className="popular-models-controls-secondary">
      <div className="popular-models-category-tabs" role="group" aria-label="Benchmark categories">
        <button className="popular-models-category-tab popular-models-touch-target" type="button" aria-pressed={activeCategory === 'all'} onClick={() => onCategoryChange('all')}>All</button>
        {categories.map((category) => <button
          key={category}
          className="popular-models-category-tab popular-models-touch-target"
          type="button"
          aria-pressed={activeCategory === category}
          onClick={() => onCategoryChange(category)}
        >{categoryLabels[category]}</button>)}
      </div>
    </div>
    <p className="popular-models-result-count" role="status" aria-live="polite">{resultCount} {resultCount === 1 ? 'model' : 'models'} shown</p>
  </div>;
}
