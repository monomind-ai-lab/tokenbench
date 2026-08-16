import { X } from 'lucide-react';
import type { ChartConfiguration } from 'chart.js';
import type { ReactNode } from 'react';
import { PopularChartCanvas } from './chart-canvas';
import { PopularModelPicker } from './model-picker';
import type { PopularModelFixture } from './types';

export interface PopularComparisonMetric {
  readonly id: string;
  readonly label: string;
  readonly value: (model: PopularModelFixture) => ReactNode;
}

interface PopularComparisonMatrixProps {
  readonly ariaLabel: string;
  readonly id: string;
  readonly models: readonly PopularModelFixture[];
  readonly rows: readonly PopularComparisonMetric[];
}

interface PopularComparisonEconomicsChart {
  readonly ariaLabel: string;
  readonly configuration: ChartConfiguration<'bar'>;
  readonly label: string;
}

interface PopularComparisonWorkspaceProps {
  readonly availableModels: readonly PopularModelFixture[];
  readonly decisionRows: readonly PopularComparisonMetric[];
  readonly detailRows: readonly PopularComparisonMetric[];
  readonly economicsCharts: readonly PopularComparisonEconomicsChart[];
  readonly maxModels: number;
  readonly onAdd: (modelId: string) => void;
  readonly onClear: () => void;
  readonly onRemove: (modelId: string) => void;
  readonly profileRows: readonly PopularComparisonMetric[];
  readonly radarConfiguration: ChartConfiguration<'radar'>;
  readonly selectedModels: readonly PopularModelFixture[];
}

function modelHref(model: PopularModelFixture): string {
  return `/model-profile?model=${encodeURIComponent(model.slug)}`;
}

export function previewComparisonHref(modelIds: readonly string[]): string {
  return `/compare?${new URLSearchParams({ models: modelIds.join(',') })}`;
}

/**
 * A model-column comparison primitive shared by every matrix in the Popular
 * Models workspace. On narrow screens it preserves metric-first reading order
 * as cards instead of making the page itself overflow horizontally.
 */
