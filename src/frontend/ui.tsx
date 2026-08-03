import type { ReactNode } from 'react';
import type { CatalogResponse, SourceProvenance } from '../catalog/contracts';
import type { EmptySelectionProps } from './types';

export function providerLabel(providerId: string): string {
  const known: Record<string, string> = {
    alibaba: 'Alibaba Cloud',
    anthropic: 'Anthropic',
    deepseek: 'DeepSeek',
    kimi: 'Kimi',
    openai: 'OpenAI',
    xai: 'xAI',
    zai: 'Z.AI',
    openrouter: 'OpenRouter',
    opencode: 'OpenCode',
  };
  return known[providerId] ?? providerId.split(/[-_]/g).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export function SectionCard({ children, className = '', title, description }: { children: ReactNode; className?: string; title?: string; description?: string }) {
  return (
    <section className={`panel ${className}`}>
      {title ? <div className="panel-heading"><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div></div> : null}
      {children}
    </section>
  );
}

export function EmptyState({ title, description, actionLabel, onAction }: EmptySelectionProps) {
  return (
    <div className="empty-state" role="status">
      <strong>{title}</strong>
      <p>{description}</p>
      {actionLabel && onAction ? <button type="button" className="button button-secondary" onClick={onAction}>{actionLabel}</button> : null}
    </div>
  );
}

export function Skeleton({ label = 'Loading catalog' }: { label?: string }) {
  return <div className="skeleton-stack" aria-busy="true" aria-label={label}><span className="skeleton skeleton-lg" /><span className="skeleton" /><span className="skeleton" /><span className="skeleton skeleton-short" /></div>;
}

export function StatusBanner({ children, tone = 'info', actionLabel, onAction }: { children: ReactNode; tone?: 'info' | 'warning' | 'error'; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className={`status-banner status-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      {actionLabel && onAction ? <button type="button" className="button button-small" onClick={onAction}>{actionLabel}</button> : null}
    </div>
  );
}

export function EvidenceLink({ catalog, sourceId, label = 'View evidence' }: { catalog: CatalogResponse; sourceId: string; label?: string }) {
  const source: SourceProvenance | undefined = catalog.provenance.find((item) => item.id === sourceId);
  if (!source) return <span className="muted">Evidence unavailable</span>;
  return <a className="evidence-link" href={source.sourceUrl} target="_blank" rel="noreferrer" aria-label={`${label} for ${source.id}`}>{label} ↗</a>;
}

export function ConfidenceLabel({ catalog, sourceId }: { catalog: CatalogResponse; sourceId: string }) {
  const source = catalog.provenance.find((item) => item.id === sourceId);
  if (!source) return <span className="confidence confidence-unknown">Unknown source</span>;
  return <span className={`confidence confidence-${source.confidence}`}>{source.confidence === 'official' ? 'Official source' : 'Manual verified'}</span>;
}

export function formatDateTime(value: string | null): string {
  if (!value) return 'Not yet refreshed';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
