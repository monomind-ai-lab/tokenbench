import { toPng } from 'html-to-image';

type CsvCell = string | number | boolean | null | undefined;

function spreadsheetSafeCell(value: CsvCell): string {
  const normalized = value == null ? '' : String(value);
  const formulaSafe = /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
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

export async function copyPopularModelsSectionLink(sectionId: string): Promise<void> {
  const url = new URL(window.location.href);
  url.hash = sectionId;
  window.history.replaceState({}, '', url);
  await navigator.clipboard.writeText(url.toString());
}

export async function downloadPopularModelsSectionPng(sectionId: string, filename: string): Promise<void> {
  const section = document.getElementById(sectionId);
  if (!section) throw new Error('The requested section is not available to export.');

  const rootStyle = getComputedStyle(document.documentElement);
  const backgroundColor = rootStyle.getPropertyValue('--bg').trim();
  const dataUrl = await toPng(section, {
    backgroundColor,
    cacheBust: true,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    filter: (node) => !(node instanceof HTMLElement && node.dataset.exportAction === 'true'),
  });
  triggerDownload(dataUrl, filename);
}

export function downloadPopularModelsCsv(
  rows: readonly (readonly CsvCell[])[],
  filename: string,
): void {
  const csv = rows.map((row) => row.map(spreadsheetSafeCell).join(',')).join('\r\n');
  const blobUrl = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  triggerDownload(blobUrl, filename);
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
}
