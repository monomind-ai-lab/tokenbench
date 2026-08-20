"use client";

import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  GitCompareArrows,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ResultActions, ViewModeToggle } from "@/components/result-actions";
import { RouteEvidenceFrontierPlot } from "@/components/route-evidence-visuals";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  surfaceParetoModelIds,
  type ModelSurfaceMode,
  type SurfaceModel,
} from "@tokenbench/frontend/model-surface-projectors";
import { cn } from "@/lib/utils";

type SortMode = "score" | "price" | "context" | "release";

function formatPrice(value: number | null): string {
  return value === null
    ? "Unavailable"
    : `$${value < 1 ? value.toFixed(3) : value.toFixed(2)}`;
}

function formatTokens(value: number | null): string {
  if (value === null) return "Unavailable";
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))}K`;
  return String(value);
}

function ModelDot({
  model,
  className,
}: {
  model: SurfaceModel;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2.5 shrink-0 rounded-full ring-4 ring-current/10",
        className,
      )}
      style={{ backgroundColor: model.color, color: model.color }}
    />
  );
}

function SelectionButton({
  model,
  selected,
  onChange,
}: {
  model: SurfaceModel;
  selected: boolean;
  onChange: () => void;
}) {
  return (
    <button
      aria-label={`${selected ? "Remove" : "Add"} ${model.name} ${selected ? "from" : "to"} comparison`}
      aria-pressed={selected}
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full border transition sm:size-7",
        selected
          ? "border-active-control bg-active-control text-active-control-foreground hover:text-active-control-foreground"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
      onClick={onChange}
      type="button"
    >
      {selected ? (
        <Check className="size-3.5" />
      ) : (
        <Plus className="size-3.5" />
      )}
    </button>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  const id = `catalog-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <label className="space-y-1.5 text-xs text-muted-foreground" htmlFor={id}>
      {label}
      <select
        className="block h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    </label>
  );
}

