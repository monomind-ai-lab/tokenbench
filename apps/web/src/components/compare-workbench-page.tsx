"use client";

import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  GitCompareArrows,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatDisplayNumber, roundDisplayValue } from "@tokenbench/frontend/display-format";

import { ResultActions, type CsvRow } from "@/components/result-actions";
import { DataText } from "@/components/untitled-data/data-value";
import {
  RouteEvidenceCapabilityRadar,
  RouteEvidencePriceCharts,
  RouteEvidenceRuntimeCharts,
} from "@/components/route-evidence-charts";
import {
  RouteEvidenceCapabilityBars,
  formatRouteSurfacePrice,
  formatRouteSurfaceTokens,
} from "@/components/route-evidence-visuals";
import {
  RouteEvidenceModeNotice,
  RouteEvidenceSources,
} from "@/components/route-evidence-ui";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  ModelSurfaceMode,
  SurfaceComparison,
  SurfaceModel,
} from "@tokenbench/frontend/model-surface-projectors";
import type { Provenance } from "@tokenbench/frontend/preview-data/contracts";
import { cn } from "@/lib/utils";

function Dot({ model }: { model: SurfaceModel }) {
  return (
    <span
      aria-hidden="true"
      className="size-2.5 shrink-0 rounded-full ring-4 ring-current/10"
      style={{ backgroundColor: model.color, color: model.color }}
    />
  );
}

function blendedPrice(model: SurfaceModel): number | null {
  return model.inputUsdPerMillion === null || model.outputUsdPerMillion === null
    ? null
    : model.inputUsdPerMillion * 0.75 + model.outputUsdPerMillion * 0.25;
}

function exportMeasurement(value: number | null): number | null {
  return value === null ? null : roundDisplayValue(value);
}

function extreme(
  models: readonly SurfaceModel[],
  value: (model: SurfaceModel) => number | null,
  direction: "min" | "max",
): SurfaceModel | null {
  const available = models.filter((model) => value(model) !== null);
  if (available.length === 0) return null;
  return (
    available.toSorted((left, right) =>
      direction === "min"
        ? (value(left) as number) - (value(right) as number)
        : (value(right) as number) - (value(left) as number),
    )[0] ?? null
  );
}

function requestedSlots(
  requestedIds: readonly string[],
  comparison: SurfaceComparison | null,
): readonly (SurfaceModel | null)[] {
  return requestedIds.map((_, index) => comparison?.models[index] ?? null);
}

function capabilityRows(
  models: readonly SurfaceModel[],
): readonly {
  key: string;
  label: string;
  values: readonly (number | null)[];
}[] {
  const rows = new Map<
    string,
    { key: string; label: string; values: (number | null)[] }
  >();
  models.forEach((model, index) =>
    model.capabilityAxes.forEach((axis) => {
      const current = rows.get(axis.key) ?? {
        key: axis.key,
        label: axis.label,
        values: Array.from({ length: models.length }, () => null),
      };
      current.values[index] = axis.percentile;
      rows.set(axis.key, current);
    }),
  );
  return [...rows.values()];
}

