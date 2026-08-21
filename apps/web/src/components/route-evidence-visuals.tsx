"use client";

import type { SurfaceModel } from "@tokenbench/frontend/model-surface-projectors";
import { formatDisplayNumber, formatDisplayUsd } from "@tokenbench/frontend/display-format";

function formatPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return formatDisplayUsd(value);
}

function formatTokens(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))}K`;
  return String(Math.round(value));
}

function scale(value: number, min: number, max: number): number {
  if (min === max) return 50;
  return 10 + (80 * (value - min)) / (max - min);
}

export function RouteEvidenceFrontierPlot({
  models,
  logScale = false,
  frontierIds,
}: {
  models: readonly SurfaceModel[];
  logScale?: boolean;
  frontierIds?: ReadonlySet<string>;
}) {
  const suppliedPairs = models.flatMap((model) =>
    model.inputUsdPerMillion !== null &&
    model.capabilityScore !== null &&
    Number.isFinite(model.inputUsdPerMillion) &&
    Number.isFinite(model.capabilityScore)
      ? [
          {
            model,
            price: model.inputUsdPerMillion,
            score: model.capabilityScore,
          },
        ]
      : [],
  );
  const zeroPriceExcluded =
    logScale && suppliedPairs.some(({ price }) => price === 0);
  const plotted = logScale
    ? suppliedPairs.filter(({ price }) => price > 0)
    : suppliedPairs;
  if (plotted.length === 0) {
    return (
      <div className="grid h-[320px] place-items-center rounded-xl border border-dashed border-border px-6 text-center text-sm text-muted-foreground">
        {zeroPriceExcluded
          ? "A logarithmic price axis cannot plot a zero-priced record. Switch to the linear scale to inspect supplied zero prices."
          : "No model has both a published input price and capability value, so no point is plotted."}
      </div>
    );
  }
  const prices = plotted.map(({ price }) => price);
  const coordinates = plotted.map(({ price }) =>
    logScale ? Math.log10(price) : price,
  );
  const scores = plotted.map(({ score }) => score);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const minCoordinate = Math.min(...coordinates);
  const maxCoordinate = Math.max(...coordinates);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);

  return (
    <div
      aria-label={`Capability relative to ${logScale ? "logarithmic " : ""}input price`}
      className="relative h-[320px] rounded-xl border border-border bg-card px-10 pb-10 pt-7"
      role="img"
    >
      <span className="absolute left-3 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] text-muted-foreground">
        Capability
      </span>
      <div className="absolute inset-x-10 bottom-10 top-7 border-b border-l border-border">
        {plotted.map(({ model, price, score }) => {
          const left = scale(
            logScale ? Math.log10(price) : price,
            minCoordinate,
            maxCoordinate,
          );
          const bottom = scale(score, minScore, maxScore);
          const isFrontier = frontierIds?.has(model.id) ?? false;
          const frontierLabel = isFrontier
            ? "; non-dominated among supplied capability and price pairs"
            : "";
          return (
            <span
              aria-label={`${model.name}: ${formatPrice(price)} input per 1M and ${formatDisplayNumber(score)} capability${frontierLabel}`}
              className={`absolute grid -translate-x-1/2 translate-y-1/2 place-items-center border-2 border-background text-[9px] font-semibold text-white shadow-sm ${isFrontier ? "size-9 rounded-md ring-2 ring-foreground/25" : "size-8 rounded-full"}`}
              key={model.id}
              style={{
                backgroundColor: model.color,
                bottom: `${bottom}%`,
                left: `${left}%`,
              }}
              title={`${model.name} · ${formatPrice(price)} input / 1M · ${formatDisplayNumber(score)} capability${isFrontier ? " · supplied-pair frontier" : ""}`}
            >
              {model.name.slice(0, 1)}
            </span>
          );
        })}
      </div>
      {zeroPriceExcluded ? (
        <p className="absolute right-3 top-2 max-w-48 text-right text-[10px] leading-4 text-muted-foreground">
          Zero-priced records are omitted only from this logarithmic view.
        </p>
      ) : null}
      <span className="absolute bottom-3 left-10 text-[10px] text-muted-foreground">
        {formatPrice(minPrice)}
      </span>
      <span className="absolute bottom-3 right-10 text-[10px] text-muted-foreground">
        {formatPrice(maxPrice)}
      </span>
      <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground">
        {logScale ? "Log input price / 1M" : "Input price / 1M"}
      </span>
    </div>
  );
}

function axisMap(
  model: SurfaceModel,
): Map<string, SurfaceModel["capabilityAxes"][number]> {
  return new Map(model.capabilityAxes.map((axis) => [axis.key, axis]));
}

export function RouteEvidenceCapabilityBars({
  models,
  compact = false,
}: {
  models: readonly SurfaceModel[];
  compact?: boolean;
}) {
  const axes = [
    ...new Map(
      models.flatMap((model) =>
        model.capabilityAxes.map((axis) => [axis.key, axis]),
      ),
    ).values(),
  ];
  if (axes.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No capability axes were supplied for this request.
      </p>
    );
  const byModel = models.map(axisMap);
  return (
    <div className={compact ? "space-y-3" : "space-y-5"}>
      {axes.map((axis) => (
        <section className="space-y-2" key={axis.key}>
          <div className="flex items-center justify-between gap-4 text-sm">
            <h3 className="font-medium">{axis.label}</h3>
            <span className="font-mono text-xs text-muted-foreground">
              Rank {axis.rank ?? "-"} /{" "}
              {axis.fieldSize ?? "-"}
            </span>
          </div>
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${Math.max(models.length, 1)}, minmax(0, 1fr))`,
            }}
          >
            {models.map((model, index) => {
              const value = byModel[index]?.get(axis.key)?.percentile ?? null;
              return (
                <div className="min-w-0" key={model.id}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate">{model.name}</span>
                    <span className="font-mono">{value === null ? "-" : formatDisplayNumber(value)}</span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-muted"
                    aria-hidden="true"
                  >
                    {value === null ? null : (
                      <span
                        className="block h-full rounded-full"
                        style={{
                          backgroundColor: model.color,
                          width: `${Math.max(0, Math.min(value, 100))}%`,
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function RouteEvidenceRuntimeReadout({
  model,
}: {
  model: SurfaceModel;
}) {
  if (model.ttftP50Seconds === null && model.outputTokensPerSecond === null) {
    return (
      <div className="grid min-h-56 place-items-center text-center text-sm text-muted-foreground">
        No runtime observation was supplied for this model. A historical trend
        is not inferred from a missing observation.
      </div>
    );
  }
  return (
    <dl className="grid min-h-56 content-center gap-5 sm:grid-cols-2">
      <div className="rounded-xl border border-border bg-muted/25 p-5">
        <dt className="text-xs text-muted-foreground">TTFT p50</dt>
        <dd className="mt-2 font-mono text-2xl tabular-nums">
          {model.ttftP50Seconds === null
            ? "-"
            : `${formatDisplayNumber(model.ttftP50Seconds)}s`}
        </dd>
      </div>
      <div className="rounded-xl border border-border bg-muted/25 p-5">
        <dt className="text-xs text-muted-foreground">Output throughput</dt>
        <dd className="mt-2 font-mono text-2xl tabular-nums">
          {model.outputTokensPerSecond === null
            ? "-"
            : `${formatDisplayNumber(model.outputTokensPerSecond)} tok/s`}
        </dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-xs text-muted-foreground">
          Observation conditions
        </dt>
        <dd className="mt-2 text-sm leading-6">
          {model.runtimeConditions ?? "-"}
        </dd>
      </div>
    </dl>
  );
}

export function RouteEvidenceEconomicsBars({
  models,
}: {
  models: readonly SurfaceModel[];
}) {
  const priceValues = models.map((model) =>
    model.inputUsdPerMillion === null || model.outputUsdPerMillion === null
      ? null
      : model.inputUsdPerMillion * 0.75 + model.outputUsdPerMillion * 0.25,
  );
  const maxPrice = Math.max(
    0,
    ...priceValues.filter((value): value is number => value !== null),
  );
  const maxThroughput = Math.max(
    0,
    ...models.map((model) => model.outputTokensPerSecond ?? 0),
  );
  const maxContext = Math.max(
    0,
    ...models.map((model) => model.contextWindowTokens ?? 0),
  );
  const groups = [
    {
      title: "Blended token price",
      values: priceValues,
      max: maxPrice,
      format: formatPrice,
    },
    {
      title: "Observed throughput",
      values: models.map((model) => model.outputTokensPerSecond),
      max: maxThroughput,
      format: (value: number | null) =>
        value === null ? "-" : `${formatDisplayNumber(value)} tok/s`,
    },
    {
      title: "Context capacity",
      values: models.map((model) => model.contextWindowTokens),
      max: maxContext,
      format: formatTokens,
    },
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {groups.map((group) => (
        <section
          className="rounded-xl border border-border bg-card p-4"
          key={group.title}
        >
          <h3 className="font-medium">{group.title}</h3>
          <div className="mt-5 space-y-3">
            {models.map((model, index) => {
              const value = group.values[index] ?? null;
              return (
                <div key={model.id}>
                  <div className="mb-1 flex justify-between gap-3 text-xs">
                    <span className="truncate text-muted-foreground">
                      {model.name}
                    </span>
                    <span className="font-mono">{group.format(value)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    {value === null || group.max === 0 ? null : (
                      <span
                        className="block h-full rounded-full"
                        style={{
                          backgroundColor: model.color,
                          width: `${(value / group.max) * 100}%`,
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export {
  formatPrice as formatRouteSurfacePrice,
  formatTokens as formatRouteSurfaceTokens,
};