export function PopularComparisonMatrix({ ariaLabel, id, models, rows }: PopularComparisonMatrixProps) {
  return <div className="popular-models-comparison-matrix" id={id}>
    <div className="popular-models-comparison-matrix-table" role="region" aria-label={ariaLabel} tabIndex={0}>
      <table>
        <thead><tr><th className="popular-models-comparison-metric-column" scope="col">Metric</th>{models.map((model) => <th scope="col" key={model.id}><a href={modelHref(model)}>{model.name}</a><small>{model.organization}</small></th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}><th scope="row">{row.label}</th>{models.map((model) => <td key={model.id}>{row.value(model)}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <div className="popular-models-comparison-matrix-cards" role="list" aria-label={`${ariaLabel}, metric-first mobile view`}>
      {rows.map((row) => <section key={row.id} role="listitem"><h5>{row.label}</h5><dl>{models.map((model) => <div key={model.id}><dt><a href={modelHref(model)}>{model.name}</a></dt><dd>{row.value(model)}</dd></div>)}</dl></section>)}
    </div>
  </div>;
}

export function PopularModelComparisonWorkspace({
  availableModels,
  decisionRows,
  detailRows,
  economicsCharts,
  maxModels,
  onAdd,
  onClear,
  onRemove,
  profileRows,
  radarConfiguration,
  selectedModels,
}: PopularComparisonWorkspaceProps) {
  const canRemove = selectedModels.length > 2;
  const remaining = Math.max(0, maxModels - selectedModels.length);
  const names = selectedModels.map((model) => model.name).join(', ');

  return <article className="popular-models-insight-panel popular-models-profile-panel popular-models-comparison-workspace" id="best-models-compared" role="region" aria-labelledby="popular-models-quick-comparison-title">
    <div className="popular-models-comparison-heading">
      <div><span className="popular-models-comparison-kicker">Comparison workspace</span><h3 id="popular-models-quick-comparison-title">Quick comparison</h3><p>Start with the two highest-ranked Popular Models fixtures, then add up to two more for the same model-column analysis used on Compare.</p></div>
      <div className="popular-models-comparison-heading-actions"><button className="popular-models-action-button popular-models-touch-target popular-models-comparison-clear" type="button" aria-label="clear" onClick={onClear}>clear</button><div className="popular-models-comparison-progress" aria-live="polite"><span>Selected</span><strong>{selectedModels.length} / {maxModels}</strong></div></div>
    </div>

    <div className="popular-models-comparison-composer">
      <div className="popular-models-comparison-selected-block">
        <span className="popular-models-comparison-label">Selected models</span>
        <div className="popular-models-selected-models" role="list" aria-label="Selected comparison models">
          {selectedModels.map((model) => <span className="popular-models-model-tag" key={model.id} role="listitem"><a href={modelHref(model)}>{model.name}</a><button type="button" aria-label={`Remove ${model.name}`} title={canRemove ? `Remove ${model.name}` : 'Keep at least two models selected'} disabled={!canRemove} onClick={() => onRemove(model.id)}><X aria-hidden="true" size={14} /></button></span>)}
        </div>
        <PopularModelPicker models={availableModels} selectedCount={selectedModels.length} max={maxModels} onAdd={onAdd} />
      </div>
    </div>
    <p className="popular-models-comparison-status" role="status" aria-live="polite">{selectedModels.length} of {maxModels} models selected. {remaining === 0 ? 'Remove a model to add another.' : `Add up to ${remaining} more.`}</p>

    <div className="popular-models-comparison-summary">
      <section className="popular-models-comparison-subpanel popular-models-comparison-radar-panel" aria-labelledby="popular-models-comparison-radar-title">
        <div><h4 id="popular-models-comparison-radar-title">Seven-category capability overlay</h4><p>Normalized illustrative fixture scores · identical axes</p></div>
        <div className="popular-models-chart-wrap popular-models-radar-chart popular-models-quick-comparison-radar"><PopularChartCanvas ariaLabel={`Seven-category profile comparison for ${names}`} configuration={radarConfiguration} /></div>
        <details className="popular-models-comparison-details"><summary>Exact capability values</summary><PopularComparisonMatrix ariaLabel="Exact capability comparison" id="popular-models-capability-matrix" models={selectedModels} rows={profileRows} /></details>
      </section>

      <section className="popular-models-comparison-subpanel popular-models-comparison-decision-panel" aria-labelledby="popular-models-comparison-decision-title">
        <div><h4 id="popular-models-comparison-decision-title">Decision deltas</h4><p>Models are columns so the meaningful differences stay aligned.</p></div>
        <PopularComparisonMatrix ariaLabel="Selected model decision matrix" id="popular-models-decision-matrix" models={selectedModels} rows={decisionRows} />
      </section>
    </div>

    <section className="popular-models-comparison-subpanel popular-models-comparison-economics" aria-labelledby="popular-models-comparison-economics-title">
      <div><h4 id="popular-models-comparison-economics-title">Task economics and output profile</h4><p>Only evidence present in the Popular Models fixture is shown; input pricing, runtime, context, and lifecycle remain unavailable here.</p></div>
      <div className="popular-models-comparison-bars">{economicsCharts.map((chart) => <div key={chart.label}><span className="popular-models-comparison-label">{chart.label}</span><div className="popular-models-chart-wrap popular-models-comparison-bar-chart"><PopularChartCanvas ariaLabel={chart.ariaLabel} configuration={chart.configuration} /></div></div>)}</div>
    </section>

    <section className="popular-models-comparison-subpanel popular-models-comparison-evidence" aria-labelledby="popular-models-comparison-evidence-title">
      <div><h4 id="popular-models-comparison-evidence-title">Itemized benchmark and evidence</h4><p>Exact comparison values and fixture status, kept separate from production benchmark claims.</p></div>
      <PopularComparisonMatrix ariaLabel="Itemized model comparison" id="popular-models-evidence-matrix" models={selectedModels} rows={detailRows} />
      <p className="popular-models-comparison-fixture-note">Illustrative UI fixtures only · not measured benchmark, pricing, release, or availability evidence.</p>
    </section>
    <footer className="popular-models-comparison-footer"><a href={previewComparisonHref(selectedModels.map((model) => model.id))}>More details</a></footer>
  </article>;
}
