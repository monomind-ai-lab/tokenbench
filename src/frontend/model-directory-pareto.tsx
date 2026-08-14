import { useMemo, useState } from 'react';
import type { ChartConfiguration } from 'chart.js';
import type { EvidenceStatus } from '../benchmarks/contracts';
import { modelPath } from './model-directory-contracts';
import type { ModelDirectoryAttribution, ModelDirectoryEntry } from './model-directory-contracts';
import { TokenBenchChartCanvas } from './charts/chart-canvas';
import { addCompareModel, useCompareState } from './compare-state';
import { InspectionCard, type InspectionRecord } from './inspection-card';

export interface ModelParetoRow {
  readonly modelId: string;
  readonly slug: string;
  readonly name: string;
  readonly provider: string;
  readonly cost: number;
  readonly score: number;
  readonly frontier: boolean;
  readonly evidenceStatus: EvidenceStatus;
  readonly inputPrice: number;
  readonly outputPrice: number;
  readonly cachePrice: number | null;
  readonly context: number | null;
  readonly sourceUrl: string;
  readonly effectiveAt: string;
}

export interface ModelParetoExcludedRow {
  readonly modelId: string;
  readonly slug: string;
  readonly name: string;
  readonly reason: 'Missing score' | 'Missing input or output price';
}

export interface ModelParetoRows {
  readonly plotted: readonly ModelParetoRow[];
  readonly excluded: readonly ModelParetoExcludedRow[];
}

export interface ModelParetoWeights {
  readonly inputWeight: number;
  readonly outputWeight: number;
}

const DEFAULT_WEIGHTS: ModelParetoWeights = { inputWeight: 3, outputWeight: 1 };

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function weightedCost(input: number | null, output: number | null, weights: ModelParetoWeights): number | null {
  if (!finite(input) || !finite(output) || input < 0 || output < 0) return null;
  const total = weights.inputWeight + weights.outputWeight;
  if (!Number.isFinite(total) || total <= 0 || weights.inputWeight < 0 || weights.outputWeight < 0) return null;
  const cost = (input * weights.inputWeight + output * weights.outputWeight) / total;
  return Number.isFinite(cost) ? cost : null;
}

/** Creates a source-qualified Pareto set without placing incomplete records at zero. */
export function buildModelParetoRows(
  models: readonly ModelDirectoryEntry[],
  weights: ModelParetoWeights = DEFAULT_WEIGHTS,
): ModelParetoRows {
  const candidates: Array<Omit<ModelParetoRow, 'frontier'>> = [];
  const excluded: ModelParetoExcludedRow[] = [];

  for (const model of models) {
    if (!finite(model.overallScore)) {
      excluded.push({ modelId: model.modelKey, slug: model.canonicalSlug, name: model.displayName, reason: 'Missing score' });
      continue;
    }
    const route = model.representativePrice;
    const cost = route ? weightedCost(route.inputUsdPerMillion, route.outputUsdPerMillion, weights) : null;
    if (!route || cost === null) {
      excluded.push({ modelId: model.modelKey, slug: model.canonicalSlug, name: model.displayName, reason: 'Missing input or output price' });
      continue;
    }
    candidates.push({
      modelId: model.modelKey,
      slug: model.canonicalSlug,
      name: model.displayName,
      provider: route.providerId,
      cost,
      score: model.overallScore,
      evidenceStatus: model.evidenceStatus,
      inputPrice: route.inputUsdPerMillion!,
      outputPrice: route.outputUsdPerMillion!,
      cachePrice: route.cachedInputUsdPerMillion,
      context: route.contextWindowTokens,
      sourceUrl: route.sourceUrl,
      effectiveAt: route.observedAt,
    });
  }

  const ordered = candidates.slice().sort((left, right) => left.cost - right.cost || right.score - left.score || left.modelId.localeCompare(right.modelId));
  const plotted: ModelParetoRow[] = [];
  let highestPriorScore = Number.NEGATIVE_INFINITY;
  let index = 0;
  while (index < ordered.length) {
    const groupStart = index;
    const { cost, score } = ordered[index]!;
    while (index < ordered.length && ordered[index]!.cost === cost && ordered[index]!.score === score) index += 1;
    const frontier = score > highestPriorScore;
    for (let groupIndex = groupStart; groupIndex < index; groupIndex += 1) plotted.push({ ...ordered[groupIndex]!, frontier });
    if (score > highestPriorScore) highestPriorScore = score;
  }
  return { plotted, excluded };
}

export function applyParetoVisibility(rows: readonly ModelParetoRow[], frontierOnly: boolean): readonly ModelParetoRow[] {
  return frontierOnly ? rows.filter((row) => row.frontier) : rows;
}

function formatCost(value: number): string {
  return `$${value.toFixed(2)} / 1M`;
}

function inspectionRecord(row: ModelParetoRow, attribution: readonly ModelDirectoryAttribution[]): InspectionRecord {
  const source = attribution.find((candidate) => candidate.url === row.sourceUrl);
  return {
    modelId: row.modelId,
    modelSlug: row.slug,
    modelName: row.name,
    provider: row.provider,
    host: row.provider,
    inputPrice: row.inputPrice,
    outputPrice: row.outputPrice,
    cachePrice: row.cachePrice,
    ttft: null,
    throughput: null,
    context: row.context,
    capability: { label: 'Composite quality', value: row.score, methodology: 'BenchAlign' },
    evidenceStatus: row.evidenceStatus,
    sourceLabel: source?.label ?? row.provider,
    sourceUrl: row.sourceUrl,
    effectiveAt: row.effectiveAt,
  };
}

