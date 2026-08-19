"use client";

import { ArrowRight, Check, ChevronRight, CircleAlert, GitCompareArrows, Plus, RotateCcw, Search, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ResultActions, ViewModeToggle } from "@/components/result-actions";
import { ModelFrontierChart } from "@/components/tokenbench-chart";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { catalogModels, catalogProviders, formatContext, formatPrice, type AccessType, type CatalogModel } from "@/lib/model-catalog";
import { cn } from "@/lib/utils";

type SortMode = "score" | "price" | "context" | "newest";

function ModelDot({ model, className }: { model: CatalogModel; className?: string }) {
  return <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full ring-4 ring-current/10", className)} style={{ backgroundColor: model.color, color: model.color }} />;
}

function SelectionButton({ model, selected, onChange }: { model: CatalogModel; selected: boolean; onChange: () => void }) {
  return (
    <button
      aria-label={`${selected ? "Remove" : "Add"} ${model.name} ${selected ? "from" : "to"} comparison`}
      aria-pressed={selected}
      className={cn("grid size-7 shrink-0 place-items-center rounded-full border transition", selected ? "border-active-control bg-active-control text-active-control-foreground hover:text-active-control-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground")}
      onClick={onChange}
      type="button"
    >
      {selected ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
    </button>
  );
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  const id = `catalog-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <label className="space-y-1.5 text-xs text-muted-foreground" htmlFor={id}>
      {label}
      <select className="block h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" id={id} onChange={(event) => onChange(event.target.value)} value={value}>
        {children}
      </select>
    </label>
  );
}

function ModelPicker({ selected, onToggle, onClose }: { selected: string[]; onToggle: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const matches = catalogModels.filter((model) => `${model.name} ${model.provider}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div aria-label="Choose models to compare" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="dialog">
      <div className="max-h-[80vh] w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl">
        <div className="flex items-start justify-between border-b border-border p-5">
          <div>
            <h2 className="text-lg font-semibold">Choose 2–4 models</h2>
            <p className="mt-1 text-sm text-muted-foreground">Your selection is carried into the comparison workbench.</p>
          </div>
          <Button aria-label="Close model picker" onClick={onClose} size="icon" variant="ghost"><X /></Button>
        </div>
        <div className="border-b border-border p-4">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus className="h-10 pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Search models or providers" value={query} />
            <span className="sr-only">Search models or providers</span>
          </label>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {matches.map((model) => {
            const isSelected = selected.includes(model.id);
            const disabled = !isSelected && selected.length >= 4;
            return (
              <button className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40" disabled={disabled} key={model.id} onClick={() => onToggle(model.id)} type="button">
                <ModelDot model={model} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{model.name}</span>
                  <span className="block text-xs text-muted-foreground">{model.provider} · {model.category}</span>
                </span>
                <span className={cn("grid size-6 place-items-center rounded-full border", isSelected ? "border-active-control bg-active-control text-active-control-foreground" : "border-border")}>{isSelected ? <Check className="size-3" /> : <Plus className="size-3" />}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t border-border p-4 text-xs text-muted-foreground">
          <span>{selected.length}/4 selected</span>
          <Button onClick={onClose}>Review selection</Button>
        </div>
      </div>
    </div>
  );
}

export function ModelsWorkbenchPage() {
  const [frontierOnly, setFrontierOnly] = useState(false);
  const [logScale, setLogScale] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("All");
  const [access, setAccess] = useState<AccessType | "All">("All");
  const [sort, setSort] = useState<SortMode>("score");
  const [view, setView] = useState<"cards" | "list">("cards");

  const selectedModels = selected.map((id) => catalogModels.find((model) => model.id === id)).filter((model): model is CatalogModel => Boolean(model));
  const frontierModels = frontierOnly ? catalogModels.filter((model) => model.frontier) : catalogModels;
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return catalogModels
      .filter((model) => !normalizedQuery || `${model.name} ${model.provider} ${model.summary} ${model.category}`.toLowerCase().includes(normalizedQuery))
      .filter((model) => provider === "All" || model.provider === provider)
      .filter((model) => access === "All" || model.access.includes(access))
      .toSorted((a, b) => {
        if (sort === "price") return (a.inputPrice ?? Number.POSITIVE_INFINITY) - (b.inputPrice ?? Number.POSITIVE_INFINITY);
        if (sort === "context") return b.context - a.context;
        if (sort === "newest") return b.released.localeCompare(a.released);
        return (b.score ?? Number.NEGATIVE_INFINITY) - (a.score ?? Number.NEGATIVE_INFINITY);
      });
  }, [access, provider, query, sort]);

  const toggleSelection = (id: string) => {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length < 4 ? [...current, id] : current);
  };
  const resetFilters = () => {
    setQuery("");
    setProvider("All");
    setAccess("All");
    setSort("score");
  };
  const compareHref = `/compare/?models=${selected.join(",")}`;

  return (
    <main>
      <section className="border-b border-border px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <Badge className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em]" variant="secondary">Model workbench</Badge>
          <div className="grid gap-10 lg:grid-cols-[1fr_380px] lg:items-end">
            <div>
              <h1 className="max-w-4xl text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">Find the right model from evidence, economics, and fit.</h1>
              <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">Explore the complete decision surface: inspect the current frontier, build a short list, then move into an exact comparison without losing unavailable-data states.</p>
            </div>
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border">
              {[["Visible", "30"], ["Frontier", "7"], ["Selection", `${selected.length}/4`]].map(([label, value]) => <div className="bg-card p-4" key={label}><p className="font-mono text-2xl tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>)}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="font-mono text-xs text-muted-foreground">01 / FRONTIER CANVAS</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Capability relative to input price</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Explore the evidence surface. Models without a published score or price remain unavailable and are not plotted as zero.</p></div>
            <div className="flex flex-wrap gap-2">
              <Button aria-pressed={frontierOnly} onClick={() => setFrontierOnly((value) => !value)} size="sm" variant={frontierOnly ? "default" : "outline"}><Sparkles />Frontier only</Button>
              <Button aria-pressed={logScale} onClick={() => setLogScale((value) => !value)} size="sm" variant={logScale ? "default" : "outline"}>Log price scale</Button>
            </div>
          </div>
          <Card><CardContent className="pt-2"><ModelFrontierChart logScale={logScale} models={frontierModels} /></CardContent></Card>
        </div>
      </section>

      <section className="border-y border-border bg-muted/25 px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[.7fr_1.3fr]">
            <div><p className="font-mono text-xs text-muted-foreground">02 / QUICK COMPARISON</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Build a decision set</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Choose two to four distinct models. TokenBench carries their ordered slugs into the comparison workbench.</p><Button className="mt-6" onClick={() => setPickerOpen(true)}><Plus />Choose models</Button></div>
            <Card>
              <CardHeader><CardTitle>{selected.length ? `${selected.length} model${selected.length === 1 ? "" : "s"} selected` : "No models selected"}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {selectedModels.length ? selectedModels.map((model) => <div className="flex items-center gap-3 rounded-xl border border-border bg-background/60 p-3" key={model.id}><ModelDot model={model} /><div className="min-w-0 flex-1"><p className="font-medium">{model.name}</p><p className="text-xs text-muted-foreground">{model.provider} · {formatContext(model.context)} context</p></div><SelectionButton model={model} onChange={() => toggleSelection(model.id)} selected /></div>) : <div className="grid min-h-32 place-items-center rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground">Your comparison tray is empty.<br />Start from the catalog or model picker.</div>}
              </CardContent>
              <CardFooter className="justify-between gap-3"><span className="text-xs text-muted-foreground">Minimum 2 · maximum 4</span>{selected.length >= 2 ? <Link className={buttonVariants()} href={compareHref}>Compare models<ArrowRight /></Link> : <Button disabled>Compare models<ArrowRight /></Button>}</CardFooter>
            </Card>
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-7"><p className="font-mono text-xs text-muted-foreground">03 / MODEL CATALOG</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Thirty models, one comparable surface</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Search by task or provider, narrow access type, and change the decision lens. Reset returns to the audited catalog default.</p></div>
          <div className="mb-5 grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto] lg:items-end">
            <label className="space-y-1.5 text-xs text-muted-foreground" htmlFor="catalog-search">Search models<Input className="mt-1.5 h-9" id="catalog-search" onChange={(event) => setQuery(event.target.value)} placeholder="Model, provider, or task" value={query} /></label>
            <SelectField label="Provider" onChange={setProvider} value={provider}>{catalogProviders.map((value) => <option key={value}>{value}</option>)}</SelectField>
            <SelectField label="Access" onChange={(value) => setAccess(value as AccessType | "All")} value={access}>{["All", "API", "Open weights", "Subscription"].map((value) => <option key={value}>{value}</option>)}</SelectField>
            <SelectField label="Sort" onChange={(value) => setSort(value as SortMode)} value={sort}><option value="score">Evidence score</option><option value="price">Input price</option><option value="context">Context window</option><option value="newest">Newest release</option></SelectField>
            <Button onClick={resetFilters} size="sm" variant="outline"><RotateCcw />Reset</Button>
          </div>
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p aria-live="polite" className="text-sm text-muted-foreground"><span className="font-mono text-foreground">{filtered.length}</span> of 30 models visible</p>
            <div className="flex flex-wrap gap-2"><ResultActions filename="tokenbench-model-catalog" rows={filtered.map((model) => ({ model: model.name, provider: model.provider, category: model.category, context: model.context, inputPrice: model.inputPrice, outputPrice: model.outputPrice, score: model.score, speed: model.speed }))} targetId="model-catalog-results" /><ViewModeToggle mode={view} onChange={setView} /></div>
          </div>

          <div id="model-catalog-results">
            {filtered.length === 0 ? <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border text-center"><div><CircleAlert className="mx-auto size-6 text-muted-foreground" /><h3 className="mt-3 font-medium">No models match these filters</h3><p className="mt-1 text-sm text-muted-foreground">Try a broader query or reset the catalog.</p><Button className="mt-4" onClick={resetFilters} size="sm" variant="outline">Reset filters</Button></div></div> : null}
            {filtered.length > 0 && view === "cards" ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filtered.map((model) => {
              const isSelected = selected.includes(model.id);
              return <Card className="transition duration-200 hover:-translate-y-0.5 hover:ring-foreground/20" key={model.id}><CardHeader><div className="flex items-center gap-2 text-xs text-muted-foreground"><ModelDot model={model} />{model.provider}<span className="ml-auto">{model.released}</span></div><div className="flex items-start justify-between gap-3 pt-2"><div><CardTitle className="text-lg">{model.name}</CardTitle><Badge className="mt-2" variant="outline">{model.category}</Badge></div><SelectionButton model={model} onChange={() => toggleSelection(model.id)} selected={isSelected} /></div></CardHeader><CardContent><p className="min-h-12 text-sm leading-5 text-muted-foreground">{model.summary}</p><div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-border"><div className="bg-muted/50 p-2.5"><p className="font-mono text-sm">{model.score ?? "—"}</p><p className="text-[10px] text-muted-foreground">Score</p></div><div className="bg-muted/50 p-2.5"><p className="font-mono text-sm">{formatContext(model.context)}</p><p className="text-[10px] text-muted-foreground">Context</p></div><div className="bg-muted/50 p-2.5"><p className="font-mono text-sm">{formatPrice(model.inputPrice)}</p><p className="text-[10px] text-muted-foreground">Input / 1M</p></div></div></CardContent><CardFooter className="justify-between"><span className="text-xs text-muted-foreground">{model.access.join(" · ")}</span><Link className={buttonVariants({ size: "sm", variant: "ghost" })} href={`/model-profile?model=${model.id}`}>Profile<ChevronRight /></Link></CardFooter></Card>;
            })}</div> : null}
            {filtered.length > 0 && view === "list" ? <div className="overflow-x-auto rounded-2xl border border-border"><table className="w-full min-w-[900px] border-collapse text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-left">Model</th><th className="px-4 py-3 text-left">Category</th><th className="px-4 py-3 text-left">Access</th><th className="px-4 py-3 text-right">Context</th><th className="px-4 py-3 text-right">Input / 1M</th><th className="px-4 py-3 text-right">Evidence</th><th className="px-4 py-3 text-right">Compare</th></tr></thead><tbody>{filtered.map((model) => <tr className="border-t border-border hover:bg-muted/30" key={model.id}><td className="px-4 py-3"><Link className="flex items-center gap-3 font-medium hover:underline" href={`/model-profile?model=${model.id}`}><ModelDot model={model} /><span>{model.name}<span className="block text-xs font-normal text-muted-foreground">{model.provider}</span></span></Link></td><td className="px-4 py-3">{model.category}</td><td className="px-4 py-3 text-muted-foreground">{model.access.join(", ")}</td><td className="px-4 py-3 text-right font-mono">{formatContext(model.context)}</td><td className="px-4 py-3 text-right font-mono">{formatPrice(model.inputPrice)}</td><td className="px-4 py-3 text-right font-mono">{model.score ?? "Unavailable"}</td><td className="px-4 py-3 text-right"><SelectionButton model={model} onChange={() => toggleSelection(model.id)} selected={selected.includes(model.id)} /></td></tr>)}</tbody></table></div> : null}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-muted/25 px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-2">
          <div><p className="font-mono text-xs text-muted-foreground">04 / LIFECYCLE</p><h2 className="mt-2 text-2xl font-semibold">Model decisions do not end at launch.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Track retirement risk and successor guidance before a deprecated endpoint turns into an emergency migration.</p><Link className={cn(buttonVariants({ variant: "outline" }), "mt-6")} href="/model-lifecycle/">Open lifecycle monitor<ArrowRight /></Link></div>
          <div className="space-y-3">{[["GPT-4 Turbo", "GPT-4o", "Migration path"], ["Claude 3 Opus", "Claude 3.5 Sonnet", "Successor available"]].map(([from, to, state]) => <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4" key={from}><span className="size-2 rounded-full bg-amber-500" /><div className="min-w-0 flex-1"><p className="font-medium">{from} <span className="text-muted-foreground">→</span> {to}</p><p className="mt-1 text-xs text-muted-foreground">{state}</p></div><ChevronRight className="size-4 text-muted-foreground" /></div>)}</div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-7xl"><p className="font-mono text-xs text-muted-foreground">05 / RELEASE TIMELINE</p><h2 className="mt-2 text-2xl font-semibold">Recent model releases</h2><div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{catalogModels.toSorted((a, b) => b.released.localeCompare(a.released)).slice(0, 8).map((model) => <Link className="group rounded-xl border border-border bg-card p-4 transition hover:border-foreground/25" href={`/model-profile?model=${model.id}`} key={model.id}><div className="flex items-center gap-2 text-xs text-muted-foreground"><ModelDot model={model} />{model.released}</div><p className="mt-4 font-medium group-hover:underline">{model.name}</p><p className="mt-1 text-xs text-muted-foreground">{model.provider} · {model.category}</p></Link>)}</div></div>
      </section>

      {selected.length ? <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-[calc(100%-2rem)] max-w-3xl items-center gap-3 rounded-2xl border border-border bg-popover/95 p-3 shadow-2xl backdrop-blur-xl"><GitCompareArrows className="ml-1 size-4 shrink-0" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{selectedModels.map((model) => model.name).join(" · ")}</p><p className="text-xs text-muted-foreground">{selected.length}/4 selected</p></div><Button aria-label="Clear comparison selection" onClick={() => setSelected([])} size="icon" variant="ghost"><X /></Button>{selected.length >= 2 ? <Link className={buttonVariants({ size: "sm" })} href={compareHref}>Compare<ArrowRight /></Link> : <Button onClick={() => setPickerOpen(true)} size="sm" variant="outline">Add another</Button>}</div> : null}
      {pickerOpen ? <ModelPicker onClose={() => setPickerOpen(false)} onToggle={toggleSelection} selected={selected} /> : null}
    </main>
  );
}
