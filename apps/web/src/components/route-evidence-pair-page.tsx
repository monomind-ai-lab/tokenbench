import { ArrowRight, CircleAlert, Scale } from "lucide-react";
import Link from "next/link";

import type { CsvRow } from "@/components/result-actions";
import { ResultActions } from "@/components/result-actions";
import { RouteEvidencePairControls } from "@/components/route-evidence-pair-controls";
import {
  collectRouteEvidenceProvenance,
  projectRouteEvidencePair,
  routeEvidenceModelPath,
  routeEvidenceValueState,
  type RouteEvidencePair,
} from "@tokenbench/frontend/route-evidence-projectors";
import type {
  EvidenceValue,
  PreviewModel,
  Provenance,
  UiDataContractV1,
  CompareData,
} from "@tokenbench/frontend/preview-data/contracts";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  formatRouteEvidencePrice,
  formatRouteEvidenceTokens,
  RouteEvidenceModeNotice,
  RouteEvidenceSources,
  routeEvidenceText,
  routeEvidenceValue,
} from "@/components/route-evidence-ui";
import { cn } from "@/lib/utils";

function identity(model: PreviewModel | null) {
  return model === null || model.identity.availability === "unavailable" ? null : model.identity.value;
}

function modelName(model: PreviewModel | null, fallback: string): string {
  return identity(model)?.name ?? fallback;
}

function sourceList(models: readonly (PreviewModel | null)[], envelope: readonly Provenance[]): readonly Provenance[] {
  const all = new Map<string, Provenance>();
  for (const source of envelope) all.set(source.id, source);
  for (const model of models) {
    if (model === null) continue;
    for (const source of collectRouteEvidenceProvenance(
      model.identity,
      model.access,
      model.capability,
      model.routePricing,
      model.runtime,
      model.lifecycle,
    )) all.set(source.id, source);
  }
  return [...all.values()];
}

function evidenceState<T>(value: EvidenceValue<T>) {
  const label = routeEvidenceValueState(value);
  return <Badge variant={label === "Unavailable" ? "outline" : "secondary"}>{label}</Badge>;
}

function comparisonRows(models: readonly (PreviewModel | null)[]): CsvRow[] {
  return models.flatMap<CsvRow>((model, index): CsvRow[] => {
    if (model === null) return [{ model: `Requested model ${index + 1}`, metric: "Evidence", value: "Unavailable", state: "Unavailable" }];
    const name = modelName(model, model.id);
    const route = routeEvidenceValue(model.routePricing);
    const capability = routeEvidenceValue(model.capability);
    const runtime = routeEvidenceValue(model.runtime);
    return [
      { model: name, metric: "Composite capability", value: capability?.compositeScore ?? null, state: routeEvidenceValueState(model.capability) },
      { model: name, metric: "Input USD / 1M", value: route?.inputUsdPerMillion ?? null, state: routeEvidenceValueState(model.routePricing) },
      { model: name, metric: "Output USD / 1M", value: route?.outputUsdPerMillion ?? null, state: routeEvidenceValueState(model.routePricing) },
      { model: name, metric: "TTFT p50 seconds", value: runtime?.ttftP50Seconds ?? null, state: routeEvidenceValueState(model.runtime) },
      { model: name, metric: "Output tokens / second", value: runtime?.outputTokensPerSecond ?? null, state: routeEvidenceValueState(model.runtime) },
    ];
  });
}