function ParetoTable({
  rows,
  onInspect,
  onCompare,
}: {
  readonly rows: readonly ModelParetoRow[];
  readonly onInspect: (row: ModelParetoRow) => void;
  readonly onCompare: (row: ModelParetoRow) => void;
}) {
  return <table className="models-pareto-table" aria-label="Pareto values">
    <thead><tr><th scope="col">Model</th><th scope="col">Provider</th><th scope="col">Blended cost</th><th scope="col">Composite quality</th><th scope="col">Frontier state</th><th scope="col">Actions</th></tr></thead>
    <tbody>{rows.map((row) => <tr data-frontier={row.frontier ? 'true' : 'false'} key={row.modelId}>
      <th scope="row"><a href={modelPath(row.slug)}>{row.name}</a></th>
      <td>{row.provider}</td><td>{formatCost(row.cost)}</td><td>{row.score.toFixed(2)}</td><td>{row.frontier ? 'Frontier' : 'Not frontier'}</td>
      <td className="models-row-actions"><button className="button button-secondary button-small" type="button" onClick={() => onInspect(row)}>{`Inspect ${row.name}`}</button><button className="button button-small" type="button" onClick={() => onCompare(row)}>{`Compare ${row.name}`}</button></td>
    </tr>)}</tbody>
  </table>;
}

export interface ModelDirectoryParetoProps {
  readonly models: readonly ModelDirectoryEntry[];
  readonly attribution?: readonly ModelDirectoryAttribution[];
  readonly onCompare?: (modelId: string) => void;
}

export function ModelDirectoryPareto({ models, attribution = [], onCompare }: ModelDirectoryParetoProps) {
  const { selection, setSelection } = useCompareState();
  const [frontierOnly, setFrontierOnly] = useState(false);
  const [logScale, setLogScale] = useState(false);
  const [selected, setSelected] = useState<ModelParetoRow | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const rows = useMemo(() => buildModelParetoRows(models), [models]);
  const visible = useMemo(() => applyParetoVisibility(rows.plotted, frontierOnly), [frontierOnly, rows.plotted]);
  const canUseLogScale = visible.length > 0 && visible.every((row) => row.cost > 0);
  const scale = logScale && canUseLogScale ? 'logarithmic' : 'linear';
  const compare = (row: ModelParetoRow) => {
    if (onCompare) {
      onCompare(row.modelId);
      return;
    }
    const result = addCompareModel(selection, row.modelId);
    if (result.kind === 'added') {
      setSelection(result.state);
      setAnnouncement(`Added ${row.name} to comparison`);
    } else if (result.kind === 'duplicate') {
      setAnnouncement(`${row.name} is already selected for comparison`);
    } else {
      setAnnouncement(`Choose a model to replace before adding ${row.name}`);
    }
  };
  const configuration = useMemo<ChartConfiguration<'scatter'>>(() => ({
    type: 'scatter',
    data: { datasets: [{
      label: 'Published models',
      data: visible.map((row) => ({ x: row.cost, y: row.score })),
      pointStyle: visible.map((row) => row.frontier ? 'rectRot' : 'circle'),
      pointRadius: visible.map((row) => row.frontier ? 6 : 4),
      backgroundColor: visible.map((row) => row.frontier ? '#7c3aed' : '#64748b'),
    }] },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, tooltip: { enabled: true } },
      scales: {
        x: { type: scale, title: { display: true, text: '3:1 blended USD per 1M tokens' } },
        y: { title: { display: true, text: 'Composite quality score' } },
      },
    },
  }), [scale, visible]);

  return <section className="models-pareto panel" aria-labelledby="models-pareto-heading">
    <div className="panel-heading"><div><h2 id="models-pareto-heading">Model price–performance frontier</h2><p>Lower 3:1 blended input/output cost and higher composite quality define the visible Pareto frontier. Missing scores or either price axis remain listed below, never plotted at zero.</p></div><p className="models-pareto-count">{rows.plotted.length} plotted · {rows.excluded.length} excluded</p></div>
    <div className="models-pareto-controls" role="group" aria-label="Pareto display controls">
      <button className="button button-secondary button-small" type="button" aria-pressed={frontierOnly} onClick={() => setFrontierOnly((current) => !current)}>Frontier only</button>
      <button className="button button-secondary button-small" type="button" aria-pressed={logScale && canUseLogScale} disabled={!canUseLogScale} onClick={() => setLogScale((current) => !current)}>Log cost scale</button>
      <span>{frontierOnly ? 'Showing frontier models only.' : 'Showing every eligible model; squares mark the frontier.'}</span>
    </div>
    <p className="models-announcement" role="status" aria-live="polite">{announcement}</p>
    <TokenBenchChartCanvas
      className="models-pareto-chart"
      title="Model price-performance scatter plot"
      finding={`${visible.filter((row) => row.frontier).length} frontier model${visible.filter((row) => row.frontier).length === 1 ? '' : 's'} in the current eligible set.`}
      configuration={configuration}
      data={visible}
      table={<div className="models-pareto-table-wrap"><ParetoTable rows={visible} onInspect={setSelected} onCompare={compare} /></div>}
    />
    {rows.excluded.length > 0 ? <details className="models-pareto-excluded"><summary>{`${rows.excluded.length} record${rows.excluded.length === 1 ? '' : 's'} excluded from the chart`}</summary><ul>{rows.excluded.map((row) => <li key={row.modelId}><a href={modelPath(row.slug)}>{row.name}</a><span>{row.reason}</span></li>)}</ul></details> : null}
    {selected ? <InspectionCard record={inspectionRecord(selected, attribution)} onClose={() => setSelected(null)} /> : null}
  </section>;
}