function ModelPicker({
  models,
  selected,
  onToggle,
  onClose,
}: {
  models: readonly SurfaceModel[];
  selected: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const matches = models.filter((model) =>
    `${model.name} ${model.provider ?? ""} ${model.id}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div
      aria-label="Choose models to compare"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4 backdrop-blur-sm"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      role="dialog"
    >
      <div className="max-h-[80vh] w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl">
        <div className="flex items-start justify-between border-b border-border p-5">
          <div>
            <h2 className="text-lg font-semibold">Choose 2–4 models</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Only models in the current response can be added here.
            </p>
          </div>
          <Button
            aria-label="Close model picker"
            onClick={onClose}
            size="icon"
            variant="ghost"
          >
            <X />
          </Button>
        </div>
        <div className="border-b border-border p-4">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              className="h-11 pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search supplied model records"
              value={query}
            />
            <span className="sr-only">Search supplied model records</span>
          </label>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {matches.map((model) => {
            const isSelected = selected.includes(model.id);
            const disabled = !isSelected && selected.length >= 4;
            return (
              <button
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                disabled={disabled}
                key={model.id}
                onClick={() => onToggle(model.id)}
                type="button"
              >
                <ModelDot model={model} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{model.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {model.provider ?? "Provider unavailable"} ·{" "}
                    {model.access ?? "Access unavailable"}
                  </span>
                </span>
                <span
                  className={cn(
                    "grid size-7 place-items-center rounded-full border",
                    isSelected
                      ? "border-active-control bg-active-control text-active-control-foreground"
                      : "border-border",
                  )}
                >
                  {isSelected ? (
                    <Check className="size-3" />
                  ) : (
                    <Plus className="size-3" />
                  )}
                </span>
              </button>
            );
          })}
          {matches.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No supplied model record matches this search.
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-between border-t border-border p-4 text-xs text-muted-foreground">
          <span>{selected.length}/4 selected</span>
          <Button onClick={onClose}>Review selection</Button>
        </div>
      </div>
    </div>
  );
}

function DataModeNotice({
  mode,
  status,
}: {
  mode: ModelSurfaceMode;
  status: "available" | "partial" | "unavailable";
}) {
  const preview = mode === "preview";
  if (!preview && status === "available") return null;
  return (
    <p className="mt-6 flex items-start gap-2 rounded-xl border border-border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      {preview
        ? "Preview-only retained evidence is shown for interface review. It is not a production recommendation."
        : "Coverage is partial or unavailable. Missing fields stay unavailable and are not reconstructed from another model."}
    </p>
  );
}

export function ModelsWorkbenchPage({
  models,
  mode,
  status,
}: {
  models: readonly SurfaceModel[];
  mode: ModelSurfaceMode;
  status: "available" | "partial" | "unavailable";
}) {
  const [frontierOnly, setFrontierOnly] = useState(false);
  const [logScale, setLogScale] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("All");
  const [access, setAccess] = useState<"All" | "Proprietary" | "Open weights">(
    "All",
  );
  const [sort, setSort] = useState<SortMode>("score");
  const [view, setView] = useState<"cards" | "list">("cards");
  const providers = useMemo(
    () => [
      "All",
      ...new Set(
        models.flatMap((model) =>
          model.provider === null ? [] : [model.provider],
        ),
      ),
    ],
    [models],
  );
  const selectedModels = selected.flatMap((id) =>
    models.filter((model) => model.id === id),
  );
  const frontierIds = useMemo(() => surfaceParetoModelIds(models), [models]);
  const frontierModels = frontierOnly
    ? models.filter((model) => frontierIds.has(model.id))
    : models;
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return models
      .filter(
        (model) =>
          !normalizedQuery ||
          `${model.name} ${model.provider ?? ""} ${model.id} ${model.access ?? ""}`
            .toLowerCase()
            .includes(normalizedQuery),
      )
      .filter((model) => provider === "All" || model.provider === provider)
      .filter((model) => access === "All" || model.access === access)
      .toSorted((left, right) => {
        if (sort === "price")
          return (
            (left.inputUsdPerMillion ?? Number.POSITIVE_INFINITY) -
            (right.inputUsdPerMillion ?? Number.POSITIVE_INFINITY)
          );
        if (sort === "context")
          return (
            (right.contextWindowTokens ?? Number.NEGATIVE_INFINITY) -
            (left.contextWindowTokens ?? Number.NEGATIVE_INFINITY)
          );
        if (sort === "release")
          return (right.benchmarkReleaseOn ?? "").localeCompare(
            left.benchmarkReleaseOn ?? "",
          );
        return (
          (right.capabilityScore ?? Number.NEGATIVE_INFINITY) -
          (left.capabilityScore ?? Number.NEGATIVE_INFINITY)
        );
      });
  }, [access, models, provider, query, sort]);
  const lifecycleAlerts = models.filter(
    (model) =>
      model.lifecycleStatus === "Retirement scheduled" ||
      model.lifecycleStatus === "Retired",
  );
  const recentEvidence = models
    .filter((model) => model.benchmarkReleaseOn !== null)
    .toSorted((left, right) =>
      (right.benchmarkReleaseOn ?? "").localeCompare(
        left.benchmarkReleaseOn ?? "",
      ),
    )
    .slice(0, 8);
  const toggleSelection = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : current.length < 4
          ? [...current, id]
          : current,
    );
  const resetFilters = () => {
    setQuery("");
    setProvider("All");
    setAccess("All");
    setSort("score");
  };
  const compareHref = `/compare?models=${selected.join(",")}`;

  return (
    <main>
      <section className="border-b border-border px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <Badge
            className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em]"
            variant="secondary"
          >
            Model workbench
          </Badge>
          <div className="grid gap-10 lg:grid-cols-[1fr_380px] lg:items-end">
            <div>
              <h1 className="max-w-4xl text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
                Find the right model from evidence, economics, and fit.
              </h1>
              <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
                Inspect the current response, build a short list, and move into
                an ordered comparison without turning an unavailable observation
                into a score, price, or model substitute.
              </p>
              <DataModeNotice mode={mode} status={status} />
            </div>
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border">
              {[
                ["Visible", String(models.length)],
                ["Frontier", String(frontierIds.size)],
                ["Selection", `${selected.length}/4`],
              ].map(([label, metric]) => (
                <div className="bg-card p-4" key={label}>
                  <p className="font-mono text-2xl tabular-nums">{metric}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-xs text-muted-foreground">
                01 / FRONTIER CANVAS
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Capability relative to input price
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Explore the evidence surface. Models without a published score
                or price remain unavailable and are not plotted as zero.
                Frontier membership is derived only from supplied capability and
                price pairs.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                aria-pressed={frontierOnly}
                onClick={() => setFrontierOnly((value) => !value)}
                size="sm"
                variant={frontierOnly ? "default" : "outline"}
              >
                <Sparkles />
                Frontier only
              </Button>
              <Button
                aria-pressed={logScale}
                onClick={() => setLogScale((value) => !value)}
                size="sm"
                variant={logScale ? "default" : "outline"}
              >
                Log price scale
              </Button>
            </div>
          </div>
          <RouteEvidenceFrontierPlot
            frontierIds={frontierIds}
            logScale={logScale}
            models={frontierModels}
          />
        </div>
      </section>

      <section className="border-y border-border bg-muted/25 px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[.7fr_1.3fr]">
            <div>
              <p className="font-mono text-xs text-muted-foreground">
                02 / QUICK COMPARISON
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Build a decision set
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Choose two to four distinct records from this response. The
                comparison route keeps their order in the models query.
              </p>
              <Button
                className="mt-6"
                disabled={models.length === 0}
                onClick={() => setPickerOpen(true)}
              >
                <Plus />
                Choose models
              </Button>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>
                  {selected.length
                    ? `${selected.length} model${selected.length === 1 ? "" : "s"} selected`
                    : "No models selected"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {selectedModels.length ? (
                  selectedModels.map((model) => (
                    <div
                      className="flex items-center gap-3 rounded-xl border border-border bg-background/60 p-3"
                      key={model.id}
                    >
                      <ModelDot model={model} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{model.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {model.provider ?? "Provider unavailable"} ·{" "}
                          {formatTokens(model.contextWindowTokens)} context
                        </p>
                      </div>
                      <SelectionButton
                        model={model}
                        onChange={() => toggleSelection(model.id)}
                        selected
                      />
                    </div>
                  ))
                ) : (
                  <div className="grid min-h-32 place-items-center rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground">
                    Your comparison tray is empty.
                    <br />
                    Start from the supplied model records.
                  </div>
                )}
              </CardContent>
              <CardFooter className="justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                  Minimum 2 · maximum 4
                </span>
                {selected.length >= 2 ? (
                  <Link className={buttonVariants()} href={compareHref}>
                    Compare models
                    <ArrowRight />
                  </Link>
                ) : (
                  <Button disabled>
                    Compare models
                    <ArrowRight />
                  </Button>
                )}
              </CardFooter>
            </Card>
          </div>
        </div>
      </section>

      <section className="scroll-mt-20 px-4 py-14 sm:px-6 sm:py-20" id="model-catalog">
        <div className="mx-auto max-w-7xl">
          <div className="mb-7">
            <p className="font-mono text-xs text-muted-foreground">
              03 / MODEL CATALOG
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Current response records
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Search provider, name, slug, or access. Filters are applied only
              to the response already accepted by the data adapter.
            </p>
          </div>
          <div className="mb-5 grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto] lg:items-end">
            <label
              className="space-y-1.5 text-xs text-muted-foreground"
              htmlFor="catalog-search"
            >
              Search supplied records
              <Input
                className="mt-1.5 h-10"
                id="catalog-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Model, provider, or slug"
                value={query}
              />
            </label>
            <SelectField
              label="Provider"
              onChange={setProvider}
              value={provider}
            >
              {providers.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </SelectField>
            <SelectField
              label="Access"
              onChange={(value) => setAccess(value as typeof access)}
              value={access}
            >
              {["All", "Proprietary", "Open weights"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </SelectField>
            <SelectField
              label="Sort"
              onChange={(value) => setSort(value as SortMode)}
              value={sort}
            >
              <option value="score">Capability value</option>
              <option value="price">Input price</option>
              <option value="context">Context window</option>
              <option value="release">Benchmark release</option>
            </SelectField>
            <Button onClick={resetFilters} size="sm" variant="outline">
              <RotateCcw />
              Reset
            </Button>
          </div>
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p aria-live="polite" className="text-sm text-muted-foreground">
              <span className="font-mono text-foreground">
                {filtered.length}
              </span>{" "}
              of {models.length} supplied records visible
            </p>
            <div className="flex flex-wrap gap-2">
              <ResultActions
                filename="tokenbench-model-records"
                rows={filtered.map((model) => ({
                  model: model.name,
                  provider: model.provider,
                  access: model.access,
                  benchmarkRelease: model.benchmarkReleaseOn,
                  context: model.contextWindowTokens,
                  inputPrice: model.inputUsdPerMillion,
                  outputPrice: model.outputUsdPerMillion,
                  capability: model.capabilityScore,
                  throughput: model.outputTokensPerSecond,
                }))}
                targetId="model-catalog-results"
              />
              <ViewModeToggle mode={view} onChange={setView} />
            </div>
          </div>
          <div id="model-catalog-results">
            {filtered.length === 0 ? (
              <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border text-center">
                <div>
                  <CircleAlert className="mx-auto size-6 text-muted-foreground" />
                  <h3 className="mt-3 font-medium">
                    No supplied records match these filters
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Broaden the filter or reset it; no catalog record is
                    substituted.
                  </p>
                  <Button
                    className="mt-4"
                    onClick={resetFilters}
                    size="sm"
                    variant="outline"
                  >
                    Reset filters
                  </Button>
                </div>
              </div>
            ) : null}
            {filtered.length > 0 && view === "cards" ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map((model) => (
                  <Card
                    className="transition duration-200 hover:-translate-y-0.5 hover:ring-foreground/20"
                    key={model.id}
                  >
                    <CardHeader>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ModelDot model={model} />
                        {model.provider ?? "Provider unavailable"}
                        <span className="ml-auto">
                          {model.benchmarkReleaseOn ??
                            "Benchmark release unavailable"}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3 pt-2">
                        <div>
                          <CardTitle className="text-lg">
                            {model.name}
                          </CardTitle>
                          <Badge className="mt-2" variant="outline">
                            {model.access ?? "Access unavailable"}
                          </Badge>
                        </div>
                        <SelectionButton
                          model={model}
                          onChange={() => toggleSelection(model.id)}
                          selected={selected.includes(model.id)}
                        />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="min-h-12 text-sm leading-5 text-muted-foreground">
                        No model synopsis was supplied with this evidence
                        record.
                      </p>
                      <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-border">
                        <div className="bg-muted/50 p-2.5">
                          <p className="font-mono text-sm">
                            {model.capabilityScore ?? "Unavailable"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Capability
                          </p>
                        </div>
                        <div className="bg-muted/50 p-2.5">
                          <p className="font-mono text-sm">
                            {formatTokens(model.contextWindowTokens)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Context
                          </p>
                        </div>
                        <div className="bg-muted/50 p-2.5">
                          <p className="font-mono text-sm">
                            {formatPrice(model.inputUsdPerMillion)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Input / 1M
                          </p>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="justify-between">
                      <span className="text-xs text-muted-foreground">
                        {model.route ?? "Route unavailable"}
                      </span>
                      <Link
                        className={buttonVariants({
                          size: "sm",
                          variant: "ghost",
                        })}
                        href={`/model-profile?model=${encodeURIComponent(model.id)}`}
                      >
                        Profile
                        <ChevronRight />
                      </Link>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : null}
            {filtered.length > 0 && view === "list" ? (
              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead className="bg-muted/60 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left">Model</th>
                      <th className="px-4 py-3 text-left">Access</th>
                      <th className="px-4 py-3 text-right">Context</th>
                      <th className="px-4 py-3 text-right">Input / 1M</th>
                      <th className="px-4 py-3 text-right">Capability</th>
                      <th className="px-4 py-3 text-right">Compare</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((model) => (
                      <tr
                        className="border-t border-border hover:bg-muted/30"
                        key={model.id}
                      >
                        <td className="px-4 py-3">
                          <Link
                            className="flex items-center gap-3 font-medium hover:underline"
                            href={`/model-profile?model=${encodeURIComponent(model.id)}`}
                          >
                            <ModelDot model={model} />
                            <span>
                              {model.name}
                              <span className="block text-xs font-normal text-muted-foreground">
                                {model.provider ?? "Provider unavailable"}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {model.access ?? "Unavailable"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {formatTokens(model.contextWindowTokens)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {formatPrice(model.inputUsdPerMillion)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {model.capabilityScore ?? "Unavailable"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <SelectionButton
                            model={model}
                            onChange={() => toggleSelection(model.id)}
                            selected={selected.includes(model.id)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-muted/25 px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-2">
          <div>
            <p className="font-mono text-xs text-muted-foreground">
              04 / LIFECYCLE
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              Model decisions do not end at launch.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              Track announced retirement risk and successor guidance before a
              deprecated endpoint turns into an emergency migration.
            </p>
            <Link
              className={cn(buttonVariants({ variant: "outline" }), "mt-6")}
              href="/model-lifecycle/"
            >
              Open lifecycle monitor
              <ArrowRight />
            </Link>
          </div>
          <div className="space-y-3">
            {lifecycleAlerts.length ? (
              lifecycleAlerts.map((model) => (
                <div
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
                  key={model.id}
                >
                  <span className="size-2 rounded-full bg-amber-500" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{model.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {model.lifecycleStatus} ·{" "}
                      {model.sunsetOn ?? "Sunset unavailable"}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                No lifecycle alert was supplied with this directory response.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <p className="font-mono text-xs text-muted-foreground">
            05 / RELEASE TIMELINE
          </p>
          <h2 className="mt-2 text-2xl font-semibold">
            Evidence observation timeline
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Dates below are benchmark-release facts, not inferred model launch
            dates.
          </p>
          {recentEvidence.length ? (
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {recentEvidence.map((model) => (
                <Link
                  className="group rounded-xl border border-border bg-card p-4 transition hover:border-foreground/25"
                  href={`/model-profile?model=${encodeURIComponent(model.id)}`}
                  key={model.id}
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ModelDot model={model} />
                    {model.benchmarkReleaseOn}
                  </div>
                  <p className="mt-4 font-medium group-hover:underline">
                    {model.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {model.provider ?? "Provider unavailable"} ·{" "}
                    {model.access ?? "Access unavailable"}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-8 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              No benchmark-release observation was supplied.
            </div>
          )}
        </div>
      </section>

      {selected.length ? (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-[calc(100%-2rem)] max-w-3xl items-center gap-3 rounded-2xl border border-border bg-popover/95 p-3 shadow-2xl backdrop-blur-xl">
          <GitCompareArrows className="ml-1 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {selectedModels.map((model) => model.name).join(" · ")}
            </p>
            <p className="text-xs text-muted-foreground">
              {selected.length}/4 selected
            </p>
          </div>
          <Button
            aria-label="Clear comparison selection"
            onClick={() => setSelected([])}
            size="icon"
            variant="ghost"
          >
            <X />
          </Button>
          {selected.length >= 2 ? (
            <Link className={buttonVariants({ size: "sm" })} href={compareHref}>
              Compare
              <ArrowRight />
            </Link>
          ) : (
            <Button
              onClick={() => setPickerOpen(true)}
              size="sm"
              variant="outline"
            >
              Add another
            </Button>
          )}
        </div>
      ) : null}
      {pickerOpen ? (
        <ModelPicker
          models={models}
          onClose={() => setPickerOpen(false)}
          onToggle={toggleSelection}
          selected={selected}
        />
      ) : null}
    </main>
  );
}
