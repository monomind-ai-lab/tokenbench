import { toPng } from 'html-to-image';

export interface CompareExportModel {
  readonly name: string;
}

export interface CompareExportRow {
  readonly label: string;
  readonly values: readonly string[];
}

export interface CompareExportData {
  readonly models: readonly CompareExportModel[];
  readonly rows: readonly CompareExportRow[];
}

function csvCell(value: string): string {
  const formulaSafe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(formulaSafe)
    ? `"${formulaSafe.replaceAll('"', '""')}"`
    : formulaSafe;
}

function triggerDownload(href: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function compareCsv(data: CompareExportData): string {
  return [
    ['Metric', ...data.models.map((model) => model.name)],
    ...data.rows.map((row) => [row.label, ...row.values]),
  ].map((row) => row.map((value) => csvCell(value)).join(',')).join('\n');
}

export function downloadCompareCsv(data: CompareExportData, filename: string): void {
  const objectUrl = URL.createObjectURL(new Blob([`\uFEFF${compareCsv(data)}`], { type: 'text/csv;charset=utf-8' }));
  triggerDownload(objectUrl, filename);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export async function copyCompareLink(): Promise<void> {
  const url = window.location.href;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return;
  }

  const field = document.createElement('textarea');
  field.value = url;
  field.readOnly = true;
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.append(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('Copy is not available.');
}

export async function downloadComparePng(element: HTMLElement, filename: string): Promise<void> {
  const backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  const dataUrl = await toPng(element, {
    backgroundColor,
    cacheBust: true,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    filter: (node) => !(node instanceof HTMLElement && node.dataset.exportAction === 'true'),
  });
  triggerDownload(dataUrl, filename);
}
