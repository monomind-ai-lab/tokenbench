import { Copy, ImageDown, TableProperties } from 'lucide-react';

interface PopularSectionActionsProps {
  readonly label: string;
  readonly onCopyLink: () => void;
  readonly onDownloadPng: () => void;
  readonly onDownloadCsv: () => void;
}

export function PopularSectionActions({ label, onCopyLink, onDownloadPng, onDownloadCsv }: PopularSectionActionsProps) {
  return <div className="popular-models-action-buttons" role="group" aria-label={`${label} export actions`} data-export-action="true">
    <button className="popular-models-action-button popular-models-touch-target" type="button" aria-label={`Copy link to ${label}`} title="Copy section link" onClick={onCopyLink}><Copy aria-hidden="true" size={17} /></button>
    <button className="popular-models-action-button popular-models-touch-target" type="button" aria-label={`Download ${label} as PNG`} title="Download PNG" onClick={onDownloadPng}><ImageDown aria-hidden="true" size={17} /></button>
    <button className="popular-models-action-button popular-models-touch-target" type="button" aria-label={`Download ${label} data as CSV`} title="Download CSV" onClick={onDownloadCsv}><TableProperties aria-hidden="true" size={17} /></button>
  </div>;
}
