import { ArrowRight, CircleAlert, GitCompareArrows, Gauge, Layers3 } from "lucide-react";
import Link from "next/link";

import type { CsvRow } from "@/components/result-actions";
import { ResultActions } from "@/components/result-actions";
import { RouteEvidenceProfileControls } from "@/components/route-evidence-profile-controls";
import {
  collectRouteEvidenceProvenance,
  projectRouteEvidenceProfile,
  routeEvidenceValueState,
} from "@tokenbench/frontend/route-evidence-projectors";
import type {
  EvidenceValue,
  PreviewModel,
  PreviewModelProfileData,
  Provenance,
  UiDataContractV1,
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

function modelName(model: PreviewModel, fallback: string): string {
  return model.identity.availability === "available" ? model.identity.value.name : fallback;
}

function provider(model: PreviewModel): string {
  return model.identity.availability === "available" ? model.identity.value.provider : "Unavailable";
}

function sources(...groups: readonly (readonly Provenance[])[]): readonly Provenance[] {
  const merged = new Map<string, Provenance>();
  for (const group of groups) for (const source of group) merged.set(source.id, source);
  return [...merged.values()];
}

function profileRows(model: PreviewModel): CsvRow[] {
  const identity = routeEvidenceValue(model.identity);
  const route = routeEvidenceValue(model.routePricing);
  const capability = routeEvidenceValue(model.capability);
  const runtime = routeEvidenceValue(model.runtime);
  return [
    { field: "Model", value: identity?.name ?? null, evidenceState: routeEvidenceValueState(model.identity) },
    { field: "Provider", value: identity?.provider ?? null, evidenceState: routeEvidenceValueState(model.identity) },
    { field: "Composite capability", value: capability?.compositeScore ?? null, evidenceState: routeEvidenceValueState(model.capability) },
    { field: "Route", value: route?.route ?? null, evidenceState: routeEvidenceValueState(model.routePricing) },
    { field: "Input USD / 1M", value: route?.inputUsdPerMillion ?? null, evidenceState: routeEvidenceValueState(model.routePricing) },
    { field: "Output USD / 1M", value: route?.outputUsdPerMillion ?? null, evidenceState: routeEvidenceValueState(model.routePricing) },
    { field: "TTFT p50 seconds", value: runtime?.ttftP50Seconds ?? null, evidenceState: routeEvidenceValueState(model.runtime) },
    { field: "Output tokens / second", value: runtime?.outputTokensPerSecond ?? null, evidenceState: routeEvidenceValueState(model.runtime) },
  ];
}

function StateBadge<T>({ value }: { value: EvidenceValue<T> }) {
  const state = routeEvidenceValueState(value);
  return <Badge variant={state === "Unavailable" ? "outline" : "secondary"}>{state}</Badge>;
}

function ProfileFact({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="bg-card p-4 sm:p-5">
      <p className="font-mono text-xl tabular-nums sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs font-medium">{label}</p>
      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{note}</p>
    </div>
  );
}

function ProfileIdentity({ model }: { model: PreviewModel }) {
  const identity = routeEvidenceValue(model.identity);
  const access = routeEvidenceValue(model.access);
  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      <div><dt className="text-xs text-muted-foreground">Provider</dt><dd className="mt-1 font-medium">{identity?.provider ?? "Unavailable"}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Model slug</dt><dd className="mt-1 font-mono text-xs">{identity?.slug ?? "Unavailable"}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Access</dt><dd className="mt-1">{access ?? "Unavailable"}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Benchmark release</dt><dd className="mt-1">{routeEvidenceText(model.benchmark, (release) => release.releaseOn)}</dd></div>
    </dl>
  );
}