export function CompareWorkbenchPage({
  candidates,
  comparison,
  requestedIds,
  validRequest,
  mode,
  status,
  sources,
}: {
  candidates: readonly SurfaceModel[];
  comparison: SurfaceComparison | null;
  requestedIds: readonly string[];
  validRequest: boolean;
  mode: ModelSurfaceMode;
  status: "available" | "partial" | "unavailable";
  sources: readonly Provenance[];
}) {
  const router = useRouter();
  const [candidate, setCandidate] = useState("");
  const slots = requestedSlots(requestedIds, comparison);
  const models = slots.filter((model): model is SurfaceModel => model !== null);
  const available = candidates.filter(
    (model) => !requestedIds.includes(model.id),
  );
  const candidateIsAvailable = available.some((model) => model.id === candidate);
  const quickPairs = candidates.slice(0, 4).reduce<string[][]>((pairs, model, index) => {
    if (index % 2 === 0) pairs.push([model.id]);
    else pairs[pairs.length - 1]?.push(model.id);
    return pairs;
  }, []).filter((pair) => pair.length === 2);
  const labels = requestedIds.map((id, index) => slots[index]?.name ?? id);
  const navigate = (ids: string[]) =>
    router.push(
      ids.length
        ? `/compare?models=${ids.map(encodeURIComponent).join(",")}`
        : "/compare",
    );
  const addCandidate = () => {
    if (!candidateIsAvailable || requestedIds.length >= 4) return;
    navigate([...requestedIds, candidate]);
    setCandidate("");
  };
  const remove = (id: string) =>
    navigate(requestedIds.filter((value) => value !== id));
  const rows: CsvRow[] = [];
  requestedIds.forEach((id, index) => {
    const model = slots[index];
    if (model === null) {
      rows.push({
        model: id,
        metric: "Evidence",
        value: null,
        state: "Unavailable",
      });
      return;
    }
    rows.push(
      {
        model: model.name,
        metric: "Capability value",
        value: exportMeasurement(model.capabilityScore),
        unit: "score",
      },
      {
        model: model.name,
        metric: "Context window",
        value: model.contextWindowTokens,
        unit: "tokens",
      },
      {
        model: model.name,
        metric: "Input price",
        value: exportMeasurement(model.inputUsdPerMillion),
        unit: "USD / 1M tokens",
      },
      {
        model: model.name,
        metric: "Output price",
        value: exportMeasurement(model.outputUsdPerMillion),
        unit: "USD / 1M tokens",
      },
      {
        model: model.name,
        metric: "TTFT p50",
        value: exportMeasurement(model.ttftP50Seconds),
        unit: "seconds",
      },
      {
        model: model.name,
        metric: "Observed throughput",
        value: exportMeasurement(model.outputTokensPerSecond),
        unit: "tokens / second",
      },
    );
  });
  const bestEvidence = extreme(models, (model) => model.capabilityScore, "max");
  const cheapest = extreme(models, blendedPrice, "min");
  const largestContext = extreme(
    models,
    (model) => model.contextWindowTokens,
    "max",
  );
  const fastest = extreme(
    models,
    (model) => model.outputTokensPerSecond,
    "max",
  );
  const capability = capabilityRows(models);
  const decisionDeltas: readonly {
    label: string;
    model: SurfaceModel | null;
    value: number | null;
    format: (value: number) => string;
    reason: string;
  }[] = [
    {
      label: "Highest capability",
      model: bestEvidence,
      value: bestEvidence?.capabilityScore ?? null,
      format: formatDisplayNumber,
      reason: "No published capability value was supplied for the requested models.",
    },
    {
      label: "Lowest blended price",
      model: cheapest,
      value: cheapest === null ? null : blendedPrice(cheapest),
      format: (value) => `${formatRouteSurfacePrice(value)} / 1M`,
      reason: "No requested model supplied both an input and output price.",
    },
    {
      label: "Largest context",
      model: largestContext,
      value: largestContext?.contextWindowTokens ?? null,
      format: formatRouteSurfaceTokens,
      reason: "No context window was supplied for the requested models.",
    },
    {
      label: "Fastest observation",
      model: fastest,
      value: fastest?.outputTokensPerSecond ?? null,
      format: (value) => `${formatDisplayNumber(value)} tok/s`,
      reason: "No throughput observation was supplied for the requested models.",
    },
  ];
  const insufficient = !validRequest || requestedIds.length < 2;

  return (
    <main>
      <section className="border-b border-border px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <Badge
            className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em]"
            variant="secondary"
          >
            Comparison workbench
          </Badge>
          <div className="grid gap-8 lg:grid-cols-[1fr_420px] lg:items-end">
            <div>
              <h1 className="max-w-4xl text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
                Compare models without flattening the evidence.
              </h1>
              <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
                Review an exact ordered set across capability, runtime, and
                endpoint economics. Unknown observations remain unavailable—not
                zero.
              </p>
              <RouteEvidenceModeNotice mode={mode} status={status} />
              {!validRequest && requestedIds.length > 0 ? (
                <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                  The models query must contain two to four distinct route-safe
                  slugs. It was not normalized into another comparison.
                </p>
              ) : null}
            </div>
            <Card>
              <CardHeader>
                <CardTitle>
                  {requestedIds.length
                    ? `${requestedIds.length}/4 requested`
                    : "Start a comparison"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {requestedIds.map((id, index) => {
                  const model = slots[index];
                  return (
                    <div
                      className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3"
                      key={`${id}-${index}`}
                    >
                      {model ? (
                        <Dot model={model} />
                      ) : (
                        <CircleAlert className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">
                          {model?.name ?? id}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          <DataText reason="No provider evidence was supplied for this requested model." value={model?.provider ?? null} />
                        </span>
                      </span>
                      <Button
                        aria-label={`Remove ${model?.name ?? id}`}
                        onClick={() => remove(id)}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <X />
                      </Button>
                    </div>
                  );
                })}
                {requestedIds.length < 4 ? (
                  <div className="flex gap-2 pt-2">
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Add a model</span>
                      <input
                        autoComplete="off"
                        className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
                        list="compare-model-options"
                        onChange={(event) => setCandidate(event.target.value)}
                        placeholder="Search supplied models"
                        type="search"
                        value={candidate}
                      />
                      <datalist id="compare-model-options">
                        {available.map((model) => (
                          <option key={model.id} label={`${model.name} — ${model.provider ?? "-"}`} title={model.provider === null ? "No provider evidence was supplied for this model." : undefined} value={model.id} />
                        ))}
                      </datalist>
                    </label>
                    <Button
                      disabled={!candidateIsAvailable || !validRequest}
                      onClick={addCandidate}
                    >
                      <Plus />
                      Add
                    </Button>
                  </div>
                ) : null}
              </CardContent>
              <CardFooter className="justify-between">
                <span className="text-xs text-muted-foreground">
                  Minimum 2 · maximum 4
                </span>
                {requestedIds.length ? (
                  <Button
                    onClick={() => navigate([])}
                    size="sm"
                    variant="ghost"
                  >
                    <RotateCcw />
                    Clear
                  </Button>
                ) : null}
              </CardFooter>
            </Card>
          </div>
          {quickPairs.length ? (
            <nav aria-label="Quick model pairs" className="mt-6 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs text-muted-foreground">Quick pairs</span>
              {quickPairs.map((pair) => (
                <Button key={pair.join(",")} onClick={() => navigate(pair)} size="sm" variant="outline">
                  {pair.map((id) => candidates.find((model) => model.id === id)?.name ?? id).join(" vs ")}
                </Button>
              ))}
            </nav>
          ) : null}
        </div>
      </section>

      {insufficient ? (
        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-3xl rounded-2xl border border-dashed border-border p-8 text-center sm:p-14">
            <GitCompareArrows className="mx-auto size-7 text-muted-foreground" />
            <h2 className="mt-5 text-2xl font-semibold">
              Add {requestedIds.length ? "one more model" : "two models"} to
              begin
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
              The result appears only when the ordered URL contains two to four
              distinct model slugs. Existing query values are never replaced
              with a catalog selection.
            </p>
            <Link
              className={cn(buttonVariants({ variant: "outline" }), "mt-7")}
              href="/models/"
            >
              Choose from the model workbench
              <ArrowRight />
            </Link>
          </div>
        </section>
      ) : null}

      {!insufficient ? (
        <div id="comparison-result">
          <section className="px-4 py-12 sm:px-6 sm:py-16">
            <div className="mx-auto max-w-7xl">
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">
                    01 / REVIEW RESULT
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                    {labels.join(" vs ")}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Ordered selection:{" "}
                    <span className="font-mono">{requestedIds.join(",")}</span>
                  </p>
                </div>
                <ResultActions
                  filename={`tokenbench-${requestedIds.join("-vs-")}`}
                  rows={rows}
                  targetId="comparison-result"
                />
              </div>
              <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
                {requestedIds.map((id, index) => {
                  const model = slots[index];
                  return (
                    <div className="bg-card p-5" key={`${id}-${index}`}>
                      {model ? (
                        <>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Dot model={model} />
                            <DataText reason="No provider was supplied for this model." value={model.provider} />
                          </div>
                          <p className="mt-4 text-lg font-medium">
                            {model.name}
                          </p>
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">
                            <DataText reason="No access type was supplied for this model." value={model.access} /> ·{" "}
                            <DataText reason="No selected route was supplied for this model." value={model.route} />
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Sources: <DataText reason="No source coverage count was supplied for this model." value={model.sourceCoverage?.sourceCount} /> · Freshness: <DataText format={(value) => value === "fresh" ? "Fresh" : "Stale"} reason="No freshness status was supplied for this model." value={model.freshness?.status} />
                          </p>
                          <Link
                            className="mt-4 inline-flex items-center gap-1 text-xs font-medium hover:underline"
                            href={`/model-profile?model=${encodeURIComponent(model.id)}`}
                          >
                            Open profile <ArrowRight className="size-3" />
                          </Link>
                        </>
                      ) : (
                        <>
                          <CircleAlert className="size-4 text-muted-foreground" />
                          <p className="mt-4 text-lg font-medium">{id}</p>
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">
                            Unavailable. This exact requested slug was not
                            replaced with a similar model.
                          </p>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="border-y border-border bg-muted/25 px-4 py-12 sm:px-6 sm:py-16">
            <div className="mx-auto max-w-7xl">
              <div className="mb-7">
                <p className="font-mono text-xs text-muted-foreground">
                  02 / CAPABILITY
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  Shared capability evidence
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  The bar representation and table contain only supplied axes.
                  An absent side or category remains unavailable.
                </p>
              </div>
              {models.length ? (
                <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
                  <Card>
                    <CardContent className="pt-6">
                      <RouteEvidenceCapabilityRadar models={models} />
                      {models.every((model) => model.capabilityAxes.filter((axis) => axis.percentile !== null).length < 3) ? (
                        <RouteEvidenceCapabilityBars models={models} compact />
                      ) : null}
                    </CardContent>
                  </Card>
                  <div className="grid gap-3 md:hidden">
                    {capability.map((row) => (
                      <Card key={row.key}>
                        <CardHeader><CardTitle>{row.label}</CardTitle></CardHeader>
                        <CardContent><dl className="grid gap-3 text-sm">
                        {requestedIds.map((id, index) => {
                          const selected = slots[index];
                          const value = selected?.capabilityAxes.find((axis) => axis.key === row.key)?.percentile ?? null;
                          return <div className="flex justify-between gap-4" key={`${id}-${row.key}`}><dt className="text-muted-foreground">{selected?.name ?? id}</dt><dd className="font-mono"><DataText format={formatDisplayNumber} reason="No published value was supplied for this capability category." value={value} /></dd></div>;
                        })}
                        </dl></CardContent>
                      </Card>
                    ))}
                  </div>
                  <div aria-label="Exact capability comparison table" className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block" role="region" tabIndex={0}>
                    <table className="w-full min-w-[560px] border-collapse text-sm">
                      <thead className="bg-muted/60 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 text-left">Capability</th>
                          {labels.map((label, index) => (
                            <th
                              className="px-4 py-3 text-right"
                              key={`${label}-${index}`}
                            >
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {capability.map((row) => (
                          <tr className="border-t border-border" key={row.key}>
                            <td className="px-4 py-3 text-muted-foreground">
                              {row.label}
                            </td>
                            {requestedIds.map((id, index) => (
                              <td
                                className="px-4 py-3 text-right font-mono"
                                key={`${id}-${index}`}
                              >
                                <DataText
                                  format={formatDisplayNumber}
                                  reason="No published value was supplied for this capability category."
                                  value={slots[index] === null
                                    ? null
                                    : row.values[models.indexOf(slots[index] as SurfaceModel)] ?? null}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                  No accepted comparison capability record was returned for this
                  exact query.
                </div>
              )}
            </div>
          </section>

          <section className="px-4 py-12 sm:px-6 sm:py-16">
            <div className="mx-auto max-w-7xl">
              <div className="mb-7">
                <p className="font-mono text-xs text-muted-foreground">
                  03 / RUNTIME &amp; ECONOMICS
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  Runtime and economics
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Token price, observed throughput, and context capacity keep
                  separate units. Derived blended price explicitly uses the
                  displayed 75% input and 25% output mix.
                </p>
              </div>
              {models.length ? (
                <div className="space-y-4">
                  <RouteEvidenceRuntimeCharts models={models} />
                  <RouteEvidencePriceCharts models={models} />
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                  No accepted comparison economics record was returned for this
                  exact query.
                </div>
              )}
            </div>
          </section>

          <section className="border-y border-border bg-muted/25 px-4 py-12 sm:px-6 sm:py-16">
            <div className="mx-auto max-w-7xl">
              <div className="mb-7">
                <p className="font-mono text-xs text-muted-foreground">
                  04 / DECISION DELTAS
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  What changes across this set
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {decisionDeltas.map(({ label, model, value, format, reason }) => (
                  <Card key={label}>
                    <CardHeader>
                      <p className="text-xs text-muted-foreground">
                        {label}
                      </p>
                      <CardTitle className="mt-2">
                        <DataText reason={`${label} is not available because no qualifying requested model was supplied.`} value={model?.name ?? null} />
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-mono text-xl"><DataText format={format} reason={reason} value={value} /></p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="mt-4 grid gap-3 md:hidden">
                {requestedIds.map((id, index) => {
                  const model = slots[index];
                  return (
                    <Card key={`${id}-decision-mobile`}>
                      <CardHeader><CardTitle>{model?.name ?? id}</CardTitle></CardHeader>
                      <CardContent><dl className="grid gap-3 text-sm">
                        {[
                          { label: "Capability", value: model?.capabilityScore ?? null, format: formatDisplayNumber, reason: "No published capability value was supplied." },
                          { label: "Blended / 1M", value: model === null ? null : blendedPrice(model), format: formatRouteSurfacePrice, reason: "No requested model supplied both input and output prices." },
                          { label: "Throughput", value: model?.outputTokensPerSecond ?? null, format: (value: number) => `${formatDisplayNumber(value)} tok/s`, reason: "No throughput observation was supplied." },
                          { label: "Context", value: model?.contextWindowTokens ?? null, format: formatRouteSurfaceTokens, reason: "No context window was supplied." },
                        ].map(({ label, value, format, reason }) => <div className="flex justify-between gap-4" key={label}><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-mono"><DataText format={format} reason={reason} value={value} /></dd></div>)}
                      </dl></CardContent>
                    </Card>
                  );
                })}
              </div>
              <div aria-label="Exact decision comparison table" className="mt-4 hidden overflow-x-auto rounded-xl border border-border bg-card md:block" role="region" tabIndex={0}>
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead className="bg-muted/60 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left">Model</th>
                      <th className="px-4 py-3 text-right">Capability</th>
                      <th className="px-4 py-3 text-right">Blended / 1M</th>
                      <th className="px-4 py-3 text-right">Throughput</th>
                      <th className="px-4 py-3 text-right">Context</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestedIds.map((id, index) => {
                      const model = slots[index];
                      return (
                        <tr
                          className="border-t border-border"
                          key={`${id}-${index}`}
                        >
                          <td className="px-4 py-3 font-medium">
                            {model?.name ?? id}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            <DataText format={formatDisplayNumber} reason="No published capability value was supplied." value={model?.capabilityScore ?? null} />
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            <DataText format={formatRouteSurfacePrice} reason="No requested model supplied both input and output prices." value={model === null ? null : blendedPrice(model)} />
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            <DataText format={(value) => `${formatDisplayNumber(value)} tok/s`} reason="No throughput observation was supplied." value={model?.outputTokensPerSecond ?? null} />
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            <DataText format={formatRouteSurfaceTokens} reason="No context window was supplied." value={model?.contextWindowTokens ?? null} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="px-4 py-12 sm:px-6 sm:py-16">
            <div className="mx-auto max-w-7xl">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CheckCircle2 className="size-4 text-emerald-500" />
                    Freshness and provenance preserved
                  </div>
                  <CardTitle className="mt-3">
                    Exact request, separate evidence states
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-border p-4">
                    <p className="text-xs text-muted-foreground">
                      Requested models
                    </p>
                    <p className="mt-2 font-mono">{requestedIds.join(", ")}</p>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <p className="text-xs text-muted-foreground">
                      Unavailable requested records
                    </p>
                    <p className="mt-2 font-mono">
                      {comparison?.unavailableIds.length
                        ? comparison.unavailableIds.join(", ")
                        : "None supplied"}
                    </p>
                  </div>
                  <p className="sm:col-span-2 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" />A
                    partial comparison keeps every requested slug visible. It
                    does not fill a missing model, shared timestamp, axis, or
                    price from the candidate list.
                  </p>
                </CardContent>
              </Card>
              <div className="mt-4">
                <RouteEvidenceSources
                  sources={sources}
                  title="Comparison provenance"
                />
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
