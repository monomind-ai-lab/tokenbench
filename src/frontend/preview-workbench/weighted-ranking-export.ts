import { toPng } from 'html-to-image';
import { roundDisplayValue } from '../display-format';
import { encodeWeightedRankingState, type WeightedRankingState } from './weighted-ranking-state';

export interface WeightedRankingExportRow {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly score: number;
  readonly cost: number;
  readonly meetsSla: boolean;
  readonly frontier: boolean;
}

function csvCell(value: string): string {
  const formulaSafe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(formulaSafe) ? `"${formulaSafe.replaceAll('"', '""')}"` : formulaSafe;
}

function download(href: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

/** Exact, semantic data export intentionally uses a stable cheapest-first ordering. */
export function weightedRankingCsv(rows: readonly WeightedRankingExportRow[]): string {
  const ordered = rows.slice().sort((left, right) => left.cost - right.cost || right.score - left.score || left.name.localeCompare(right.name));
  return [
    ['Cost rank', 'Model', 'Provider', 'Weighted score', 'Evaluation cost / success $', 'Weighted frontier', 'SLA result'],
    ...ordered.map((row, index) => [String(index + 1), row.name, row.provider, row.score.toFixed(1), String(roundDisplayValue(row.cost)), row.frontier ? 'Yes' : 'No', row.meetsSla ? 'Pass' : 'Outside threshold']),
  ].map((row) => row.map(csvCell).join(',')).join('\n');
}

export function weightedRankingShareUrl(base: string, state: WeightedRankingState, anchor = 'weighted-ranking'): URL {
  const url = new URL(base);
  url.search = encodeWeightedRankingState(state).toString();
  url.hash = anchor;
  return url;
}

export function downloadWeightedRankingCsv(rows: readonly WeightedRankingExportRow[], filename: string): void {
  const url = URL.createObjectURL(new Blob([`\uFEFF${weightedRankingCsv(rows)}`], { type: 'text/csv;charset=utf-8' }));
  download(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function copyWeightedRankingLink(url: URL): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(url.href);
  const field = document.createElement('textarea');
  field.value = url.href;
  field.readOnly = true;
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.append(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('Copy is not available.');
}

export async function downloadWeightedRankingPng(element: HTMLElement, filename: string): Promise<void> {
  const backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  download(await toPng(element, { backgroundColor, cacheBust: true, pixelRatio: Math.min(window.devicePixelRatio || 1, 2), filter: (node) => !(node instanceof HTMLElement && node.dataset.exportAction === 'true') }), filename);
}
