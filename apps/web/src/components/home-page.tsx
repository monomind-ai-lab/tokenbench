"use client";

import { ArrowRight, Check, ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { CapabilityRadarChart } from "@/components/tokenbench-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type FilterName = "all" | "open" | "latency" | "throughput";

const WORKBENCH_MODELS = [
  { slug: "gpt-4o", name: "GPT-4o", provider: "OpenAI", access: "Proprietary", input: 2.5, output: 10, ttft: 0.38, throughput: 105 },
  { slug: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic", access: "Proprietary", input: 3, output: 15, ttft: 0.42, throughput: 82 },
  { slug: "deepseek-v3", name: "DeepSeek V3", provider: "DeepSeek", access: "Open weights", input: 0.27, output: 1.1, ttft: 0.55, throughput: 65 },
  { slug: "llama-3-3-70b", name: "Llama 3.3 70B", provider: "Meta", access: "Open weights", input: 0.3, output: 0.4, ttft: 0.31, throughput: 110 },
] as const;

const POPULAR_MODELS = [
  { name: "GPT-5.6 Sol", provider: "OpenAI", score: 96.2, metric: "Coding", metricValue: "96", throughput: "118 tok/s", blended: "$5.25/1M", color: "#f4f4f5" },
  { name: "Claude Mythos 5", provider: "Anthropic", score: 96, metric: "Coding", metricValue: "97", throughput: "96 tok/s", blended: "$5.90/1M", color: "#d97757" },
  { name: "Gemini 3.6 Pro", provider: "Google", score: 95, metric: "Multimodal", metricValue: "98", throughput: "112 tok/s", blended: "$3.10/1M", color: "#5489d6" },
  { name: "DeepSeek V4 Flash 0731", provider: "DeepSeek", score: 88.8, metric: "Coding", metricValue: "92", throughput: "132 tok/s", blended: "$0.26/1M", color: "#1e88e5" },
] as const;

const RESEARCH = [
  { href: "/articles/hybrid-router/", label: "Architecture", title: "A hybrid router for high-stakes agentic work", copy: "Reserve expensive capability for the requests that need it while keeping routine work observable and reversible.", meta: "9 min read · Aug 2026" },
  { href: "/guides/reduce-llm-api-costs-caching-batch-output-limits/", label: "Cost optimization", title: "Lower LLM API Costs with Caching, Batch Jobs, and Output Caps", copy: "Reduce cost per successful task without shifting expense into retries, latency, or human review.", meta: "11 min read · Aug 2026" },
  { href: "/guides/openrouter-guide-model-routing-cost-controls/", label: "API routing", title: "OpenRouter for Beginners: Routing and Cost Controls", copy: "Use explicit budgets, logging, and provider-policy choices when one API reaches multiple models.", meta: "10 min read · Aug 2026" },
] as const;

function BrandDot({ color }: { color: string }) {
  return <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full ring-4 ring-foreground/5" style={{ backgroundColor: color }} />;
}

function SectionHeader({ number, title, copy, href, action }: { number: string; title: string; copy: string; href?: string; action?: string }) {
  return (
    <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
      <div className="max-w-2xl">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[.22em] text-muted-foreground">{number}</p>
        <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
        <p className="mt-3 text-pretty text-sm leading-6 text-muted-foreground sm:text-base">{copy}</p>
      </div>
      {href && action ? <Button className="self-start rounded-full sm:self-auto" nativeButton={false} render={<Link href={href} />} variant="outline">{action}<ArrowRight /></Button> : null}
    </div>
  );
}

function DecisionSnapshot() {
  return (
    <Card aria-label="Illustrative model evidence preview" className="overflow-hidden border-foreground/10 bg-card/90 py-0 shadow-2xl shadow-black/20 backdrop-blur">
      <CardHeader className="border-b border-border px-5 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div><p className="font-mono text-[10px] tracking-[.18em] text-muted-foreground">DECISION SNAPSHOT</p><CardTitle className="mt-2 text-base">Observed model evidence</CardTitle></div>
          <Badge variant="outline">17 Aug 2026 · prototype</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-5 sm:p-6">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-border pb-3 font-mono text-[9px] uppercase tracking-wider text-muted-foreground"><span>Candidate</span><span>Score</span><span>TTFT</span><span>$/1M</span></div>
        <ol className="divide-y divide-border">
          {[
            ["GPT-5.6 Sol", "OpenAI · proprietary", "96.2", "0.33s", "$5.25", "#f4f4f5"],
            ["Gemini 3.6 Pro", "Google · proprietary", "95.0", "0.36s", "$3.10", "#5489d6"],
            ["DeepSeek V4 Flash 0731", "DeepSeek · open weights", "88.8", "0.27s", "$0.26", "#1e88e5"],
          ].map(([name, provider, score, ttft, price, color], index) => (
            <li className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 py-4" key={name}>
              <div className="flex min-w-0 items-center gap-3"><span className="font-mono text-[10px] text-muted-foreground">0{index + 1}</span><BrandDot color={color} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{name}</span><span className="block truncate text-[10px] text-muted-foreground">{provider}</span></span></div>
              <span className="font-mono text-xs">{score}</span><span className="font-mono text-xs">{ttft}</span><span className="font-mono text-xs">{price}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-2"><Check className="size-3.5" />Source-linked evidence</span><span>Unknowns remain unavailable</span></div>
      </CardContent>
    </Card>
  );
}

function ModelWorkbenchPreview() {
  const [filter, setFilter] = useState<FilterName>("all");
  const models = useMemo(() => WORKBENCH_MODELS.filter((model) => {
    if (filter === "open") return model.access === "Open weights";
    if (filter === "latency") return model.ttft <= 0.4;
    if (filter === "throughput") return model.throughput >= 100;
    return true;
  }), [filter]);

  return (
    <div className="mt-8">
      <div aria-label="Model workbench filters" className="mb-5 flex flex-wrap gap-2" role="group">
        {([ ["all", "All models"], ["open", "Open-weight"], ["latency", "Low-latency"], ["throughput", "High-throughput"] ] as const).map(([id, label]) => <button aria-pressed={filter === id} className={cn("rounded-full border px-4 py-2 text-xs transition-colors", filter === id ? "border-active-control bg-active-control text-active-control-foreground hover:bg-active-control" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground")} key={id} onClick={() => setFilter(id)} type="button">{label}</button>)}
      </div>
      <div aria-label="Model workbench preview" className="overflow-x-auto rounded-2xl border border-border bg-card" role="region">
        <table className="min-w-[760px] w-full border-collapse text-sm">
          <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-5 py-4 font-medium">Model</th><th className="px-4 py-4 font-medium">Provider</th><th className="px-4 py-4 font-medium">Access</th><th className="px-4 py-4 text-right font-medium">Input / 1M</th><th className="px-4 py-4 text-right font-medium">Output / 1M</th><th className="px-4 py-4 text-right font-medium">TTFT · p50</th><th className="px-5 py-4 text-right font-medium">Throughput</th></tr></thead>
          <tbody>{models.map((model) => <tr className="border-b border-border last:border-b-0 hover:bg-muted/40" key={model.slug}><td className="px-5 py-4 font-medium"><Link className="hover:underline" href={`/model-profile?model=${model.slug}`}>{model.name}</Link></td><td className="px-4 py-4 text-muted-foreground">{model.provider}</td><td className="px-4 py-4 text-muted-foreground">{model.access}</td><td className="px-4 py-4 text-right font-mono">${model.input.toFixed(2)}</td><td className="px-4 py-4 text-right font-mono">${model.output.toFixed(2)}</td><td className="px-4 py-4 text-right font-mono">{model.ttft.toFixed(2)}s</td><td className="px-5 py-4 text-right font-mono">{model.throughput} tok/s</td></tr>)}</tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{models.length} illustrative {models.length === 1 ? "model" : "models"} shown</p>
    </div>
  );
}

function SubscriptionPreview() {
  const [prompts, setPrompts] = useState(1200);
  const subscription = 20;
  const api = prompts * (13.8 / 1200);
  const crossover = Math.ceil(subscription / (13.8 / 1200));
  const apiLower = api < subscription;

  return (
    <div className="mt-9 grid items-stretch gap-6 lg:grid-cols-[.8fr_1.2fr]">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <Card className="h-full"><CardContent className="flex h-full flex-col justify-center p-5 text-center"><p className="text-xs text-muted-foreground">Fixed seat</p><p className="mt-3 font-mono text-3xl">$20.00</p><p className="mt-1 text-xs text-muted-foreground">per month</p></CardContent></Card>
        <span className="font-mono text-[10px] text-muted-foreground">VERSUS</span>
        <Card className="h-full"><CardContent className="flex h-full flex-col justify-center p-5 text-center"><p className="text-xs text-muted-foreground">API consumption</p><p className="mt-3 font-mono text-3xl">${api.toFixed(2)}</p><p className="mt-1 text-xs text-muted-foreground">per month</p></CardContent></Card>
      </div>
      <Card><CardContent className="p-6">
        <div className="flex items-end justify-between gap-4"><div><label className="text-xs text-muted-foreground" htmlFor="monthly-prompts">Monthly prompts sent</label><output className="mt-2 block font-mono text-3xl" htmlFor="monthly-prompts">{prompts.toLocaleString()}</output></div><Badge variant={apiLower ? "secondary" : "default"}>{apiLower ? "API lower" : "Subscription lower"}</Badge></div>
        <input aria-label="Monthly prompts sent" className="mt-7 w-full accent-primary" id="monthly-prompts" max={4000} min={0} onChange={(event) => setPrompts(Number(event.target.value))} step={50} type="range" value={prompts} />
        <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground"><span>0</span><span>4,000</span></div>
        <p className="mt-5 text-sm leading-6 text-muted-foreground">{apiLower ? "API remains lower" : "A fixed subscription becomes lower"} at this workload. The illustrative crossover is approximately {crossover.toLocaleString()} prompts.</p>
      </CardContent></Card>
    </div>
  );
}

export function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_8%,color-mix(in_srgb,var(--primary)_16%,transparent),transparent_28%),radial-gradient(circle_at_92%_62%,rgba(217,119,87,.12),transparent_24%)]" />
        <div className="relative mx-auto grid min-h-[690px] max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1.02fr_.98fr] lg:px-10">
          <div>
            <Badge className="mb-6 gap-2 rounded-full px-3 py-1 font-mono text-[11px]" variant="secondary"><Sparkles className="size-3" />Independent evidence layer</Badge>
            <h1 className="max-w-3xl text-balance text-5xl font-semibold leading-[.98] tracking-[-.045em] sm:text-6xl lg:text-7xl">Empirical evidence for practical AI runtime and cost decisions.</h1>
            <p className="mt-7 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">Independent quantitative LLM analysis of capability, streaming latency, and route economics—without collapsed or hidden data.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row"><Button className="rounded-full" nativeButton={false} render={<Link href="/models/" />} size="lg">Explore models workbench<ArrowRight /></Button><Button className="rounded-full" nativeButton={false} render={<Link href="/compare/" />} size="lg" variant="outline">Compare models</Button></div>
            <p className="mt-7 max-w-xl text-xs leading-5 text-muted-foreground">Illustrative preview values · source adapters and revision timestamps remain visible on decision pages</p>
          </div>
          <DecisionSnapshot />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10"><SectionHeader action="Open models workbench" copy="Move from candidate discovery to exact route economics without leaving the evidence surface." href="/models/" number="01" title="Discover & Filter Models" /><ModelWorkbenchPreview /></section>

      <section className="border-y border-border bg-muted/20"><div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10"><SectionHeader action="View all popular model insights" copy="Scan the capability, service, and cost signals people compare most often." href="/popular-models/" number="02" title="Popular Model Insights" /><div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{POPULAR_MODELS.map((model) => <Card className="group" key={model.name}><CardHeader><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><BrandDot color={model.color} /><div><p className="text-xs text-muted-foreground">{model.provider}</p><CardTitle className="mt-1 text-sm">{model.name}</CardTitle></div></div><Badge className="font-mono" variant="outline">{model.score.toFixed(1)}</Badge></div></CardHeader><CardContent><dl className="grid gap-3 border-t border-border pt-4 text-xs"><div className="flex justify-between"><dt className="text-muted-foreground">{model.metric}</dt><dd className="font-mono">{model.metricValue}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Throughput</dt><dd className="font-mono">{model.throughput}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Blended</dt><dd className="font-mono">{model.blended}</dd></div></dl></CardContent></Card>)}</div><p className="mt-4 text-xs text-muted-foreground">Illustrative prototype ranking and service values</p></div></section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10"><SectionHeader action="Compare all models" copy="Compare capability shape and route constraints before choosing a default runtime." href="/compare/?models=gpt-4o%2Cdeepseek-v3" number="03" title="Head-to-Head Capability & Economics" /><div className="mt-9 grid gap-6 lg:grid-cols-[1.1fr_.9fr]"><Card><CardHeader><CardTitle className="text-base">Six-domain capability overlay</CardTitle></CardHeader><CardContent><CapabilityRadarChart /></CardContent></Card><Card><CardContent className="p-6"><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-center"><div><Badge variant="outline">Closed model</Badge><h3 className="mt-3 text-lg font-semibold">GPT-4o</h3><p className="text-xs text-muted-foreground">OpenAI · Proprietary</p></div><span className="font-mono text-[10px] text-muted-foreground">VS</span><div><Badge variant="outline">Open-weight model</Badge><h3 className="mt-3 text-lg font-semibold">DeepSeek V3</h3><p className="text-xs text-muted-foreground">DeepSeek · Open weights</p></div></div><dl className="mt-7 divide-y divide-border rounded-xl border border-border text-sm">{[["TTFT · lower is better", "0.38s", "0.55s"], ["Throughput · higher is better", "105 tok/s", "65 tok/s"], ["Input / output", "$2.50 / $10.00", "$0.27 / $1.10"], ["Blended cost", "$4.38 / 1M", "$0.48 / 1M"], ["Context", "128k", "128k"]].map(([label, first, second]) => <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-3" key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-mono text-xs">{first}</dd><dd className="font-mono text-xs">{second}</dd></div>)}</dl><p className="mt-5 text-xs leading-5 text-muted-foreground">Illustrative prototype data · compare page preserves exact values and unavailable states</p></CardContent></Card></div></section>

      <section className="border-y border-border bg-muted/20"><div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10"><SectionHeader action="Calculate subscription vs API savings" copy="Test when a fixed individual seat crosses an API-equivalent workload instead of treating either route as universally cheaper." href="/subscribe-vs-api/" number="04" title="Subscription vs. Pay-As-You-Go API Analysis" /><p className="mt-5 text-xs text-muted-foreground">Illustrative GPT-4o workload · 1,800 input + 700 output tokens per prompt · source prices shown separately in the calculator</p><SubscriptionPreview /></div></section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10"><SectionHeader action="Browse all articles" copy="Follow the assumptions, monitoring practices, and architecture behind defensible model decisions." href="/articles/" number="05" title="Methodological Research & Analysis" /><div className="mt-9 overflow-hidden rounded-2xl border border-border bg-card">{RESEARCH.map((article, index) => <Link className="group grid gap-3 border-b border-border px-5 py-5 transition-colors last:border-b-0 hover:bg-muted/50 sm:grid-cols-[120px_1fr_auto] sm:items-center" href={article.href} key={article.href}><span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{article.label}</span><span><span className="block text-sm font-medium">{article.title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{article.copy}</span></span><span className="flex items-center gap-3 text-xs text-muted-foreground"><span>{article.meta}</span><ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span><span className="sr-only">Article {index + 1}</span></Link>)}</div></section>
    </>
  );
}
