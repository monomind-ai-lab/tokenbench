"use client";

import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  GitCompareArrows,
  Menu,
  Search,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

import { AgentROICalculator } from "@/components/agent-roi-calculator";
import { ComparisonTableOne } from "@/components/comparison-table-one";
import { ModelComparison } from "@/components/model-comparison";
import { ModelComparisonCompact } from "@/components/model-comparison-compact";
import { ModelComparisonHover } from "@/components/model-comparison-hover";
import { TokenBenchChart } from "@/components/tokenbench-chart";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DirectionAwareTabs } from "@/components/ui/direction-aware-tabs";
import { cn } from "@/lib/utils";

type PreviewView = "home" | "models" | "compare" | "calculator";

const NAV_ITEMS: Array<{ id: PreviewView; label: string }> = [
  { id: "home", label: "Overview" },
  { id: "models", label: "Models" },
  { id: "compare", label: "Compare" },
  { id: "calculator", label: "Calculator" },
];

const MODELS = [
  { name: "GPT-5.6 Sol", provider: "OpenAI", score: 98, price: "$2.50", color: "#f4f4f5" },
  { name: "Claude Opus 4.8", provider: "Anthropic", score: 97, price: "$5.00", color: "#d97757" },
  { name: "Gemini 3.6 Flash", provider: "Google", score: 91, price: "$0.35", color: "#5489d6" },
  { name: "DeepSeek V4 Pro", provider: "DeepSeek", score: 90, price: "$0.44", color: "#1e88e5" },
];

const ARTICLES = [
  ["Track Claude Code usage without losing cost context", "Guide"],
  ["Monitor OpenAI Codex usage across teams", "Guide"],
  ["OpenRouter routing and cost-control patterns", "Guide"],
  ["Legitimate free AI API access and credits", "Guide"],
  ["Reduce LLM API costs with caching and batch limits", "Guide"],
  ["Design a source-aware hybrid model router", "Guide"],
] as const;

function BrandDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="size-2.5 shrink-0 rounded-full ring-4 ring-white/5"
      style={{ backgroundColor: color }}
    />
  );
}

function SectionHeading({
  eyebrow,
  title,
  copy,
  as: Heading = "h2",
}: {
  eyebrow: string;
  title: string;
  copy: string;
  as?: "h1" | "h2";
}) {
  return (
    <div className="max-w-2xl">
      <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {eyebrow}
      </p>
      <Heading className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{title}</Heading>
      <p className="mt-3 text-pretty text-sm leading-6 text-muted-foreground sm:text-base">{copy}</p>
    </div>
  );
}