function ModelSummary({ model, requestedSlug }: { model: PreviewModel | null; requestedSlug: string }) {
  if (model === null) {
    return (
      <section className="rounded-2xl border border-dashed border-border bg-card p-5 sm:p-6">
        <CircleAlert aria-hidden="true" className="size-5 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-semibold">{requestedSlug}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Unavailable. This requested slug has no evidence record in the current response and was not replaced with a similarly named model.</p>
      </section>
    );
  }
  const details = identity(model);
  const capability = routeEvidenceValue(model.capability);
  const route = routeEvidenceValue(model.routePricing);
  const runtime = routeEvidenceValue(model.runtime);
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{details?.provider ?? "Unavailable"}</Badge>{evidenceState(model.identity)}{evidenceState(model.access)}</div>
      <h2 className="mt-4 text-xl font-semibold tracking-tight">{details?.name ?? requestedSlug}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{details?.slug ?? requestedSlug}</p>
      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div><dt className="text-xs text-muted-foreground">Composite</dt><dd className="mt-1 font-mono">{capability?.compositeScore ?? "Unavailable"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Route</dt><dd className="mt-1 truncate">{route?.route ?? "Unavailable"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Input / 1M</dt><dd className="mt-1 font-mono">{route ? formatRouteEvidencePrice(route.inputUsdPerMillion) : "Unavailable"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">TTFT p50</dt><dd className="mt-1 font-mono">{runtime ? `${runtime.ttftP50Seconds}s` : "Unavailable"}</dd></div>
      </dl>
      <Link className={cn(buttonVariants({ variant: "outline" }), "mt-6")} href={routeEvidenceModelPath(details?.slug ?? requestedSlug)}>Open evidence profile<ArrowRight /></Link>
    </section>
  );
}

type AxisRow = Readonly<{
  key: string;
  label: string;
  values: readonly [number | null, number | null];
}>;

function capabilityRows(models: readonly [PreviewModel | null, PreviewModel | null]): readonly AxisRow[] {
  const rows = new Map<string, AxisRow>();
  models.forEach((model, index) => {
    const capability = model === null ? null : routeEvidenceValue(model.capability);
    for (const axis of capability?.radar ?? []) {
      const current = rows.get(axis.key) ?? { key: axis.key, label: axis.label, values: [null, null] as const };
      const values: [number | null, number | null] = [...current.values] as [number | null, number | null];
      values[index] = axis.percentile;
      rows.set(axis.key, { ...current, values });
    }
  });
  return [...rows.values()];
}

function CapabilityMatrix({
  models,
  labels,
}: {
  models: readonly [PreviewModel | null, PreviewModel | null];
  labels: readonly [string, string];
}) {
  const rows = capabilityRows(models);
  if (!rows.length) return <p className="text-sm text-muted-foreground">No comparable capability axes were supplied for this pair.</p>;
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="w-full min-w-[620px] border-collapse text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-left">Capability</th><th className="px-4 py-3 text-right">{labels[0]}</th><th className="px-4 py-3 text-right">{labels[1]}</th></tr></thead><tbody>{rows.map((row) => <tr className="border-t border-border" key={row.key}><td className="px-4 py-3 font-medium">{row.label}</td><td className="px-4 py-3 text-right font-mono">{row.values[0] ?? "Unavailable"}</td><td className="px-4 py-3 text-right font-mono">{row.values[1] ?? "Unavailable"}</td></tr>)}</tbody></table>
      </div>
      <div className="grid gap-3 md:hidden">{rows.map((row) => <section className="rounded-xl border border-border bg-card p-4" key={row.key}><h3 className="text-sm font-medium">{row.label}</h3><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">{labels[0]}</dt><dd className="mt-1 font-mono">{row.values[0] ?? "Unavailable"}</dd></div><div><dt className="text-xs text-muted-foreground">{labels[1]}</dt><dd className="mt-1 font-mono">{row.values[1] ?? "Unavailable"}</dd></div></dl></section>)}</div>
    </>
  );
}

function PricingVariance({
  models,
  labels,
  mode,
}: {
  models: readonly [PreviewModel | null, PreviewModel | null];
  labels: readonly [string, string];
  mode: "preview" | "published";
}) {
  const routes = [
    models[0] === null ? null : routeEvidenceValue(models[0].routePricing),
    models[1] === null ? null : routeEvidenceValue(models[1].routePricing),
  ] as const;
  const values = routes.map((route, index) => ({ label: labels[index], route }));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {values.map(({ label, route }) => (
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6" key={label}>
          <h3 className="font-medium">{label}</h3>
          {route ? (
            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-xs text-muted-foreground">Route</dt><dd className="mt-1 break-words">{route.route}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Evidence state</dt><dd className="mt-1">{mode === "preview" ? "Preview-only · not verified" : "Published data"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Input / 1M</dt><dd className="mt-1 font-mono">{formatRouteEvidencePrice(route.inputUsdPerMillion)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Output / 1M</dt><dd className="mt-1 font-mono">{formatRouteEvidencePrice(route.outputUsdPerMillion)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Context</dt><dd className="mt-1 font-mono">{routeEvidenceText(route.contextWindowTokens, formatRouteEvidenceTokens)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Max output</dt><dd className="mt-1 font-mono">{routeEvidenceText(route.maxOutputTokens, formatRouteEvidenceTokens)}</dd></div>
            </dl>
          ) : <p className="mt-5 text-sm leading-6 text-muted-foreground">Not verified. No route pricing record was supplied for this requested model, so no pricing variance is calculated.</p>}
        </section>
      ))}
    </div>
  );
}

export function RouteEvidencePairPage({
  pair,
  envelope,
  dataMode,
  queryState,
}: {
  pair: RouteEvidencePair;
  envelope: UiDataContractV1<CompareData>;
  dataMode: "evidence" | "production";
  queryState: "absent" | "matches" | "mismatch";
}) {
  const projection = projectRouteEvidencePair(envelope, pair);
  const models = projection.models;
  const labels: [string, string] = [modelName(models[0], pair.left), modelName(models[1], pair.right)];
  const missing = models.some((model) => model === null);
  const sources = sourceList(models, projection.provenance);

  return (
    <main id="route-evidence-comparison">
      <section className="border-b border-border px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 text-xs text-muted-foreground"><Link className="hover:text-foreground" href="/compare/">Compare</Link><span aria-hidden="true">/</span><span aria-current="page">{pair.slug}</span></nav>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(21rem,32rem)] lg:items-end">
            <div>
              <div className="mb-5 flex flex-wrap items-center gap-2"><Badge variant="secondary">Ordered pair evidence</Badge><Badge variant={missing ? "outline" : "secondary"}>{missing ? "Incomplete coverage" : "Two requested records"}</Badge></div>
              <h1 className="text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">{labels[0]} vs {labels[1]}</h1>
              <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">Compare the exact requested pair without filling unavailable capability, pricing, runtime, or lifecycle fields from a different model or route.</p>
              <RouteEvidenceModeNotice mode={dataMode === "evidence" ? "preview" : projection.mode} status={projection.status} />
              {queryState === "mismatch" ? <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />The pair path is authoritative. Its models query must remain <span className="font-mono">{pair.left},{pair.right}</span>; a mismatched query is not used to replace either path slug.</p> : null}
            </div>
            <div className="space-y-3"><ResultActions filename={`tokenbench-route-pair-${pair.slug}`} label="Share and export pair evidence" rows={comparisonRows(models)} targetId="route-evidence-comparison" /><RouteEvidencePairControls left={pair.left} right={pair.right} /></div>
          </div>
        </div>
      </section>

      <section className="px-4 py-10 sm:px-6 sm:py-14"><div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-2"><ModelSummary model={models[0]} requestedSlug={pair.left} /><ModelSummary model={models[1]} requestedSlug={pair.right} /></div></section>

      <section className="border-y border-border bg-muted/25 px-4 py-12 sm:px-6 sm:py-16"><div className="mx-auto max-w-7xl"><div className="mb-7"><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Shared capability evidence</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">The matrix is the exact readable comparison. A missing side stays unavailable; it does not become a winning or losing value.</p></div><CapabilityMatrix labels={labels} models={models} /></div></section>

      <section className="px-4 py-12 sm:px-6 sm:py-16"><div className="mx-auto max-w-7xl"><div className="mb-7"><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Pricing route variance</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Each route stays separate. A missing verification record is shown as not verified, never transformed into a cross-provider estimate.</p></div><PricingVariance labels={labels} mode={dataMode === "evidence" ? "preview" : projection.mode} models={models} /></div></section>

      <section className="border-y border-border bg-muted/25 px-4 py-12 sm:px-6 sm:py-16"><div className="mx-auto max-w-7xl"><div className="mb-7"><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Conditions and unavailable facts</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Runtime and lifecycle conditions are kept per model; evidence is not reduced to a single overall winner claim.</p></div><div className="grid gap-4 lg:grid-cols-2">{models.map((model, index) => <section className="rounded-2xl border border-border bg-card p-5 sm:p-6" key={pair.slug + index}><h3 className="font-medium">{labels[index]}</h3>{model ? <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Runtime</dt><dd className="mt-1">{routeEvidenceText(model.runtime, (runtime) => `${runtime.ttftP50Seconds}s TTFT p50 · ${runtime.outputTokensPerSecond} tok/s`)}</dd></div><div><dt className="text-xs text-muted-foreground">Lifecycle</dt><dd className="mt-1">{routeEvidenceText(model.lifecycle, (lifecycle) => lifecycle.status)}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Lifecycle sunset</dt><dd className="mt-1">{routeEvidenceText(model.lifecycle, (lifecycle) => routeEvidenceText(lifecycle.sunsetOn, (date) => date))}</dd></div></dl> : <p className="mt-5 text-sm text-muted-foreground">Unavailable. No requested-model evidence was supplied.</p>}</section>)}</div></div></section>

      <section className="px-4 py-12 sm:px-6 sm:py-16"><div className="mx-auto max-w-7xl"><RouteEvidenceSources sources={sources} title="Pair evidence receipt" /></div></section>

      <section className="border-t border-border px-4 py-16 text-center sm:px-6 sm:py-24"><div className="mx-auto max-w-2xl"><Scale aria-hidden="true" className="mx-auto size-6 text-muted-foreground" /><h2 className="mt-5 text-3xl font-semibold tracking-tight">Compare a different ordered pair.</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">The switch controls keep the path and query in the same order. If an entered slug has no evidence, that absence remains visible in the next comparison.</p><Link className={cn(buttonVariants({ variant: "outline" }), "mt-7")} href="/compare/">Open comparison workbench<ArrowRight /></Link></div></section>
    </main>
  );
}
