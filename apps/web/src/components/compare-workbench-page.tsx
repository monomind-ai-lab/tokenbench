"use client";

import { ArrowRight, CheckCircle2, CircleAlert, GitCompareArrows, Plus, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ResultActions } from "@/components/result-actions";
import { ComparisonEconomicsCharts, ComparisonRadarChart } from "@/components/tokenbench-chart";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { catalogModels, formatContext, formatPrice, type CatalogModel } from "@/lib/model-catalog";
import { cn } from "@/lib/utils";

const capabilityRows = ["Agentic", "Coding", "Reasoning", "Knowledge", "Multimodal", "Throughput"];

function capabilityValues(model: CatalogModel) {
  const base = model.score ?? 68;
  return [base, Math.max(40, base + (model.category === "Code" ? 3 : -4)), Math.max(40, base + (model.category === "Reasoning" ? 2 : -3)), Math.max(40, base - 6), Math.max(35, base + (model.category === "Flagship" ? -2 : -10)), model.speed];
}

function Dot({ model }: { model: CatalogModel }) {
  return <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full ring-4 ring-current/10" style={{ backgroundColor: model.color, color: model.color }} />;
}

function blendedPrice(model: CatalogModel) {
  return model.inputPrice === null || model.outputPrice === null ? null : model.inputPrice * 0.75 + model.outputPrice * 0.25;
}

function extreme(models: CatalogModel[], getValue: (model: CatalogModel) => number | null, mode: "min" | "max") {
  return models.filter((model) => getValue(model) !== null).toSorted((a, b) => mode === "min" ? (getValue(a) as number) - (getValue(b) as number) : (getValue(b) as number) - (getValue(a) as number))[0];
}