function HomePreview({ onNavigate }: { onNavigate: (view: PreviewView) => void }) {
  return (
    <main>
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_8%,rgba(84,137,214,.16),transparent_28%),radial-gradient(circle_at_92%_62%,rgba(217,119,87,.12),transparent_24%)]" />
        <div className="relative mx-auto grid min-h-[690px] max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1.02fr_.98fr] lg:px-10">
          <div>
            <Badge className="mb-6 gap-2 rounded-full px-3 py-1 font-mono text-[11px]" variant="secondary">
              <Sparkles className="size-3" /> Independent evidence layer
            </Badge>
            <h1 className="max-w-3xl text-balance text-5xl font-semibold leading-[.98] tracking-[-.045em] sm:text-6xl lg:text-7xl">
              Choose models on evidence, not launch-day noise.
            </h1>
            <p className="mt-7 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
              Source-aware model, pricing, and workload evidence for practical AI decisions—from discovery to monthly cost.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button className="rounded-full" onClick={() => onNavigate("models")} size="lg">
                Explore models <ArrowRight className="size-4" />
              </Button>
              <Button className="rounded-full" onClick={() => onNavigate("compare")} size="lg" variant="outline">
                Compare models
              </Button>
            </div>
            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-xs text-muted-foreground">
              {['Provenance preserved', 'Null is never zero', 'Shareable comparisons'].map((item) => (
                <span className="flex items-center gap-2" key={item}>
                  <Check className="size-3.5" /> {item}
                </span>
              ))}
            </div>
          </div>

          <Card className="overflow-hidden border-white/10 bg-card/90 py-0 shadow-2xl shadow-black/30 backdrop-blur">
            <CardHeader className="border-b border-border px-5 py-5 sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Decision pulse</p>
                  <CardTitle className="mt-1 text-base">Price × evidence quality</CardTitle>
                </div>
                <Badge variant="outline">Illustrative</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-5 sm:p-6">
              <TokenBenchChart />
              <div className="mt-5 divide-y divide-border rounded-xl border border-border bg-muted/30">
                {MODELS.slice(0, 3).map((model, index) => (
                  <button
                    className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/70"
                    key={model.name}
                    onClick={() => onNavigate("models")}
                    type="button"
                  >
                    <span className="w-4 font-mono text-[10px] text-muted-foreground">0{index + 1}</span>
                    <BrandDot color={model.color} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{model.name}</span>
                      <span className="text-xs text-muted-foreground">{model.provider}</span>
                    </span>
                    <span className="text-right">
                      <span className="block font-mono text-xs">{model.score}</span>
                      <span className="text-[10px] text-muted-foreground">score</span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-b border-border bg-card/30">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-border border-x border-border sm:grid-cols-4">
          {[
            { value: 30, label: "models in workbench" },
            { value: 12, label: "decision leaderboards" },
            { value: 6, label: "published guides" },
            { value: "2–4", label: "models per comparison" },
          ].map(({ value, label }) => (
            <div className="px-5 py-7 sm:px-7" key={label}>
              <p className="font-mono text-2xl font-semibold tracking-tight">
                {typeof value === "number" ? <AnimatedNumber value={value} /> : value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <SectionHeading
            copy="Filter, sort, inspect provenance, and move directly into a comparison without losing context."
            eyebrow="Discover & filter models"
            title="A workbench built for decisions"
          />
          <Button className="self-start rounded-full sm:self-auto" onClick={() => onNavigate("models")} variant="outline">
            Open models workbench <ArrowRight className="size-4" />
          </Button>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODELS.map((model) => (
            <Card className="group transition-shadow hover:shadow-md" key={model.name}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <BrandDot color={model.color} />
                    <div>
                      <CardTitle className="text-sm">{model.name}</CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">{model.provider}</p>
                    </div>
                  </div>
                  <Badge className="font-mono text-[10px]" variant="outline">{model.score}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border-t border-border pt-3">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Input</p>
                      <p className="mt-1 font-mono text-sm">{model.price}/1M</p>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-muted/20">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
          <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr]">
            <SectionHeading
              copy="Exactly six substantive guides in the published library. Empty channels stay out of the experience."
              eyebrow="Articles"
              title="Method before opinion"
            />
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {ARTICLES.map(([title, channel], index) => (
                <article className="group flex items-center gap-4 border-b border-border px-5 py-4 last:border-b-0" key={title}>
                  <span className="font-mono text-[10px] text-muted-foreground">0{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium">{title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{channel}</p>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function ModelsPreview() {
  const tabs = useMemo(
    () => [
      { id: 0, label: "Cards", content: <ModelComparison /> },
      { id: 1, label: "Compact", content: <ModelComparisonCompact /> },
      { id: 2, label: "Hover", content: <ModelComparisonHover /> },
    ],
    [],
  );

  return (
    <main className="mx-auto max-w-[1440px] px-2 py-14 sm:px-6">
      <div className="px-3 sm:px-5">
        <SectionHeading
          as="h1"
          copy="Move between decision cards, a condensed table, and hover details without losing the workbench context."
          eyebrow="Models"
          title="Choose the density that fits the task"
        />
      </div>
      <div className="mt-10">
        <DirectionAwareTabs tabs={tabs} />
      </div>
    </main>
  );
}

function ComparePreview() {
  return (
    <main className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:px-10">
      <SectionHeading
        as="h1"
        copy="Combine source-aware pricing, capability coverage, and benchmark evidence in one shareable comparison."
        eyebrow="Compare 2–4 models"
        title="One decision surface, multiple evidence views"
      />
      <Card className="mt-10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="size-4" /> Price-performance distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TokenBenchChart />
        </CardContent>
      </Card>
      <div className="mt-8 overflow-hidden rounded-xl border border-border bg-card">
        <ComparisonTableOne />
      </div>
    </main>
  );
}

function CalculatorPreview() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
      <SectionHeading
        as="h1"
        copy="Project a real workload across source prices, caching assumptions, and subscription alternatives."
        eyebrow="Calculator"
        title="Make the monthly trade-off tangible"
      />
      <div className="mt-8 overflow-hidden rounded-2xl border border-border">
        <AgentROICalculator />
      </div>
    </main>
  );
}

export function PreviewShell() {
  const [view, setView] = useState<PreviewView>("home");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const content = {
    home: <HomePreview onNavigate={setView} />,
    models: <ModelsPreview />,
    compare: <ComparePreview />,
    calculator: <CalculatorPreview />,
  }[view];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-amber-300/20 bg-amber-200/[.06] px-4 py-2 text-center text-[11px] text-amber-100/80">
        Design approval preview · content is illustrative · no production endpoints are active
      </div>
      <header className="sticky top-0 z-50 border-b border-border bg-background/88 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-5 px-5 sm:px-8 lg:px-10">
          <button className="flex items-center gap-2" onClick={() => setView("home")} type="button">
            <span className="grid size-7 place-items-center rounded-lg border border-white/15 bg-white text-[10px] font-black text-black">TB</span>
            <span className="font-semibold tracking-tight">TokenBench</span>
          </button>
          <nav aria-label="Preview navigation" className="ml-auto hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <button
                className={cn(
                  "rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  view === item.id && "bg-muted text-foreground",
                )}
                key={item.id}
                onClick={() => setView(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="hidden items-center gap-2 sm:flex">
            <Button aria-expanded={searchOpen} aria-label="Search" onClick={() => setSearchOpen((open) => !open)} size="icon-sm" variant="ghost"><Search /></Button>
            <Button className="rounded-full" onClick={() => setView("compare")} size="sm">
              Compare <GitCompareArrows />
            </Button>
          </div>
          <Button
            aria-controls="mobile-navigation"
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            className="ml-auto md:hidden"
            onClick={() => setMobileOpen((open) => !open)}
            size="icon-sm"
            variant="ghost"
          >
            <Menu />
          </Button>
        </div>
        <div className={cn("overflow-x-auto border-t border-border px-3 py-2 md:hidden", mobileOpen ? "flex" : "hidden")} id="mobile-navigation">
          {NAV_ITEMS.map((item) => (
            <button
              className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs text-muted-foreground", view === item.id && "bg-muted text-foreground")}
              key={item.id}
              onClick={() => {
                setView(item.id);
                setMobileOpen(false);
              }}
              type="button"
            >
              {item.label}
            </button>
          ))}
          <button
            className="shrink-0 rounded-full px-3 py-1.5 text-xs text-muted-foreground"
            onClick={() => {
              setSearchOpen((open) => !open);
              setMobileOpen(false);
            }}
            type="button"
          >
            Search
          </button>
        </div>
        {searchOpen ? (
          <div className="border-t border-border bg-background px-5 py-3">
            <label className="mx-auto flex max-w-3xl items-center gap-3 rounded-xl border border-border bg-card px-4 py-3" htmlFor="preview-search">
              <Search className="size-4 text-muted-foreground" />
              <span className="sr-only">Search TokenBench</span>
              <input autoFocus className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" id="preview-search" placeholder="Search models, comparisons, and guides" type="search" />
            </label>
          </div>
        ) : null}
      </header>

      {content}

      <footer className="border-t border-border bg-card/40">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1.3fr_repeat(3,1fr)] lg:px-10">
          <div>
            <p className="font-semibold">TokenBench</p>
            <p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">Source-aware model, pricing, and workload evidence for practical AI decisions.</p>
          </div>
          {[
            ["Explore", "Models · Popular models · Compare"],
            ["Evidence", "Leaderboards · Methodology · Lifecycle"],
            ["Learn", "Articles · Guides · Cost calculator"],
          ].map(([title, links]) => (
            <div key={title}>
              <p className="text-xs font-medium">{title}</p>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{links}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-border px-5 py-5 text-center text-[11px] text-muted-foreground">TokenBench preview · 2026 · No live infrastructure changed</div>
      </footer>
    </div>
  );
}
