import { useEffect, useRef, type RefObject } from 'react';
import { modelPath } from '../benchmarks/model-directory';

export interface InspectionCapability {
  readonly label: string;
  readonly value: string | number;
  readonly methodology: string | null;
}

export interface InspectionRecord {
  readonly modelId: string;
  readonly modelSlug: string;
  readonly modelName: string;
  readonly provider: string;
  readonly host: string | null;
  readonly inputPrice: number | null;
  readonly outputPrice: number | null;
  readonly cachePrice: number | null;
  readonly ttft: number | null;
  readonly throughput: number | null;
  readonly context: number | null;
  readonly capability: InspectionCapability | null;
  readonly evidenceStatus: 'supported' | 'estimated' | 'source_only';
  readonly sourceLabel: string;
  readonly sourceUrl: string;
  readonly effectiveAt: string | null;
}

export interface InspectionCardProps {
  readonly record: InspectionRecord;
  readonly onClose: () => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

function valueOrNotReported(value: string | number | null): string | number {
  return value ?? 'Not reported';
}

function price(value: number | null): string {
  return value === null ? 'Not reported' : `$${value} / 1M tokens`;
}

export function InspectionCard({ record, onClose, returnFocusRef }: InspectionCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const close = () => {
    returnFocusRef?.current?.focus();
    onClose();
  };

  useEffect(() => {
    cardRef.current?.focus();
  }, []);

  return <aside ref={cardRef} className="inspection-card panel" role="dialog" aria-labelledby="inspection-card-title" tabIndex={-1} onKeyDown={(event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }}>
    <header>
      <div><p className="eyebrow">Model inspection</p><h2 id="inspection-card-title">{record.modelName}</h2><p>{record.provider}</p></div>
      <button className="button button-secondary" type="button" onClick={close}>Close inspection</button>
    </header>
    <dl>
      <div><dt>Host</dt><dd>{valueOrNotReported(record.host)}</dd></div>
      <div><dt>Input price</dt><dd>{price(record.inputPrice)}</dd></div>
      <div><dt>Output price</dt><dd>{price(record.outputPrice)}</dd></div>
      <div><dt>Cache price</dt><dd>{price(record.cachePrice)}</dd></div>
      <div><dt>TTFT</dt><dd>{record.ttft === null ? 'Not reported' : `${record.ttft}s`}</dd></div>
      <div><dt>Throughput</dt><dd>{record.throughput === null ? 'Not reported' : `${record.throughput} tok/s`}</dd></div>
      <div><dt>Context</dt><dd>{record.context === null ? 'Not reported' : `${record.context.toLocaleString()} tokens`}</dd></div>
      <div><dt>{record.capability?.label ?? 'Capability'}</dt><dd>{valueOrNotReported(record.capability?.value ?? null)}</dd></div>
      <div><dt>Evidence</dt><dd>{record.evidenceStatus.replace('_', ' ')}</dd></div>
      <div><dt>Effective at</dt><dd>{valueOrNotReported(record.effectiveAt)}</dd></div>
    </dl>
    <footer>
      <a className="button button-secondary" href={record.sourceUrl} target="_blank" rel="noreferrer">{`View ${record.sourceLabel} source`}</a>
      <a className="button" href={modelPath(record.modelSlug)}>{`${record.modelName} profile`}</a>
    </footer>
  </aside>;
}