function CapabilityTable({ model }: { model: PreviewModel }) {
  const capability = routeEvidenceValue(model.capability);
  if (capability === null) {
    return <p className="text-sm text-muted-foreground">Capability evidence is unavailable for this model.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead className="bg-muted/60 text-xs text-muted-foreground">
          <tr><th className="px-4 py-3 text-left">Capability</th><th className="px-4 py-3 text-right">Percentile</th><th className="px-4 py-3 text-right">Rank</th><th className="px-4 py-3 text-right">Field size</th></tr>
        </thead>
        <tbody>
          {capability.radar.map((axis) => (
            <tr className="border-t border-border" key={axis.key}>
              <td className="px-4 py-3 font-medium">{axis.label}</td>
              <td className="px-4 py-3 text-right font-mono">{axis.percentile ?? "Unavailable"}</td>
              <td className="px-4 py-3 text-right font-mono">{axis.rank ?? "Unavailable"}</td>
              <td className="px-4 py-3 text-right font-mono">{axis.fieldSize ?? "Unavailable"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PriceLedger({ model }: { model: PreviewModel }) {
  const route = routeEvidenceValue(model.routePricing);
  if (route === null) {
    return (
      <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Route pricing unavailable.</span> No provider-direct or routed price is substituted for this model.
      </div>
    );
  }
  const cache = routeEvidenceValue(route.cache);
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead className="bg-muted/60 text-xs text-muted-foreground">
          <tr><th className="px-4 py-3 text-left">Route</th><th className="px-4 py-3 text-right">Input / 1M</th><th className="px-4 py-3 text-right">Output / 1M</th><th className="px-4 py-3 text-right">Context</th><th className="px-4 py-3 text-right">Max output</th><th className="px-4 py-3 text-left">Evidence state</th></tr>
        </thead>
        <tbody>
          <tr className="border-t border-border">
            <td className="px-4 py-3 font-medium">{route.route}</td>
            <td className="px-4 py-3 text-right font-mono">{formatRouteEvidencePrice(route.inputUsdPerMillion)}</td>
            <td className="px-4 py-3 text-right font-mono">{formatRouteEvidencePrice(route.outputUsdPerMillion)}</td>
            <td className="px-4 py-3 text-right font-mono">{routeEvidenceText(route.contextWindowTokens, formatRouteEvidenceTokens)}</td>
            <td className="px-4 py-3 text-right font-mono">{routeEvidenceText(route.maxOutputTokens, formatRouteEvidenceTokens)}</td>
            <td className="px-4 py-3"><StateBadge value={model.routePricing} /></td>
          </tr>
          <tr className="border-t border-border bg-muted/20 text-xs text-muted-foreground">
            <td className="px-4 py-3">Cache pricing</td>
            <td className="px-4 py-3 text-right font-mono">{cache ? routeEvidenceText(cache.readUsdPerMillion, formatRouteEvidencePrice) : "Unavailable"}</td>
            <td className="px-4 py-3 text-right font-mono">{cache ? routeEvidenceText(cache.writeUsdPerMillion, formatRouteEvidencePrice) : "Unavailable"}</td>
            <td className="px-4 py-3 text-right">{route.inputModalities.join(", ") || "Unavailable"}</td>
            <td className="px-4 py-3 text-right">{route.outputModalities.join(", ") || "Unavailable"}</td>
            <td className="px-4 py-3">{routeEvidenceValueState(route.cache)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function RuntimeAndLifecycle({ model }: { model: PreviewModel }) {
  const runtime = routeEvidenceValue(model.runtime);
  const lifecycle = routeEvidenceValue(model.lifecycle);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center gap-2"><Gauge className="size-4 text-muted-foreground" /><h2 className="font-medium">Runtime observation</h2></div>
        {runtime ? (
          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
            <div><dt className="text-xs text-muted-foreground">TTFT p50</dt><dd className="mt-1 font-mono">{runtime.ttftP50Seconds}s</dd></div>
            <div><dt className="text-xs text-muted-foreground">Output throughput</dt><dd className="mt-1 font-mono">{runtime.outputTokensPerSecond} tok/s</dd></div>
            <div className="col-span-2"><dt className="text-xs text-muted-foreground">Conditions</dt><dd className="mt-1 text-sm">{runtime.conditions}</dd></div>
          </dl>
        ) : <p className="mt-5 text-sm text-muted-foreground">Runtime evidence is unavailable; a price record is not used as an SLA substitute.</p>}
      </section>
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center gap-2"><Layers3 className="size-4 text-muted-foreground" /><h2 className="font-medium">Lifecycle</h2></div>
        {lifecycle ? (
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">Status</dt><dd className="mt-1 font-medium">{lifecycle.status}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Sunset</dt><dd className="mt-1">{routeEvidenceText(lifecycle.sunsetOn, (date) => date)}</dd></div>
          </dl>
        ) : <p className="mt-5 text-sm text-muted-foreground">Lifecycle evidence is unavailable.</p>}
      </section>
    </div>
  );
}

export function RouteEvidenceModelProfilePage({
  slug,
  envelope,
  dataMode,
}: {
  slug: string;
  envelope: UiDataContractV1<PreviewModelProfileData>;
  dataMode: "evidence" | "production";
}) {
  const projection = projectRouteEvidenceProfile(envelope);
  const model = projection.model;
  if (model === null) {
    return (
      <main className="px-4 py-20 sm:px-6 sm:py-28">
        <section className="mx-auto max-w-2xl rounded-2xl border border-dashed border-border bg-card p-7 sm:p-10">
          <CircleAlert aria-hidden="true" className="size-6 text-muted-foreground" />
          <h1 className="mt-5 text-3xl font-semibold tracking-tight">Model evidence unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{projection.reason ?? "No evidence record was returned for this requested model slug. It was not replaced with another model."}</p>
          <Link className={cn(buttonVariants({ variant: "outline" }), "mt-7")} href="/models/">Browse model workbench<ArrowRight /></Link>
        </section>
      </main>
    );
  }

  const name = modelName(model, slug);
  const capability = routeEvidenceValue(model.capability);
  const route = routeEvidenceValue(model.routePricing);
  const runtime = routeEvidenceValue(model.runtime);
  const sourceList = sources(
    projection.provenance,
    collectRouteEvidenceProvenance(
      model.identity,
      model.access,
      model.capability,
      model.routePricing,
      model.runtime,
      model.lifecycle,
    ),
  );

  return (
    <main id="route-evidence-profile">
      <section className="border-b border-border px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 text-xs text-muted-foreground"><Link className="hover:text-foreground" href="/models/">Models</Link><span aria-hidden="true">/</span><span aria-current="page">{name}</span></nav>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,30rem)] lg:items-end">
            <div>
              <div className="mb-5 flex flex-wrap items-center gap-2"><Badge variant="secondary">{provider(model)}</Badge><StateBadge value={model.identity} /><StateBadge value={model.access} /></div>
              <h1 className="text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">{name}</h1>
              <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">A model-specific evidence record that keeps capability, endpoint pricing, runtime conditions, and missing fields separate.</p>
              <RouteEvidenceModeNotice mode={dataMode === "evidence" ? "preview" : projection.mode} status={projection.status} />
            </div>
            <div className="space-y-3">
              <ResultActions filename={`tokenbench-route-profile-${slug}`} label="Share and export model evidence" rows={profileRows(model)} targetId="route-evidence-profile" />
              <RouteEvidenceProfileControls slug={slug} />
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-8 sm:px-6">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
          <ProfileFact label="Composite capability" note="Only shown from the requested model evidence." value={capability ? String(capability.compositeScore) : "Unavailable"} />
          <ProfileFact label="Selected route" note="No route is inferred when pricing is unavailable." value={route?.route ?? "Unavailable"} />
          <ProfileFact label="Input / 1M" note="Endpoint-specific price." value={route ? formatRouteEvidencePrice(route.inputUsdPerMillion) : "Unavailable"} />
          <ProfileFact label="TTFT p50" note="Runtime measurement, not a provider SLA." value={runtime ? `${runtime.ttftP50Seconds}s` : "Unavailable"} />
        </div>
      </section>

      <section className="border-y border-border bg-muted/25 px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-7"><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Capability evidence</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Exact axis values remain visible. Unavailable axes are never drawn as zero or interpolated from a neighboring category.</p></div>
          <CapabilityTable model={model} />
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-7xl"><div className="mb-7"><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Endpoint price ledger</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Published route fields remain itemized; a route with missing verification is not converted into a blended estimate.</p></div><PriceLedger model={model} /></div>
      </section>

      <section className="border-y border-border bg-muted/25 px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-7xl"><div className="mb-7"><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Identity, runtime, and lifecycle</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Each fact remains attached to its own evidence state rather than becoming a universal model description.</p></div><div className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]"><section className="rounded-2xl border border-border bg-card p-5 sm:p-6"><h2 className="font-medium">Identity and limits</h2><div className="mt-5"><ProfileIdentity model={model} /></div></section><RuntimeAndLifecycle model={model} /></div></div>
      </section>

      <section className="px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-7xl"><RouteEvidenceSources sources={sourceList} /></div>
      </section>

      <section className="border-t border-border px-4 py-16 text-center sm:px-6 sm:py-24">
        <div className="mx-auto max-w-2xl"><GitCompareArrows aria-hidden="true" className="mx-auto size-6 text-muted-foreground" /><h2 className="mt-5 text-3xl font-semibold tracking-tight">Keep the pair order explicit.</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Enter another model slug above to open an ordered pair route. The comparison will state whether each requested model has evidence rather than choosing a substitute.</p></div>
      </section>
    </main>
  );
}
