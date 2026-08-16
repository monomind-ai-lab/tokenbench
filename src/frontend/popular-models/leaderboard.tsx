import { Fragment, useId, useMemo, useState, type MouseEvent } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { PopularLeaderboardControls } from './controls';
import { POPULAR_CATEGORY_KEYS, POPULAR_CATEGORY_LABELS } from './fixtures';
import { formatPopularCost, topFivePopularModelIds } from './scoring';
import { PopularSectionActions } from './section-actions';
import type {
  BenchmarkCategoryKey,
  PopularModelFixture,
  PopularModelSubtaskDetail,
  PopularSortDirection,
  PopularSortKey,
} from './types';

interface PopularLeaderboardSectionProps {
  readonly models: readonly PopularModelFixture[];
  readonly onCopyLink: (sectionId: string) => void;
  readonly onDownloadPng: (sectionId: string) => void;
  readonly onDownloadCsv: (models: readonly PopularModelFixture[]) => void;
}

type CategorySelection = BenchmarkCategoryKey | 'all';
type TableSortKey = PopularSortKey | `subtask:${BenchmarkCategoryKey}:${string}`;

interface PopularScoreColumn {
  readonly key: TableSortKey;
  readonly label: string;
  readonly value: (model: PopularModelFixture) => number;
  readonly highlightedIds: ReadonlySet<string>;
}

function modelHref(model: PopularModelFixture): string {
  return `/model-profile?model=${encodeURIComponent(model.slug)}`;
}

