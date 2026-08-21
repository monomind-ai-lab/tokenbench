import {
  ArrowUpRight,
  BadgeCheck,
  BookOpenCheck,
  Database,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import {
  BENCHMARK_DATA_SOURCES,
  CATALOG_DATA_SOURCES,
  SUBSCRIPTION_DATA_SOURCES,
  type PublicDataSource,
} from "@tokenbench/data-sources/public-registry";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

function SourceGroup({
  description,
  id,
  sources,
  title,
}: {
  description: string;
  id: string;
  sources: readonly PublicDataSource[];
  title: string;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="border-t border-border px-5 py-14 sm:px-8 sm:py-16 lg:px-10" id={id}>
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-4 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
          <div>
            <p className="font-mono text-xs uppercase tracking-[.16em] text-brand-secondary">Source registry</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight" id={`${id}-heading`}>{title}</h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground lg:justify-self-end">{description}</p>
        </div>
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {sources.map((source) => (
            <Card className="overflow-hidden" key={source.id}>
              <CardContent className="p-0">
                <div className="flex items-start justify-between gap-4 p-5">
                  <div>
                    <Badge variant="outline">{source.kind}</Badge>
                    <h3 className="mt-4 text-lg font-semibold">{source.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{source.role}</p>
                  </div>
                  <a aria-label={`Open ${source.label} source`} className="grid size-11 shrink-0 place-items-center rounded-xl border border-border text-link transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={source.url} rel="noreferrer" target="_blank"><ArrowUpRight className="size-4" /></a>
                </div>
                <dl className="grid gap-px border-t border-border bg-border sm:grid-cols-2">
                  <div className="bg-muted/45 p-4"><dt className="flex items-center gap-2 text-xs font-medium"><RefreshCw className="size-3.5 text-muted-foreground" />Refresh</dt><dd className="mt-2 text-xs leading-5 text-muted-foreground">{source.refresh}</dd></div>
                  <div className="bg-muted/45 p-4"><dt className="flex items-center gap-2 text-xs font-medium"><ShieldCheck className="size-3.5 text-muted-foreground" />Publication gate</dt><dd className="mt-2 text-xs leading-5 text-muted-foreground">{source.publicationRule}</dd></div>
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

export function DataSourcesPage() {
  return (
    <div>
      <section className="relative overflow-hidden border-b border-border px-5 py-16 sm:px-8 sm:py-20 lg:px-10" aria-labelledby="data-sources-heading">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,color-mix(in_srgb,var(--primary)_18%,transparent),transparent_30%),radial-gradient(circle_at_85%_90%,color-mix(in_srgb,var(--brand-secondary)_12%,transparent),transparent_28%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_380px] lg:items-end">
          <div>
            <Badge><Database />Data provenance</Badge>
            <h1 className="mt-6 max-w-4xl text-balance text-5xl font-semibold leading-[.98] tracking-[-.04em] sm:text-6xl" id="data-sources-heading">The evidence behind TokenBench.</h1>
            <p className="mt-6 max-w-3xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">A single place to review benchmark, catalog, pricing, and subscription sources—plus the rules that keep stale, mismatched, and unavailable observations from becoming facts.</p>
          </div>
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-soft">
            {[['Sources', BENCHMARK_DATA_SOURCES.length + CATALOG_DATA_SOURCES.length + SUBSCRIPTION_DATA_SOURCES.length], ['Groups', 3], ['Fallbacks', 0]].map(([label, value]) => <div className="bg-card p-4" key={label}><p className="font-mono text-2xl">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>)}
          </div>
        </div>
      </section>

      <section aria-labelledby="evidence-rules-heading" className="px-5 py-14 sm:px-8 sm:py-16 lg:px-10" id="methodology">
        <div className="mx-auto max-w-7xl">
          <p className="font-mono text-xs uppercase tracking-[.16em] text-brand-secondary">Evidence rules</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight" id="evidence-rules-heading">How a source becomes a published fact</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              [BookOpenCheck, 'Retain the source', 'Responses and release artifacts are bounded, hashed, and tied to an observed revision before projection.'],
              [BadgeCheck, 'Validate the join', 'Model identity, route, release, and source-rank relationships must match the same accepted revision.'],
              [ShieldCheck, 'Publish or preserve last-good', 'Missing is never zero. A failed refresh cannot replace a verified result, and preview evidence is never a production fallback.'],
            ].map(([Icon, title, copy]) => {
              const RuleIcon = Icon as typeof ShieldCheck;
              return <Card key={title as string}><CardContent><RuleIcon className="size-5 text-primary" /><h3 className="mt-5 font-semibold">{title as string}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{copy as string}</p></CardContent></Card>;
            })}
          </div>
        </div>
      </section>

      <SourceGroup description="Capability, preference, task, and evaluation-economics observations remain in their publisher's own lens. TokenBench does not relabel one benchmark as another." id="benchmarks" sources={BENCHMARK_DATA_SOURCES} title="Benchmark evidence" />
      <SourceGroup description="Catalog identity and route evidence are revision-bound. A corroborating price never silently becomes a hosted route." id="catalog-pricing" sources={CATALOG_DATA_SOURCES} title="Catalog and API pricing" />
      <SourceGroup description="These seven official provider pages are the exact allowlist checked by the daily subscription crawler. Changed facts stay review-gated until accepted." id="subscriptions" sources={SUBSCRIPTION_DATA_SOURCES} title="Subscriptions and published limits" />
    </div>
  );
}
