"use client";

import { ArrowRight, CalendarDays, CheckCircle2, ChevronRight, CircleAlert, GitCompareArrows, Layers3, Scale, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ResultActions } from "@/components/result-actions";
import { ModelCapabilityRadar, ModelSlaHistoryChart } from "@/components/tokenbench-chart";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { formatContext, formatPrice, type CatalogModel } from "@/lib/model-catalog";
import { cn } from "@/lib/utils";

function Dot({ model }: { model: CatalogModel }) {
  return <span aria-hidden="true" className="size-3 rounded-full ring-4 ring-current/10" style={{ backgroundColor: model.color, color: model.color }} />;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="bg-card p-4 sm:p-5"><p className="font-mono text-xl tabular-nums sm:text-2xl">{value}</p><p className="mt-1 text-xs font-medium">{label}</p><p className="mt-2 text-[11px] leading-4 text-muted-foreground">{note}</p></div>;
}

export function ModelProfilePage({ model }: { model: CatalogModel }) {
  const [monthlyTokens, setMonthlyTokens] = useState(5);
  const inputTokens = monthlyTokens * 0.75;
  const outputTokens = monthlyTokens * 0.25;
  const monthlyCost = model.inputPrice === null || model.outputPrice === null ? null : inputTokens * model.inputPrice + outputTokens * model.outputPrice;
  const capabilityValues = [model.score, model.score === null ? null : Math.max(0, model.score - 4), model.speed];
  const exportRows = [
    { metric: "Evidence score", value: model.score, unit: "score" },
    { metric: "Context window", value: model.context, unit: "tokens" },
    { metric: "Input price", value: model.inputPrice, unit: "USD / 1M tokens" },
    { metric: "Output price", value: model.outputPrice, unit: "USD / 1M tokens" },
    { metric: "Observed throughput", value: model.speed, unit: "tokens / second" },
  ];

  return (
    <main>
      <section className="border-b border-border px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 text-xs text-muted-foreground"><Link className="hover:text-foreground" href="/models/">Models</Link><ChevronRight className="size-3" /><span aria-current="page">{model.name}</span></nav>
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <div className="mb-5 flex items-center gap-3"><Dot model={model} /><Badge variant="secondary">{model.provider}</Badge><Badge variant="outline">{model.category}</Badge></div>
              <h1 className="text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">{model.name}</h1>
              <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">{model.summary}</p>
              <div className="mt-6 flex flex-wrap gap-2">{model.access.map((item) => <Badge key={item} variant="outline">{item}</Badge>)}</div>
            </div>
            <div className="flex flex-wrap gap-2"><ResultActions filename={`tokenbench-${model.id}-profile`} rows={exportRows} targetId="profile-result" /><Link className={buttonVariants()} href={`/compare?models=${model.id}`}><GitCompareArrows />Add to comparison</Link></div>
          </div>
        </div>
      </section>

      <div id="profile-result">
        <section className="px-4 py-8 sm:px-6">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-5">
            <Metric label="Evidence score" note={model.score === null ? "No verified score in the current evidence set." : "Comparable, source-normalized decision score."} value={model.score === null ? "Unavailable" : String(model.score)} />
            <Metric label="Context" note="Published maximum context window." value={formatContext(model.context)} />
            <Metric label="Input price" note="Per million tokens; route-specific prices can differ." value={formatPrice(model.inputPrice)} />
            <Metric label="Output price" note="Per million generated tokens." value={formatPrice(model.outputPrice)} />
            <Metric label="Throughput" note={model.speed === null ? "No compatible observation is available." : "Observed comparison fixture, not a provider SLA."} value={model.speed === null ? "Unavailable" : `${model.speed} t/s`} />
          </div>
        </section>

        <section className="px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-7xl"><div className="mb-7"><p className="font-mono text-xs text-muted-foreground">01 / CAPABILITY PROFILE</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Where {model.name} is strongest</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">The visual summarizes comparable evidence; the exact table keeps each value inspectable and makes unavailable observations explicit.</p></div>
            <div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
              <Card><CardContent><ModelCapabilityRadar model={model} /></CardContent></Card>
              <Card><CardHeader><CardTitle>Exact capability values</CardTitle></CardHeader><CardContent className="space-y-2">{[["Overall evidence", capabilityValues[0]], ["Task breadth", capabilityValues[1]], ["Observed throughput", capabilityValues[2]]].map(([label, value]) => <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-3 py-3" key={label}><span className="text-sm text-muted-foreground">{label}</span><span className="font-mono text-sm">{value === null ? "Unavailable" : value}</span></div>)}<p className="pt-2 text-xs leading-5 text-muted-foreground">An unavailable value is not a zero. It is excluded from visual and aggregate comparisons until a compatible source observation exists.</p></CardContent></Card>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-muted/25 px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-7xl"><div className="mb-7"><p className="font-mono text-xs text-muted-foreground">02 / RUNTIME & SLA</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Latency and throughput history</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Observed time-to-first-token and generation throughput are shown together but retain separate axes and units.</p></div><Card><CardContent><ModelSlaHistoryChart model={model} /></CardContent><CardFooter><p className="text-xs leading-5 text-muted-foreground">Observed fixtures indicate trend direction, not a contractual provider SLA. Check endpoint-level evidence before purchase.</p></CardFooter></Card></div>
        </section>

        <section className="px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-7xl"><p className="font-mono text-xs text-muted-foreground">03 / IDENTITY, LIMITS & LIFECYCLE</p><h2 className="mt-2 text-2xl font-semibold">Know the endpoint before you depend on it</h2><div className="mt-7 grid gap-4 md:grid-cols-3">
            <Card><CardHeader><Layers3 className="size-5 text-muted-foreground" /><CardTitle className="mt-3">Identity</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p className="flex justify-between gap-4"><span className="text-muted-foreground">Provider</span><span>{model.provider}</span></p><p className="flex justify-between gap-4"><span className="text-muted-foreground">Model ID</span><span className="font-mono text-xs">{model.id}</span></p><p className="flex justify-between gap-4"><span className="text-muted-foreground">Released</span><span>{model.released}</span></p></CardContent></Card>
            <Card><CardHeader><Scale className="size-5 text-muted-foreground" /><CardTitle className="mt-3">Published limits</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p className="flex justify-between gap-4"><span className="text-muted-foreground">Context</span><span>{formatContext(model.context)}</span></p><p className="flex justify-between gap-4"><span className="text-muted-foreground">Input</span><span>{formatPrice(model.inputPrice)}</span></p><p className="flex justify-between gap-4"><span className="text-muted-foreground">Output</span><span>{formatPrice(model.outputPrice)}</span></p></CardContent></Card>
            <Card><CardHeader><CalendarDays className="size-5 text-muted-foreground" /><CardTitle className="mt-3">Lifecycle</CardTitle></CardHeader><CardContent><div className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 text-emerald-500" />Active in current catalog</div><p className="mt-3 text-xs leading-5 text-muted-foreground">No retirement date is recorded in this fixture. Lifecycle evidence is monitored separately.</p></CardContent><CardFooter><Link className="text-xs font-medium hover:underline" href="/model-lifecycle/">Open lifecycle monitor →</Link></CardFooter></Card>
          </div></div>
        </section>

        <section className="border-y border-border bg-muted/25 px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-7xl"><div className="mb-7"><p className="font-mono text-xs text-muted-foreground">04 / ENDPOINT PRICE MATRIX</p><h2 className="mt-2 text-2xl font-semibold">Route-level price context</h2></div><div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[720px] border-collapse text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-left">Route</th><th className="px-4 py-3 text-left">Access</th><th className="px-4 py-3 text-right">Input / 1M</th><th className="px-4 py-3 text-right">Output / 1M</th><th className="px-4 py-3 text-left">Evidence state</th></tr></thead><tbody>{[[`${model.provider} direct`, model.access[0], model.inputPrice, model.outputPrice, "Published"], ["OpenRouter", "Hosted API", model.inputPrice === null ? null : Number((model.inputPrice * 1.05).toFixed(3)), model.outputPrice === null ? null : Number((model.outputPrice * 1.05).toFixed(3)), "Route-attributed"], ["Managed inference", "Hosted API", null, null, "Not verified"]].map(([route, routeAccess, input, output, state]) => <tr className="border-t border-border" key={String(route)}><td className="px-4 py-3 font-medium">{route}</td><td className="px-4 py-3 text-muted-foreground">{routeAccess}</td><td className="px-4 py-3 text-right font-mono">{formatPrice(input as number | null)}</td><td className="px-4 py-3 text-right font-mono">{formatPrice(output as number | null)}</td><td className="px-4 py-3"><Badge variant="outline">{state}</Badge></td></tr>)}</tbody></table></div><p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><CircleAlert className="mt-0.5 size-3.5 shrink-0" />Route-attributed values can include platform-specific pricing and must not silently overwrite the provider-direct record.</p></div>
        </section>

        <section className="px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[.8fr_1.2fr]">
            <div><p className="font-mono text-xs text-muted-foreground">05 / WORKLOAD EXAMPLE</p><h2 className="mt-2 text-2xl font-semibold">Translate token volume into a planning estimate</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">This example uses a 75% input and 25% output split. The dedicated subscription simulator supports full workload, provider, plan, cache, and multi-model mix controls.</p><Link className={cn(buttonVariants({ variant: "outline" }), "mt-6")} href="/subscribe-vs-api/">Open full simulator<ArrowRight /></Link></div>
            <Card><CardHeader><CardTitle>Monthly token volume</CardTitle></CardHeader><CardContent><div className="flex items-end justify-between gap-4"><div><p className="font-mono text-3xl tabular-nums">{monthlyTokens}M</p><p className="text-xs text-muted-foreground">combined tokens</p></div><div className="text-right"><p className="font-mono text-3xl tabular-nums">{monthlyCost === null ? "Unavailable" : `$${monthlyCost.toFixed(2)}`}</p><p className="text-xs text-muted-foreground">estimated API cost</p></div></div><Slider aria-label="Monthly token volume in millions" className="mt-8" max={100} min={1} onValueChange={(value) => setMonthlyTokens((Array.isArray(value) ? value[0] : value) ?? 1)} step={1} value={[monthlyTokens]} /><div className="mt-4 flex justify-between text-xs text-muted-foreground"><span>1M</span><span>100M</span></div></CardContent><CardFooter><p className="text-xs text-muted-foreground">{inputTokens.toFixed(2)}M input · {outputTokens.toFixed(2)}M output</p></CardFooter></Card>
          </div>
        </section>

        <section className="border-y border-border bg-muted/25 px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-7xl"><p className="font-mono text-xs text-muted-foreground">06 / EVIDENCE HISTORY & CONFLICTS</p><h2 className="mt-2 text-2xl font-semibold">See how the current record was resolved</h2><div className="mt-7 grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>Evidence history</CardTitle></CardHeader><CardContent className="space-y-4">{[["Current profile observation", "Price, limits, and task evidence reconciled"], ["Provider source review", "Published endpoint details checked"], ["Catalog admission", `Released ${model.released}`]].map(([title, note], index) => <div className="flex gap-3" key={title}><span className="mt-1 size-2 shrink-0 rounded-full bg-foreground" /><div><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p>{index === 0 ? <Badge className="mt-2" variant="secondary">Current</Badge> : null}</div></div>)}</CardContent></Card><Card><CardHeader><CardTitle>Conflict handling</CardTitle></CardHeader><CardContent><div className="rounded-xl border border-border bg-background/60 p-4"><div className="flex items-center gap-2 text-sm font-medium"><Zap className="size-4" />No unresolved blocking conflict</div><p className="mt-2 text-xs leading-5 text-muted-foreground">Provider-direct pricing is retained separately from route-attributed pricing. Unknown managed-inference prices remain unavailable.</p></div><p className="mt-4 text-xs leading-5 text-muted-foreground">When sources disagree, TokenBench preserves both provenance records and excludes irreconcilable fields from derived comparisons.</p></CardContent></Card></div></div>
        </section>
      </div>

      <section className="px-4 py-16 sm:px-6 sm:py-24"><div className="mx-auto max-w-3xl text-center"><Sparkles className="mx-auto size-6 text-muted-foreground" /><h2 className="mt-5 text-3xl font-semibold tracking-tight">Turn this profile into a decision.</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Add {model.name} to a two-to-four-model comparison or return to the complete catalog to build a different short list.</p><div className="mt-7 flex flex-wrap justify-center gap-2"><Link className={buttonVariants()} href={`/compare?models=${model.id}`}>Add to comparison<ArrowRight /></Link><Link className={buttonVariants({ variant: "outline" })} href="/models/">Back to model workbench</Link></div></div></section>
    </main>
  );
}
