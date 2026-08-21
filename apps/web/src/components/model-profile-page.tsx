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
import { type ReactNode, useState } from "react";

import { formatDisplayNumber, roundDisplayValue } from "@tokenbench/frontend/display-format";
import { presentEvidence } from "@tokenbench/frontend/presentation-value";

import { ResultActions } from "@/components/result-actions";
import {
  DataValueText,
  DataText,
  availableValue,
  unavailableValue,
  type PresentationValue,
} from "@/components/untitled-data/data-value";
import { ProvenanceActivityFeed } from "@/components/untitled-data/application/activity-feed/activity-feed";
import { DataTableCard } from "@/components/untitled-data/application/table/table";
import { DataMetrics } from "@/components/untitled-data/metrics";
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

function priceValue(value: number | null | undefined, reason: string): PresentationValue<number> {
  return value === null || value === undefined
    ? unavailableValue(reason)
    : availableValue(value, formatRouteSurfacePrice(value));
}

function formatPerRequestLimit(value: unknown): string {
  if (typeof value === "number") return formatDisplayNumber(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value;
  return JSON.stringify(value, (_key, nested) =>
    typeof nested === "number" ? Number(nested.toFixed(2)) : nested,
  ) ?? "-";
}

function PerRequestLimits({
  value,
}: {
  value: PresentationValue<Readonly<Record<string, unknown>>>;
}) {
  if (value.availability === "unavailable" || value.value === null) {
    return <DataValueText value={value} />;
  }
  const entries = Object.entries(value.value);
  if (entries.length === 0) return <span className="text-muted-foreground">No listed limits</span>;
  return (
    <details className="group text-left">
      <summary className="cursor-pointer list-none text-link hover:underline">
        {entries.length} limit{entries.length === 1 ? "" : "s"}
      </summary>
      <dl className="mt-2 space-y-1 border-l border-border pl-3 text-xs text-muted-foreground">
        {entries.map(([key, limit]) => (
          <div className="flex justify-between gap-4" key={key}>
            <dt>{key}</dt>
            <dd className="font-mono text-foreground">
              {formatPerRequestLimit(limit)}
            </dd>
          </div>
        ))}
      </dl>
    </details>
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
  const specifications = model.specifications;
  const dataReceiptRows: readonly { content: ReactNode; label: string }[] = [
    {
      label: "Created",
      content: <DataValueText value={presentEvidence(specifications?.createdAt)} />,
    },
    {
      label: "Expiration",
      content: <DataValueText value={presentEvidence(specifications?.expirationDate)} />,
    },
    {
      label: "Knowledge cutoff",
      content: <DataValueText value={presentEvidence(specifications?.knowledgeCutoff)} />,
    },
    {
      label: "Tokenizer",
      content: <DataValueText value={presentEvidence(specifications?.tokenizer)} />,
    },
    {
      label: "Instruction format",
      content: <DataValueText value={presentEvidence(specifications?.instructionFormat)} />,
    },
    {
      label: "Moderated",
      content: <DataValueText value={presentEvidence(specifications?.isModerated, (value) => value ? "Yes" : "No")} />,
    },
    {
      label: "Supported parameters",
      content: <DataValueText value={presentEvidence(specifications?.supportedParameters, (value) => value.join(", "))} />,
    },
    {
      label: "Per-request limits",
      content: <PerRequestLimits value={presentEvidence(specifications?.perRequestLimits)} />,
    },
    {
      label: "Benchmark coverage",
      content: model.sourceCoverage === undefined
        ? <DataValueText value={unavailableValue("No benchmark or category coverage was supplied.")} />
        : <DataValueText value={availableValue(
          model.sourceCoverage,
          `${model.sourceCoverage.benchmarkCount} benchmarks · ${model.sourceCoverage.categoryCount} categories · ${model.sourceCoverage.rankedCategoryCount} ranked`,
        )} />,
    },
    {
      label: "Overall benchmark rank",
      content: model.benchmark?.overallRank === null || model.benchmark?.overallRank === undefined
        ? <DataValueText value={unavailableValue("No overall benchmark rank was supplied.")} />
        : <DataValueText value={availableValue(model.benchmark.overallRank, `#${model.benchmark.overallRank}`)} />,
    },
    {
      label: "Category field sizes",
      content: model.benchmark === undefined || model.benchmark.categories.length === 0
        ? <DataValueText value={unavailableValue("No benchmark category field sizes were supplied.")} />
        : <DataText
          reason="No benchmark category field sizes were supplied."
          value={model.benchmark.categories
            .map((category) => category.fieldSize === null ? null : `${category.label}: ${category.fieldSize}`)
            .filter((value): value is string => value !== null)
            .join(" · ") || null}
        />,
    },
    {
      label: "Source coverage",
      content: model.sourceCoverage === undefined
        ? <DataValueText value={unavailableValue("No source coverage count was supplied.")} />
        : <DataValueText value={availableValue(model.sourceCoverage.sourceCount, String(model.sourceCoverage.sourceCount))} />,
    },
    {
      label: "Freshness",
      content: model.freshness === undefined
        ? <DataValueText value={unavailableValue("No freshness status was supplied.")} />
        : <DataValueText value={availableValue(model.freshness.status, model.freshness.status === "fresh" ? "Fresh" : "Stale")} />,
    },
    {
      label: "Checked",
      content: model.freshness === undefined
        ? <DataValueText value={unavailableValue("No freshness check time was supplied.")} />
        : <DataValueText value={availableValue(model.freshness.checkedAt, model.freshness.checkedAt)} />,
    },
    {
      label: "Cache write / 1M",
      content: <DataValueText value={priceValue(model.cacheWriteUsdPerMillion, "No cache-write price was supplied.")} />,
    },
  ];
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
  const lifecycleValue = <DataText reason="No lifecycle status was supplied for this model." value={model.lifecycleStatus} />;

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
                  <DataText reason="No provider was supplied for this model." value={model.provider} />
                </Badge>
                <Badge variant="outline">
                  <DataText reason="No access type was supplied for this model." value={model.access} />
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
          <div className="mx-auto max-w-7xl">
            <DataMetrics
              items={[
                {
                  label: "Capability",
                  note: "Published capability observation.",
                  value:
                    model.capabilityScore === null
                      ? unavailableValue("No compatible capability value was supplied.")
                      : availableValue(
                          model.capabilityScore,
                          formatDisplayNumber(model.capabilityScore),
                        ),
                },
                {
                  label: "Context",
                  note: "Selected-route context window.",
                  value:
                    model.contextWindowTokens === null
                      ? unavailableValue("The selected route did not supply a context window.")
                      : availableValue(
                          model.contextWindowTokens,
                          formatRouteSurfaceTokens(model.contextWindowTokens),
                        ),
                },
                {
                  label: "Input price",
                  note: "Selected-route price per million tokens.",
                  value: priceValue(
                    model.inputUsdPerMillion,
                    "The selected route did not supply an input price.",
                  ),
                },
                {
                  label: "Output price",
                  note: "Selected-route generated-token price.",
                  value: priceValue(
                    model.outputUsdPerMillion,
                    "The selected route did not supply an output price.",
                  ),
                },
                {
                  label: "Throughput",
                  note: "Observed p50 throughput, not an SLA.",
                  value:
                    model.outputTokensPerSecond === null
                      ? unavailableValue("No runtime observation was supplied.")
                      : availableValue(
                          model.outputTokensPerSecond,
                          `${formatDisplayNumber(model.outputTokensPerSecond)} tok/s`,
                        ),
                },
              ]}
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
                        <dd className="font-mono"><DataText format={formatDisplayNumber} reason={`No percentile was supplied for ${axis.label}.`} value={axis.percentile} /></dd>
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
                    <span><DataText reason="No provider was supplied for this model." value={model.provider} /></span>
                  </p>
                  <p className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Model ID</span>
                    <span className="font-mono text-xs">{model.id}</span>
                  </p>
                  <p className="flex justify-between gap-4">
                    <span className="text-muted-foreground">
                      Benchmark release
                    </span>
                    <span><DataText reason="No benchmark release was supplied for this model." value={model.benchmarkReleaseOn} /></span>
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
                      <DataText reason="No selected route was supplied for this model." value={model.route} />
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
                    Sunset: <DataText reason="No sunset date was supplied for this model." value={model.sunsetOn} />. An absent date is
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
                        {
                          label: "Access",
                          value: <DataText reason="No access type was supplied for this model." value={model.access} />,
                        },
                        {
                          label: "Input / 1M",
                          value: <DataText format={formatRouteSurfacePrice} reason="No input price was supplied for this route." value={model.inputUsdPerMillion} />,
                        },
                        {
                          label: "Output / 1M",
                          value: <DataText format={formatRouteSurfacePrice} reason="No output price was supplied for this route." value={model.outputUsdPerMillion} />,
                        },
                        {
                          label: "Cache read / 1M",
                          value: <DataText format={formatRouteSurfacePrice} reason="No cache-read price was supplied for this route." value={model.cacheReadUsdPerMillion} />,
                        },
                        {
                          label: "Cache write / 1M",
                          value: <DataText format={formatRouteSurfacePrice} reason="No cache-write price was supplied for this route." value={model.cacheWriteUsdPerMillion} />,
                        },
                        {
                          label: "Long-context input / 1M",
                          value: <DataText format={formatRouteSurfacePrice} reason="No long-context input price was supplied for this route." value={model.longContextInputUsdPerMillion} />,
                        },
                        {
                          label: "Context",
                          value: <DataText format={formatRouteSurfaceTokens} reason="No context window was supplied for this route." value={model.contextWindowTokens} />,
                        },
                        {
                          label: "Max output",
                          value: <DataText format={formatRouteSurfaceTokens} reason="No maximum output was supplied for this route." value={model.maxOutputTokens} />,
                        },
                      ].map(({ label, value }) => <div className="flex justify-between gap-4" key={label}><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-mono">{value}</dd></div>)}
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
                        <DataText reason="No access type was supplied for this model." value={model.access} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        <DataText format={formatRouteSurfacePrice} reason="No input price was supplied for this route." value={model.inputUsdPerMillion} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        <DataText format={formatRouteSurfacePrice} reason="No output price was supplied for this route." value={model.outputUsdPerMillion} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono"><DataText format={formatRouteSurfacePrice} reason="No cache-read price was supplied for this route." value={model.cacheReadUsdPerMillion} /></td>
                      <td className="px-4 py-3 text-right font-mono"><DataText format={formatRouteSurfacePrice} reason="No cache-write price was supplied for this route." value={model.cacheWriteUsdPerMillion} /></td>
                      <td className="px-4 py-3 text-right font-mono"><DataText format={formatRouteSurfacePrice} reason="No long-context input price was supplied for this route." value={model.longContextInputUsdPerMillion} /></td>
                      <td className="px-4 py-3 text-right font-mono"><DataText format={formatRouteSurfaceTokens} reason="No context window was supplied for this route." value={model.contextWindowTokens} /></td>
                      <td className="px-4 py-3 text-right font-mono"><DataText format={formatRouteSurfaceTokens} reason="No maximum output was supplied for this route." value={model.maxOutputTokens} /></td>
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
                {model.routes?.length ? (
                  <details className="mt-4 rounded-xl border border-border bg-card p-4">
                    <summary className="cursor-pointer text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      Inspect {model.routes.length} supplied route receipt{model.routes.length === 1 ? "" : "s"}
                    </summary>
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[760px] text-xs">
                        <caption className="sr-only">Exact route receipt meters and provenance</caption>
                        <thead className="bg-muted/60 text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 text-left">Route receipt</th>
                            <th className="px-3 py-2 text-right">Input / 1M</th>
                            <th className="px-3 py-2 text-right">Output / 1M</th>
                            <th className="px-3 py-2 text-right">Cache write / 1M</th>
                            <th className="px-3 py-2 text-right">Context</th>
                            <th className="px-3 py-2 text-left">Verification</th>
                          </tr>
                        </thead>
                        <tbody>
                          {model.routes.map((route) => (
                            <tr className="border-t border-border" key={`${route.receipt.providerId}-${route.receipt.routeId}-${route.receipt.observedAt}`}>
                              <td className="px-3 py-2">
                                <a className="text-primary underline underline-offset-2 hover:no-underline dark:text-[#9dabff]" href={route.receipt.sourceUrl} rel="noreferrer" target="_blank">
                                  {route.receipt.routeId}
                                </a>
                                <span className="ml-2 text-muted-foreground">{route.receipt.observedAt}</span>
                              </td>
                              <td className="px-3 py-2 text-right font-mono"><DataValueText value={presentEvidence(route.inputUsdPerMillion, formatRouteSurfacePrice)} /></td>
                              <td className="px-3 py-2 text-right font-mono"><DataValueText value={presentEvidence(route.outputUsdPerMillion, formatRouteSurfacePrice)} /></td>
                              <td className="px-3 py-2 text-right font-mono"><DataValueText value={presentEvidence(route.cacheWriteUsdPerMillion, formatRouteSurfacePrice)} /></td>
                              <td className="px-3 py-2 text-right font-mono"><DataValueText value={presentEvidence(route.contextWindowTokens, formatRouteSurfaceTokens)} /></td>
                              <td className="px-3 py-2 text-muted-foreground">{route.receipt.verificationStatus}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ) : null}
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
                      <DataText format={(value) => `$${value.toFixed(2)}`} reason="The selected route did not supply both input and output prices for this estimate." value={monthlyCost} />
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
                  <div className="bg-card p-4"><dt className="text-xs text-muted-foreground">Input line · {inputTokens.toFixed(2)}M</dt><dd className="mt-2 font-mono"><DataText format={(value) => `$${value.toFixed(2)}`} reason="The selected route did not supply an input price for this estimate." value={inputLineCost} /></dd></div>
                  <div className="bg-card p-4"><dt className="text-xs text-muted-foreground">Output line · {outputTokens.toFixed(2)}M</dt><dd className="mt-2 font-mono"><DataText format={(value) => `$${value.toFixed(2)}`} reason="The selected route did not supply an output price for this estimate." value={outputLineCost} /></dd></div>
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
              <div className="mt-6 grid gap-4">
                <DataTableCard
                  description="Only fields emitted by the accepted model record are shown; a dash means no accepted value was supplied."
                  title="Model data receipt"
                  trailing={
                    <span className="text-xs text-muted-foreground">
                      {sources.length} attached source{sources.length === 1 ? "" : "s"}
                    </span>
                  }
                >
                  <table className="w-full min-w-[520px] text-sm">
                    <caption className="sr-only">Model data receipt</caption>
                    <tbody>
                      {dataReceiptRows.map((row) => (
                        <tr className="border-t border-border first:border-t-0" key={row.label}>
                          <th className="w-2/5 px-4 py-3 text-left text-xs font-medium text-muted-foreground" scope="row">
                            {row.label}
                          </th>
                          <td className="px-4 py-3 text-right font-mono text-xs">
                            {row.content}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DataTableCard>
                <ProvenanceActivityFeed
                  items={sources.map((source) => ({
                      detail: source.note,
                      id: source.id,
                      observedAt:
                        source.effectiveAt === null
                          ? unavailableValue("This source did not supply an effective time.")
                          : availableValue(source.effectiveAt, source.effectiveAt),
                      sourceLabel: source.kind.replaceAll("_", " "),
                      sourceUrl: source.url ?? null,
                      title: source.label,
                    }))}
                  title="Profile provenance receipts"
                />
              </div>
              <dl className="mt-6 grid gap-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Task economics</dt>
                  <dd>
                    <DataText format={(value) => `$${value.toFixed(2)} / successful task`} reason="No task economics value was supplied for this model." value={model.costUsdPerSuccessfulTask} />
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Workload</dt>
                  <dd className="text-right">
                    <DataText reason="No workload was supplied for this model." value={model.workload} />
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Input modalities</dt>
                  <dd><DataText format={(value) => value.join(", ")} reason="No input modalities were supplied for this model." value={model.inputModalities.length ? model.inputModalities : null} /></dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Output modalities</dt>
                  <dd><DataText format={(value) => value.join(", ")} reason="No output modalities were supplied for this model." value={model.outputModalities.length ? model.outputModalities : null} /></dd>
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