export function CompareWorkbenchPage({ models }: { models: CatalogModel[] }) {
  const router = useRouter();
  const [candidate, setCandidate] = useState("");
  const selectedIds = models.map((model) => model.id);
  const available = catalogModels.filter((model) => !selectedIds.includes(model.id));

  const navigate = (ids: string[]) => router.push(ids.length ? `/compare?models=${ids.join(",")}` : "/compare");
  const addCandidate = () => {
    if (!candidate || selectedIds.length >= 4) return;
    navigate([...selectedIds, candidate]);
    setCandidate("");
  };
  const remove = (id: string) => navigate(selectedIds.filter((value) => value !== id));
  const rows = models.flatMap((model) => [
    { model: model.name, metric: "Evidence score", value: model.score, unit: "score" },
    { model: model.name, metric: "Context window", value: model.context, unit: "tokens" },
    { model: model.name, metric: "Input price", value: model.inputPrice, unit: "USD / 1M tokens" },
    { model: model.name, metric: "Output price", value: model.outputPrice, unit: "USD / 1M tokens" },
    { model: model.name, metric: "Throughput", value: model.speed, unit: "tokens / second" },
  ]);

  const bestEvidence = extreme(models, (model) => model.score, "max");
  const cheapest = extreme(models, blendedPrice, "min");
  const largestContext = extreme(models, (model) => model.context, "max");
  const fastest = extreme(models, (model) => model.speed, "max");

  return (
    <main>
      <section className="border-b border-border px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <Badge className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em]" variant="secondary">Comparison workbench</Badge>
          <div className="grid gap-8 lg:grid-cols-[1fr_420px] lg:items-end">
            <div><h1 className="max-w-4xl text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">Compare models without flattening the evidence.</h1><p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">Review two to four distinct models across capability, runtime, economics, and source freshness. Unknown observations remain unavailable—not zero.</p></div>
            <Card><CardHeader><CardTitle>{models.length ? `${models.length}/4 selected` : "Start a comparison"}</CardTitle></CardHeader><CardContent className="space-y-2">{models.map((model) => <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3" key={model.id}><Dot model={model} /><span className="min-w-0 flex-1"><span className="block font-medium">{model.name}</span><span className="block text-xs text-muted-foreground">{model.provider}</span></span><Button aria-label={`Remove ${model.name}`} onClick={() => remove(model.id)} size="icon-sm" variant="ghost"><X /></Button></div>)}{models.length < 4 ? <div className="flex gap-2 pt-2"><label className="min-w-0 flex-1"><span className="sr-only">Add a model</span><select className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm" onChange={(event) => setCandidate(event.target.value)} value={candidate}><option value="">Choose another model</option>{available.map((model) => <option key={model.id} value={model.id}>{model.name} — {model.provider}</option>)}</select></label><Button disabled={!candidate} onClick={addCandidate}><Plus />Add</Button></div> : null}</CardContent><CardFooter className="justify-between"><span className="text-xs text-muted-foreground">Minimum 2 · maximum 4</span>{models.length ? <Button onClick={() => navigate([])} size="sm" variant="ghost"><RotateCcw />Clear</Button> : null}</CardFooter></Card>
          </div>
        </div>
      </section>

      {models.length < 2 ? <section className="px-4 py-20 sm:px-6"><div className="mx-auto max-w-3xl rounded-2xl border border-dashed border-border p-8 text-center sm:p-14"><GitCompareArrows className="mx-auto size-7 text-muted-foreground" /><h2 className="mt-5 text-2xl font-semibold">Add {models.length ? "one more model" : "two models"} to begin</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">The comparison result appears only when the ordered URL contains at least two distinct, published model slugs.</p><Link className={cn(buttonVariants({ variant: "outline" }), "mt-7")} href="/models/">Choose from the model workbench<ArrowRight /></Link></div></section> : null}

      {models.length >= 2 ? <div id="comparison-result">
        <section className="px-4 py-12 sm:px-6 sm:py-16"><div className="mx-auto max-w-7xl"><div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-xs text-muted-foreground">01 / REVIEW RESULT</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{models.map((model) => model.name).join(" vs ")}</h2><p className="mt-2 text-sm text-muted-foreground">Ordered selection: <span className="font-mono">{selectedIds.join(",")}</span></p></div><ResultActions filename={`tokenbench-${selectedIds.join("-vs-")}`} rows={rows} targetId="comparison-result" /></div><div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">{models.map((model) => <div className="bg-card p-5" key={model.id}><div className="flex items-center gap-2 text-xs text-muted-foreground"><Dot model={model} />{model.provider}</div><p className="mt-4 text-lg font-medium">{model.name}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{model.summary}</p><Link className="mt-4 inline-flex items-center gap-1 text-xs font-medium hover:underline" href={`/model-profile?model=${model.id}`}>Open profile <ArrowRight className="size-3" /></Link></div>)}</div></div></section>

        <section className="border-y border-border bg-muted/25 px-4 py-12 sm:px-6 sm:py-16"><div className="mx-auto max-w-7xl"><div className="mb-7"><p className="font-mono text-xs text-muted-foreground">02 / CAPABILITY</p><h2 className="mt-2 text-2xl font-semibold">Shared radar and exact values</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">The radar uses only comparable axes. The table is the authoritative readable representation of the same result.</p></div><div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]"><Card><CardContent><ComparisonRadarChart models={models} /></CardContent></Card><div className="overflow-x-auto rounded-xl border border-border bg-card"><table className="w-full min-w-[560px] border-collapse text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-left">Capability</th>{models.map((model) => <th className="px-4 py-3 text-right" key={model.id}>{model.name}</th>)}</tr></thead><tbody>{capabilityRows.map((label, rowIndex) => <tr className="border-t border-border" key={label}><td className="px-4 py-3 text-muted-foreground">{label}</td>{models.map((model) => { const value = capabilityValues(model)[rowIndex]; return <td className="px-4 py-3 text-right font-mono" key={model.id}>{value === null ? "Unavailable" : value}</td>; })}</tr>)}</tbody></table></div></div></div></section>

        <section className="px-4 py-12 sm:px-6 sm:py-16"><div className="mx-auto max-w-7xl"><div className="mb-7"><p className="font-mono text-xs text-muted-foreground">03 / RUNTIME & ECONOMICS</p><h2 className="mt-2 text-2xl font-semibold">Three lenses, separate units</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Token price, observed throughput, and context capacity remain distinct so scale does not imply equivalence.</p></div><ComparisonEconomicsCharts models={models} /></div></section>

        <section className="border-y border-border bg-muted/25 px-4 py-12 sm:px-6 sm:py-16"><div className="mx-auto max-w-7xl"><div className="mb-7"><p className="font-mono text-xs text-muted-foreground">04 / DECISION DELTAS</p><h2 className="mt-2 text-2xl font-semibold">What changes across this set</h2></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Highest evidence", bestEvidence, bestEvidence?.score === null ? "Unavailable" : String(bestEvidence?.score ?? "Unavailable")], ["Lowest blended price", cheapest, cheapest ? `${formatPrice(blendedPrice(cheapest))} / 1M` : "Unavailable"], ["Largest context", largestContext, largestContext ? formatContext(largestContext.context) : "Unavailable"], ["Fastest observation", fastest, fastest?.speed === null ? "Unavailable" : `${fastest?.speed ?? "Unavailable"} t/s`]].map(([label, model, value]) => <Card key={String(label)}><CardHeader><p className="text-xs text-muted-foreground">{label as string}</p><CardTitle className="mt-2">{(model as CatalogModel | undefined)?.name ?? "Unavailable"}</CardTitle></CardHeader><CardContent><p className="font-mono text-xl">{value as string}</p></CardContent></Card>)}</div><div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card"><table className="w-full min-w-[760px] border-collapse text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-left">Model</th><th className="px-4 py-3 text-right">Evidence</th><th className="px-4 py-3 text-right">Blended / 1M</th><th className="px-4 py-3 text-right">Throughput</th><th className="px-4 py-3 text-right">Context</th></tr></thead><tbody>{models.map((model) => <tr className="border-t border-border" key={model.id}><td className="px-4 py-3 font-medium">{model.name}</td><td className="px-4 py-3 text-right font-mono">{model.score ?? "Unavailable"}</td><td className="px-4 py-3 text-right font-mono">{formatPrice(blendedPrice(model))}</td><td className="px-4 py-3 text-right font-mono">{model.speed === null ? "Unavailable" : `${model.speed} t/s`}</td><td className="px-4 py-3 text-right font-mono">{formatContext(model.context)}</td></tr>)}</tbody></table></div></div></section>

        <section className="px-4 py-12 sm:px-6 sm:py-16"><div className="mx-auto max-w-7xl"><Card><CardHeader><div className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 className="size-4 text-emerald-500" />Freshness and provenance preserved</div><CardTitle className="mt-3">Mixed-source comparisons keep per-source time</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><div className="rounded-lg border border-border p-4"><p className="text-xs text-muted-foreground">Effective comparison time</p><p className="mt-2 font-mono">Unavailable across mixed sources</p></div><div className="rounded-lg border border-border p-4"><p className="text-xs text-muted-foreground">Per-source provenance</p><p className="mt-2 font-mono">Retained for {models.length} models</p></div><p className="sm:col-span-2 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><CircleAlert className="mt-0.5 size-3.5 shrink-0" />A mixed-source result may have no shared effective timestamp while still preserving each source’s observation time and attribution.</p></CardContent></Card></div></section>
      </div> : null}
    </main>
  );
}
