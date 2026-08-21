"use client";

import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  GitCompareArrows,
  Layers3,
  Scale,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { formatDisplayNumber, roundDisplayValue } from "@tokenbench/frontend/display-format";

import { ResultActions } from "@/components/result-actions";
import {
  RouteEvidenceCapabilityRadar,
  RouteEvidenceRuntimeCharts,
} from "@/components/route-evidence-charts";
import {
  RouteEvidenceCapabilityBars,
  RouteEvidenceRuntimeReadout,
  formatRouteSurfacePrice,
  formatRouteSurfaceTokens,
} from "@/components/route-evidence-visuals";
import {
  RouteEvidenceModeNotice,
  RouteEvidenceSources,
} from "@/components/route-evidence-ui";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import type {
  ModelSurfaceMode,
  SurfaceModel,
} from "@tokenbench/frontend/model-surface-projectors";
import type { Provenance } from "@tokenbench/frontend/preview-data/contracts";
import { cn } from "@/lib/utils";

function Dot({ model }: { model: SurfaceModel }) {
  return (
    <span
      aria-hidden="true"
      className="size-3 rounded-full ring-4 ring-current/10"
      style={{ backgroundColor: model.color, color: model.color }}
    />
  );
}

function Metric({
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

export function ModelProfilePage({
  model,
  mode,
  status,
  sources,
}: {
  model: SurfaceModel;
  mode: ModelSurfaceMode;
  status: "available" | "partial" | "unavailable";
  sources: readonly Provenance[];
}) {
  const [monthlyTokens, setMonthlyTokens] = useState(5);
  const inputTokens = monthlyTokens * 0.75;
  const outputTokens = monthlyTokens * 0.25;
  const monthlyCost =
    model.inputUsdPerMillion === null || model.outputUsdPerMillion === null
      ? null
      : inputTokens * model.inputUsdPerMillion +
        outputTokens * model.outputUsdPerMillion;
  const inputLineCost = model.inputUsdPerMillion === null
    ? null
    : inputTokens * model.inputUsdPerMillion;
  const outputLineCost = model.outputUsdPerMillion === null
    ? null
    : outputTokens * model.outputUsdPerMillion;
  const exportRows = [
    { metric: "Capability value", value: model.capabilityScore === null ? null : roundDisplayValue(model.capabilityScore), unit: "score" },
    {
      metric: "Context window",
      value: model.contextWindowTokens,
      unit: "tokens",
    },
    {
      metric: "Input price",
      value: model.inputUsdPerMillion === null ? null : roundDisplayValue(model.inputUsdPerMillion),
      unit: "USD / 1M tokens",
    },
    {
      metric: "Output price",
      value: model.outputUsdPerMillion === null ? null : roundDisplayValue(model.outputUsdPerMillion),
      unit: "USD / 1M tokens",
    },
    {
      metric: "Cache read price",
      value: model.cacheReadUsdPerMillion === null ? null : roundDisplayValue(model.cacheReadUsdPerMillion),
      unit: "USD / 1M tokens",
    },
    {
      metric: "Cache write price",
      value: model.cacheWriteUsdPerMillion === null ? null : roundDisplayValue(model.cacheWriteUsdPerMillion),
      unit: "USD / 1M tokens",
    },
    {
      metric: "Long-context input price",
      value: model.longContextInputUsdPerMillion === null ? null : roundDisplayValue(model.longContextInputUsdPerMillion),
      unit: "USD / 1M tokens",
    },
    { metric: "TTFT p50", value: model.ttftP50Seconds === null ? null : roundDisplayValue(model.ttftP50Seconds), unit: "seconds" },
    {
      metric: "Observed throughput",
      value: model.outputTokensPerSecond === null ? null : roundDisplayValue(model.outputTokensPerSecond),
      unit: "tokens / second",
    },
  ];
  const lifecycleValue = model.lifecycleStatus ?? "Unavailable";

  return (
    <main>
      <section className="border-b border-border px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <nav
            aria-label="Breadcrumb"
            className="mb-8 flex items-center gap-2 text-xs text-muted-foreground"
          >
            <Link className="hover:text-foreground" href="/models/">
              Models
            </Link>
            <ChevronRight className="size-3" />
            <span aria-current="page">{model.name}</span>
          </nav>
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <Dot model={model} />
                <Badge variant="secondary">
                  {model.provider ?? "Provider unavailable"}
                </Badge>
                <Badge variant="outline">
                  {model.access ?? "Access unavailable"}
                </Badge>
              </div>
              <h1 className="text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
                {model.name}
              </h1>
              <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
                This profile renders only the requested evidence record. Missing
                capability, route, runtime, and lifecycle fields
                remain unavailable.
              </p>
              <RouteEvidenceModeNotice mode={mode} status={status} />
            </div>
            <div className="flex flex-wrap gap-2">
              <ResultActions
                filename={`tokenbench-${model.id}-profile`}
                rows={exportRows}
                targetId="profile-result"
              />
              <Link
                className={buttonVariants()}
                href={`/compare?models=${encodeURIComponent(model.id)}`}
              >
                <GitCompareArrows />
                Add to comparison
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div id="profile-result">
        <section className="px-4 py-8 sm:px-6">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-5">
            <Metric
              label="Capability"
              note={
                model.capabilityScore === null
                  ? "No compatible capability value was supplied."
                  : "Published capability observation."
              }
              value={
                model.capabilityScore === null
                  ? "Unavailable"
                  : formatDisplayNumber(model.capabilityScore)
              }
            />
            <Metric
              label="Context"
              note="Selected-route context window."
              value={formatRouteSurfaceTokens(model.contextWindowTokens)}
            />
            <Metric
              label="Input price"
              note="Selected-route price per million tokens."
              value={formatRouteSurfacePrice(model.inputUsdPerMillion)}
            />
            <Metric
              label="Output price"
              note="Selected-route generated-token price."
              value={formatRouteSurfacePrice(model.outputUsdPerMillion)}
            />
            <Metric
              label="Throughput"
              note={
                model.outputTokensPerSecond === null
                  ? "No runtime observation was supplied."
                  : "Observed p50 throughput, not an SLA."
              }
              value={
                model.outputTokensPerSecond === null
                  ? "Unavailable"
                  : `${formatDisplayNumber(model.outputTokensPerSecond)} tok/s`
              }
            />
          </div>
        </section>

        <section className="px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-7xl">
            <div className="mb-7">
              <p className="font-mono text-xs text-muted-foreground">
                01 / CAPABILITY PROFILE
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Capability profile
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Exact submitted axes remain readable. An unavailable axis is not
                rendered as zero, extrapolated, or borrowed from another
                category.
              </p>
            </div>
            <Card>
              <CardContent className="pt-6">
                <RouteEvidenceCapabilityRadar models={[model]} />
                {model.capabilityAxes.filter((axis) => axis.percentile !== null).length < 3 ? (
                  <RouteEvidenceCapabilityBars models={[model]} />
                ) : null}
                <details className="mt-5 rounded-xl border border-border bg-muted/25 p-4">
                  <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Exact capability values</summary>
                  <dl className="mt-3 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
                    {model.capabilityAxes.map((axis) => (
                      <div className="flex items-center justify-between gap-4 bg-card px-4 py-3 text-sm" key={axis.key}>
                        <dt className="text-muted-foreground">{axis.label}</dt>
                        <dd className="font-mono">{axis.percentile === null ? "Unavailable" : formatDisplayNumber(axis.percentile)}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="border-y border-border bg-muted/25 px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-7xl">
            <div className="mb-7">
              <p className="font-mono text-xs text-muted-foreground">
                02 / RUNTIME &amp; SLA
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Latest runtime observation
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                A single accepted observation is shown as a point-in-time
                readout; no historical trend is fabricated.
              </p>
            </div>
            <Card>
              <CardContent className="space-y-5 pt-6">
                <RouteEvidenceRuntimeCharts models={[model]} />
                <RouteEvidenceRuntimeReadout model={model} />
              </CardContent>
              <CardFooter>
                <p className="text-xs leading-5 text-muted-foreground">
                  Runtime observations are route-specific and do not become a
                  provider contractual SLA.
                </p>
              </CardFooter>
            </Card>
          </div>
        </section>

        <section className="px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-7xl">
            <p className="font-mono text-xs text-muted-foreground">
              03 / IDENTITY, LIMITS &amp; LIFECYCLE
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              Identity, limits, and lifecycle
            </h2>
            <div className="mt-7 grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <Layers3 className="size-5 text-muted-foreground" />
                  <CardTitle className="mt-3">Identity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Provider</span>
                    <span>{model.provider ?? "Unavailable"}</span>
                  </p>
                  <p className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Model ID</span>
                    <span className="font-mono text-xs">{model.id}</span>
                  </p>
                  <p className="flex justify-between gap-4">
                    <span className="text-muted-foreground">
                      Benchmark release
                    </span>
                    <span>{model.benchmarkReleaseOn ?? "Unavailable"}</span>
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <Scale className="size-5 text-muted-foreground" />
                  <CardTitle className="mt-3">Selected route limits</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Route</span>
                    <span className="max-w-[12rem] truncate">
                      {model.route ?? "Unavailable"}
                    </span>
                  </p>
                  <p className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Context</span>
                    <span>
                      {formatRouteSurfaceTokens(model.contextWindowTokens)}
                    </span>
                  </p>
                  <p className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Max output</span>
                    <span>
                      {formatRouteSurfaceTokens(model.maxOutputTokens)}
                    </span>
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CalendarDays className="size-5 text-muted-foreground" />
                  <CardTitle className="mt-3">Lifecycle</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-sm">
                    <CircleAlert className="size-4 text-muted-foreground" />
                    {lifecycleValue}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    Sunset: {model.sunsetOn ?? "Unavailable"}. An absent date is
                    not a promise of indefinite availability.
                  </p>
                </CardContent>
                <CardFooter>
                  <Link
                    className="text-xs font-medium hover:underline"
                    href="/model-lifecycle/"
                  >
                    Open lifecycle monitor →
                  </Link>
                </CardFooter>
              </Card>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-muted/25 px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-7xl">
            <div className="mb-7">
              <p className="font-mono text-xs text-muted-foreground">
                04 / ENDPOINT PRICE MATRIX
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                Endpoint price matrix
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Only the selected route returned by the requested profile is
                shown. No provider-direct, routed, or managed estimate is
                inserted.
              </p>
            </div>
            {model.route === null ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                No selected route price was supplied for this model.
              </div>
            ) : (
              <>
                <div className="grid gap-3 md:hidden">
                  <Card>
                    <CardHeader><CardTitle>{model.route}</CardTitle></CardHeader>
                    <CardContent><dl className="grid gap-3 text-sm">
                      {[
                        ["Access", model.access ?? "Unavailable"],
                        ["Input / 1M", formatRouteSurfacePrice(model.inputUsdPerMillion)],
                        ["Output / 1M", formatRouteSurfacePrice(model.outputUsdPerMillion)],
                        ["Cache read / 1M", formatRouteSurfacePrice(model.cacheReadUsdPerMillion)],
                        ["Cache write / 1M", formatRouteSurfacePrice(model.cacheWriteUsdPerMillion)],
                        ["Long-context input / 1M", formatRouteSurfacePrice(model.longContextInputUsdPerMillion)],
                        ["Context", formatRouteSurfaceTokens(model.contextWindowTokens)],
                        ["Max output", formatRouteSurfaceTokens(model.maxOutputTokens)],
                      ].map(([label, value]) => <div className="flex justify-between gap-4" key={label}><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-mono">{value}</dd></div>)}
                    </dl></CardContent>
                  </Card>
                </div>
                <div aria-label="Exact endpoint price table" className="hidden overflow-x-auto rounded-xl border border-border md:block" role="region" tabIndex={0}>
                <table className="w-full min-w-[1080px] border-collapse text-sm">
                  <thead className="bg-muted/60 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left">Route</th>
                      <th className="px-4 py-3 text-left">Access</th>
                      <th className="px-4 py-3 text-right">Input / 1M</th>
                      <th className="px-4 py-3 text-right">Output / 1M</th>
                      <th className="px-4 py-3 text-right">Cache read</th>
                      <th className="px-4 py-3 text-right">Cache write</th>
                      <th className="px-4 py-3 text-right">Long context</th>
                      <th className="px-4 py-3 text-right">Context</th>
                      <th className="px-4 py-3 text-right">Max output</th>
                      <th className="px-4 py-3 text-left">Evidence state</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-border">
                      <td className="px-4 py-3 font-medium">{model.route}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {model.access ?? "Unavailable"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatRouteSurfacePrice(model.inputUsdPerMillion)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatRouteSurfacePrice(model.outputUsdPerMillion)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{formatRouteSurfacePrice(model.cacheReadUsdPerMillion)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatRouteSurfacePrice(model.cacheWriteUsdPerMillion)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatRouteSurfacePrice(model.longContextInputUsdPerMillion)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatRouteSurfaceTokens(model.contextWindowTokens)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatRouteSurfaceTokens(model.maxOutputTokens)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">
                          {mode === "preview"
                            ? "Preview-only · not verified"
                            : "Published data"}
                        </Badge>
                      </td>
                    </tr>
                  </tbody>
                </table>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[.8fr_1.2fr]">
            <div>
              <p className="font-mono text-xs text-muted-foreground">
                05 / WORKLOAD EXAMPLE
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                Translate token volume into a planning estimate
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                This transparent example uses the selected route’s 75% input and
                25% output split. It is not a workload outcome or a provider
                price guarantee.
              </p>
              <Link
                className={cn(buttonVariants({ variant: "outline" }), "mt-6")}
                href="/subscribe-vs-api/"
              >
                Open full simulator
                <ArrowRight />
              </Link>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Monthly token volume</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="font-mono text-3xl tabular-nums">
                      {monthlyTokens}M
                    </p>
                    <p className="text-xs text-muted-foreground">
                      combined tokens
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-3xl tabular-nums">
                      {monthlyCost === null
                        ? "Unavailable"
                        : `$${monthlyCost.toFixed(2)}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      selected-route estimate
                    </p>
                  </div>
                </div>
                <Slider
                  aria-label="Monthly token volume in millions"
                  className="mt-8"
                  max={100}
                  min={1}
                  onValueChange={(value) =>
                    setMonthlyTokens(
                      (Array.isArray(value) ? value[0] : value) ?? 1,
                    )
                  }
                  step={1}
                  value={[monthlyTokens]}
                />
                <div className="mt-4 flex justify-between text-xs text-muted-foreground">
                  <span>1M</span>
                  <span>100M</span>
                </div>
                <dl className="mt-6 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
                  <div className="bg-card p-4"><dt className="text-xs text-muted-foreground">Input line · {inputTokens.toFixed(2)}M</dt><dd className="mt-2 font-mono">{inputLineCost === null ? "Unavailable" : `$${inputLineCost.toFixed(2)}`}</dd></div>
                  <div className="bg-card p-4"><dt className="text-xs text-muted-foreground">Output line · {outputTokens.toFixed(2)}M</dt><dd className="mt-2 font-mono">{outputLineCost === null ? "Unavailable" : `$${outputLineCost.toFixed(2)}`}</dd></div>
                </dl>
              </CardContent>
              <CardFooter>
                <p className="text-xs text-muted-foreground">
                  {inputTokens.toFixed(2)}M input · {outputTokens.toFixed(2)}M
                  output
                </p>
              </CardFooter>
            </Card>
          </div>
        </section>

        <section className="border-y border-border bg-muted/25 px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-2">
            <div>
              <p className="font-mono text-xs text-muted-foreground">
                06 / EVIDENCE HISTORY &amp; CONFLICTS
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                Evidence receipt
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                Source records remain attached to the requested profile. A
                missing field is not resolved by substituting another route or
                model.
              </p>
              <dl className="mt-6 grid gap-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Task economics</dt>
                  <dd>
                    {model.costUsdPerSuccessfulTask === null
                      ? "Unavailable"
                      : `$${model.costUsdPerSuccessfulTask.toFixed(2)} / successful task`}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Workload</dt>
                  <dd className="text-right">
                    {model.workload ?? "Unavailable"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Input modalities</dt>
                  <dd>{model.inputModalities.join(", ") || "Unavailable"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Output modalities</dt>
                  <dd>{model.outputModalities.join(", ") || "Unavailable"}</dd>
                </div>
              </dl>
              <div className="mt-6 rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-medium">Limitations and conflicts</h3>
                <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
                  <li>Capability, runtime, lifecycle, and price facts may have different source timestamps; this page does not merge them into one observation.</li>
                  <li>A selected route identifies the priced endpoint only. It does not imply every provider endpoint shares the same limits or runtime.</li>
                  <li>Unavailable cache, long-context, or lifecycle fields remain absent from the estimate rather than inheriting a standard input price.</li>
                </ul>
              </div>
            </div>
            <RouteEvidenceSources
              sources={sources}
              title="Profile provenance"
            />
          </div>
        </section>
      </div>

      <section className="px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <Sparkles className="mx-auto size-6 text-muted-foreground" />
          <h2 className="mt-5 text-3xl font-semibold tracking-tight">
            Turn this profile into a decision.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Add {model.name} to an ordered comparison or return to the current
            model response to build a different short list.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <Link
              className={buttonVariants()}
              href={`/compare?models=${encodeURIComponent(model.id)}`}
            >
              Add to comparison
              <ArrowRight />
            </Link>
            <Link
              className={buttonVariants({ variant: "outline" })}
              href="/models/"
            >
              Back to model workbench
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