function formatScore(value: number): string {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

function metricValue(model: PopularModelFixture, key: TableSortKey): number {
  if (key === 'overallScore') return model.overallScore;
  if (key === 'costPerSuccessfulTask') return model.costPerSuccessfulTask;
  if (key === 'outputCostPerMillion') return model.outputCostPerMillion;
  if (key === 'verbosityTokens') return model.verbosityTokens;
  if (!key.startsWith('subtask:')) return model.categoryScores[key];
  const [, category, subtaskId] = key.split(':') as [string, BenchmarkCategoryKey, string];
  return model.categorySubtasks[category].find((subtask) => subtask.id === subtaskId)?.score ?? 0;
}

function defaultDirection(key: TableSortKey): PopularSortDirection {
  return key === 'costPerSuccessfulTask' || key === 'outputCostPerMillion' || key === 'verbosityTokens'
    ? 'ascending'
    : 'descending';
}

function sortModels(models: readonly PopularModelFixture[], key: TableSortKey, direction: PopularSortDirection): readonly PopularModelFixture[] {
  const multiplier = direction === 'ascending' ? 1 : -1;
  return [...models].sort((left, right) => {
    const difference = metricValue(left, key) - metricValue(right, key);
    return difference === 0 ? left.name.localeCompare(right.name) : difference * multiplier;
  });
}

function subtaskTopFiveIds(models: readonly PopularModelFixture[], key: TableSortKey): ReadonlySet<string> {
  return new Set(sortModels(models, key, 'descending').slice(0, 5).map((model) => model.id));
}

function scoreColumns(
  models: readonly PopularModelFixture[],
  activeCategory: CategorySelection,
): readonly PopularScoreColumn[] {
  if (activeCategory === 'all') {
    return [
      {
        key: 'overallScore',
        label: 'Overall',
        value: (model) => model.overallScore,
        highlightedIds: new Set(topFivePopularModelIds(models, 'overallScore')),
      },
      ...POPULAR_CATEGORY_KEYS.map((category): PopularScoreColumn => ({
        key: category,
        label: POPULAR_CATEGORY_LABELS[category],
        value: (model) => model.categoryScores[category],
        highlightedIds: new Set(topFivePopularModelIds(models, category)),
      })),
    ];
  }

  const categoryColumn: PopularScoreColumn = {
    key: activeCategory,
    label: POPULAR_CATEGORY_LABELS[activeCategory],
    value: (model) => model.categoryScores[activeCategory],
    highlightedIds: new Set(topFivePopularModelIds(models, activeCategory)),
  };
  const subtasks = models[0]?.categorySubtasks[activeCategory] ?? [];
  return [categoryColumn, ...subtasks.map((subtask): PopularScoreColumn => {
    const key = `subtask:${activeCategory}:${subtask.id}` as const;
    return {
      key,
      label: subtask.label,
      value: (model) => metricValue(model, key),
      highlightedIds: subtaskTopFiveIds(models, key),
    };
  })];
}

function SortButton({ label, sortKey, activeSort, direction, onSort }: {
  readonly label: string;
  readonly sortKey: TableSortKey;
  readonly activeSort: TableSortKey;
  readonly direction: PopularSortDirection;
  readonly onSort: (key: TableSortKey) => void;
}) {
  const active = sortKey === activeSort;
  const Icon = active ? direction === 'ascending' ? ChevronUp : ChevronDown : ChevronsUpDown;
  return <button className="popular-models-sort-button popular-models-touch-target" type="button" onClick={() => onSort(sortKey)} aria-label={`Sort by ${label}${active ? `, currently ${direction}` : ''}`}>
    <span>{label}</span><Icon aria-hidden="true" size={14} />
  </button>;
}

function OpenBadge() {
  return <span className="popular-models-open-badge">Open</span>;
}

function ScoreValue({ model, column }: { readonly model: PopularModelFixture; readonly column: PopularScoreColumn }) {
  const highlighted = column.highlightedIds.has(model.id);
  return <span className={`popular-models-score${highlighted ? ' popular-models-score-top-five' : ''}`}>
    {highlighted ? <span className="popular-models-sr-only">Top five: </span> : null}
    {formatScore(column.value(model))}
  </span>;
}

function SubtaskBreakdown({ model, activeCategory }: { readonly model: PopularModelFixture; readonly activeCategory: CategorySelection }) {
  const categories = activeCategory === 'all' ? POPULAR_CATEGORY_KEYS : [activeCategory];
  return <div className="popular-models-subtask-drawer">
    {categories.map((category) => <section key={category} aria-label={`${POPULAR_CATEGORY_LABELS[category]} subtasks`}>
      <h3>{POPULAR_CATEGORY_LABELS[category]}</h3>
      <dl>{model.categorySubtasks[category].map((subtask) => <div key={subtask.id}><dt>{subtask.label}</dt><dd>{formatScore(subtask.score)}</dd></div>)}</dl>
    </section>)}
  </div>;
}

function ModelName({ model, showOrganization }: { readonly model: PopularModelFixture; readonly showOrganization?: boolean }) {
  return <div className="popular-models-model-identity">
    <span className="popular-models-model-name"><a href={modelHref(model)}>{model.name}</a>{model.openWeights ? <OpenBadge /> : null}</span>
    {showOrganization ? <span className="popular-models-organization-name">{model.organization}</span> : null}
  </div>;
}

function rowClick(event: MouseEvent<HTMLElement>, onToggle: () => void): void {
  if ((event.target as HTMLElement).closest('a, button, input, select, label')) return;
  onToggle();
}

export function PopularLeaderboardSection({ models, onCopyLink, onDownloadPng, onDownloadCsv }: PopularLeaderboardSectionProps) {
  const headingId = useId();
  const [search, setSearch] = useState('');
  const [openWeightsOnly, setOpenWeightsOnly] = useState(false);
  const [excludeFinetunes, setExcludeFinetunes] = useState(false);
  const [showOrganization, setShowOrganization] = useState(true);
  const [selectedOrganizations, setSelectedOrganizations] = useState<readonly string[]>([]);
  const [activeCategory, setActiveCategory] = useState<CategorySelection>('all');
  const [activeSort, setActiveSort] = useState<TableSortKey>('overallScore');
  const [sortDirection, setSortDirection] = useState<PopularSortDirection>('descending');
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());

  const organizations = useMemo(() => [...new Set(models.map((model) => model.organization))].sort((left, right) => left.localeCompare(right)), [models]);
  const filteredModels = useMemo(() => models.filter((model) => {
    const query = search.trim().toLocaleLowerCase();
    return (!query || `${model.name} ${model.organization}`.toLocaleLowerCase().includes(query))
      && (!openWeightsOnly || model.openWeights)
      && (!excludeFinetunes || !model.finetune)
      && (selectedOrganizations.length === 0 || selectedOrganizations.includes(model.organization));
  }), [excludeFinetunes, models, openWeightsOnly, search, selectedOrganizations]);
  const visibleModels = useMemo(() => sortModels(filteredModels, activeSort, sortDirection), [activeSort, filteredModels, sortDirection]);
  const columns = useMemo(() => scoreColumns(visibleModels, activeCategory), [activeCategory, visibleModels]);
  const costHighlightedIds = useMemo(() => new Set(topFivePopularModelIds(visibleModels, 'costPerSuccessfulTask')), [visibleModels]);

  const chooseCategory = (category: CategorySelection) => {
    setActiveCategory(category);
    const nextSort: TableSortKey = category === 'all' ? 'overallScore' : category;
    setActiveSort(nextSort);
    setSortDirection('descending');
  };
  const chooseSort = (key: TableSortKey) => {
    if (key === activeSort) setSortDirection((current) => current === 'ascending' ? 'descending' : 'ascending');
    else {
      setActiveSort(key);
      setSortDirection(defaultDirection(key));
    }
  };
  const toggleExpanded = (id: string) => setExpandedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const columnCount = 4 + columns.length + (showOrganization ? 1 : 0);

  return <section id="popular-models-leaderboard" className="popular-models-section" aria-labelledby={headingId}>
    <div className="popular-models-heading-row">
      <div><h2 id={headingId}><span className="popular-models-section-index">01</span><span>Leaderboard</span></h2><p>Search, filter, sort, and expand each model to inspect the illustrative subtask profile.</p></div>
      <PopularSectionActions
        label="Popular models leaderboard"
        onCopyLink={() => onCopyLink('popular-models-leaderboard')}
        onDownloadPng={() => onDownloadPng('popular-models-leaderboard')}
        onDownloadCsv={() => onDownloadCsv(visibleModels)}
      />
    </div>
    <PopularLeaderboardControls
      search={search}
      onSearchChange={setSearch}
      openWeightsOnly={openWeightsOnly}
      onOpenWeightsOnlyChange={setOpenWeightsOnly}
      excludeFinetunes={excludeFinetunes}
      onExcludeFinetunesChange={setExcludeFinetunes}
      showOrganization={showOrganization}
      onShowOrganizationChange={setShowOrganization}
      organizations={organizations}
      selectedOrganizations={selectedOrganizations}
      onSelectedOrganizationsChange={setSelectedOrganizations}
      activeCategory={activeCategory}
      categories={POPULAR_CATEGORY_KEYS}
      categoryLabels={POPULAR_CATEGORY_LABELS}
      onCategoryChange={chooseCategory}
      resultCount={visibleModels.length}
    />

    <div className="popular-models-desktop-table" role="region" aria-label="Scrollable popular model leaderboard" tabIndex={0}>
      <table>
        <thead><tr>
          <th scope="col"><span className="popular-models-sr-only">Expand subtasks</span></th>
          <th scope="col">#</th>
          <th scope="col">Model</th>
          {showOrganization ? <th scope="col">Provider</th> : null}
          {columns.map((column) => <th key={column.key} scope="col" aria-sort={activeSort === column.key ? sortDirection : 'none'}><SortButton label={column.label} sortKey={column.key} activeSort={activeSort} direction={sortDirection} onSort={chooseSort} /></th>)}
          <th scope="col" aria-sort={activeSort === 'costPerSuccessfulTask' ? sortDirection : 'none'}><SortButton label="Cost / task" sortKey="costPerSuccessfulTask" activeSort={activeSort} direction={sortDirection} onSort={chooseSort} /></th>
        </tr></thead>
        <tbody>{visibleModels.map((model, index) => {
          const expanded = expandedIds.has(model.id);
          const drawerId = `popular-model-subtasks-${model.id}`;
          return <Fragment key={model.id}>
            <tr className="popular-models-data-row" data-expanded={expanded} onClick={(event) => rowClick(event, () => toggleExpanded(model.id))}>
              <td><button className="popular-models-row-toggle" type="button" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${model.name} subtasks`} aria-expanded={expanded} aria-controls={drawerId} onClick={() => toggleExpanded(model.id)}>{expanded ? <ChevronDown aria-hidden="true" size={17} /> : <ChevronRight aria-hidden="true" size={17} />}</button></td>
              <td className="popular-models-rank">{index + 1}</td>
              <th scope="row"><ModelName model={model} /></th>
              {showOrganization ? <td className="popular-models-organization-cell">{model.organization}</td> : null}
              {columns.map((column) => <td key={column.key}><ScoreValue model={model} column={column} /></td>)}
              <td><span className={`popular-models-score${costHighlightedIds.has(model.id) ? ' popular-models-score-top-five' : ''}`}>{costHighlightedIds.has(model.id) ? <span className="popular-models-sr-only">Five lowest costs: </span> : null}{formatPopularCost(model.costPerSuccessfulTask)}</span></td>
            </tr>
            {expanded ? <tr id={drawerId} className="popular-models-drawer-row"><td colSpan={columnCount}><SubtaskBreakdown model={model} activeCategory={activeCategory} /></td></tr> : null}
          </Fragment>;
        })}</tbody>
      </table>
    </div>

    <ol className="popular-models-mobile-cards" aria-label="Popular model results">
      {visibleModels.map((model, index) => {
        const expanded = expandedIds.has(model.id);
        const drawerId = `popular-model-mobile-subtasks-${model.id}`;
        return <li key={model.id} className="popular-models-mobile-card" onClick={(event) => rowClick(event, () => toggleExpanded(model.id))}>
          <div className="popular-models-card-heading"><span className="popular-models-rank">#{index + 1}</span><ModelName model={model} showOrganization={showOrganization} /><button className="popular-models-row-toggle" type="button" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${model.name} subtasks`} aria-expanded={expanded} aria-controls={drawerId} onClick={() => toggleExpanded(model.id)}>{expanded ? <ChevronDown aria-hidden="true" size={17} /> : <ChevronRight aria-hidden="true" size={17} />}</button></div>
          <dl className="popular-models-card-scores">
            {(activeCategory === 'all' ? columns.slice(0, 1) : columns).map((column) => <div key={column.key}><dt>{column.label}</dt><dd><ScoreValue model={model} column={column} /></dd></div>)}
            <div><dt>Cost / task</dt><dd><span className={`popular-models-score${costHighlightedIds.has(model.id) ? ' popular-models-score-top-five' : ''}`}>{costHighlightedIds.has(model.id) ? <span className="popular-models-sr-only">Five lowest costs: </span> : null}{formatPopularCost(model.costPerSuccessfulTask)}</span></dd></div>
          </dl>
          {activeCategory === 'all' ? <details className="popular-models-mobile-score-details"><summary>7 category scores</summary><dl className="popular-models-card-scores">{columns.slice(1).map((column) => <div key={column.key}><dt>{column.label}</dt><dd><ScoreValue model={model} column={column} /></dd></div>)}</dl></details> : null}
          {expanded ? <div id={drawerId}><SubtaskBreakdown model={model} activeCategory={activeCategory} /></div> : null}
        </li>;
      })}
    </ol>
    {visibleModels.length === 0 ? <p className="popular-models-empty-state" role="status">No models match these filters. Clear a filter or try another search.</p> : null}
  </section>;
}
