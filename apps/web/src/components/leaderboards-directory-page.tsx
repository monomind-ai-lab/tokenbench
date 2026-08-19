import {
  ArrowRight,
  Binary,
  BookOpen,
  Bot,
  Brain,
  Braces,
  ChartNoAxesCombined,
  Clapperboard,
  Code2,
  DollarSign,
  Eye,
  FileImage,
  Gauge,
  Image,
  Images,
  Scale,
  Scissors,
  SlidersHorizontal,
  Trophy,
  Users,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LEADERBOARD_ROUTES,
  type LeaderboardKey,
} from "@tokenbench/routing/leaderboard-routes";

const GROUPS = [
  {
    id: "language-systems",
    title: "Language and agent systems",
    copy: "Capability, coding, agents, preference, value, pricing, and context remain separate decision lenses.",
    icon: Braces,
    keys: [
      "llm-overall",
      "llm-coding",
      "llm-agentic",
      "llm-reasoning",
      "llm-knowledge",
      "llm-human-preference",
      "llm-value",
      "llm-pricing-context",
    ],
  },
  {
    id: "multimodal",
    title: "Multimodal understanding",
    copy: "Inspect vision and document evidence inside its measured task conditions rather than folding it into a text score.",
    icon: FileImage,
    keys: ["multimodal-vision-documents"],
  },
  {
    id: "generative-media",
    title: "Generative media",
    copy: "Compare creation and editing workflows with modality-specific evidence, rights context, and explicit unavailable states.",
    icon: Binary,
    keys: [
      "media-text-to-image",
      "media-image-editing",
      "media-text-to-video",
      "media-image-to-video",
      "media-video-editing",
    ],
  },
] as const satisfies readonly {
  id: string;
  title: string;
  copy: string;
  icon: typeof Braces;
  keys: readonly LeaderboardKey[];
}[];

const SOURCE_BY_ROUTE: Record<LeaderboardKey, string> = {
  "llm-overall": "BenchLM",
  "llm-coding": "BenchLM",
  "llm-agentic": "BenchLM",
  "llm-reasoning": "BenchLM",
  "llm-knowledge": "BenchLM",
  "llm-human-preference": "LMArena",
  "llm-value": "TokenBench",
  "llm-pricing-context": "OpenRouter",
  "multimodal-vision-documents": "LMArena",
  "media-text-to-image": "LMArena",
  "media-image-editing": "LMArena",
  "media-text-to-video": "LMArena",
  "media-image-to-video": "LMArena",
  "media-video-editing": "LMArena",
};

const ICON_BY_ROUTE: Record<LeaderboardKey, LucideIcon> = {
  "llm-overall": Trophy,
  "llm-coding": Code2,
  "llm-agentic": Bot,
  "llm-reasoning": Brain,
  "llm-knowledge": BookOpen,
  "llm-human-preference": Users,
  "llm-value": Scale,
  "llm-pricing-context": DollarSign,
  "multimodal-vision-documents": Eye,
  "media-text-to-image": Image,
  "media-image-editing": WandSparkles,
  "media-text-to-video": Clapperboard,
  "media-image-to-video": Images,
  "media-video-editing": Scissors,
};

function LeaderboardRow({ routeKey, index }: { routeKey: LeaderboardKey; index: number }) {
  const route = LEADERBOARD_ROUTES[routeKey];
  const Icon = ICON_BY_ROUTE[routeKey];
  return (
    <Link
      className="group grid gap-4 border-t border-border px-4 py-5 transition-colors first:border-t-0 hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[92px_minmax(0,1fr)_auto] sm:items-center sm:px-6"
      href={route.pathname}
    >
      <span className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-muted/60 text-muted-foreground transition-colors group-hover:bg-background group-hover:text-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Lens {String(index + 1).padStart(2, "0")}</span>
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-base font-medium tracking-tight">{route.seo.h1}</span>
          <Badge className="font-mono text-[10px]" variant="outline">{SOURCE_BY_ROUTE[routeKey]}</Badge>
        </span>
        <span className="mt-2 block max-w-3xl text-sm leading-6 text-muted-foreground">{route.seo.summary}</span>
      </span>
      <span className="flex items-center gap-2 text-xs font-medium">
        Open lens
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
      </span>
    </Link>
  );
}

export function LeaderboardsDirectoryPage() {
  return (
    <div>
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_16%,rgba(84,137,214,.15),transparent_29%),radial-gradient(circle_at_16%_92%,rgba(217,119,87,.08),transparent_24%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1.08fr_.92fr] lg:px-10 lg:py-24">
          <div className="max-w-3xl">
            <h1 className="text-balance text-5xl font-semibold leading-[.98] tracking-[-.04em] sm:text-6xl">Choose the evidence lens before the winner.</h1>
            <p className="mt-7 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">Fourteen methodology-specific leaderboards keep capability, preference, value, price, context, and media evidence in their own measured frames.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button className="min-h-11 rounded-full" nativeButton={false} render={<Link href="#language-systems" />} size="lg">Browse every lens<ArrowRight /></Button>
              <Button className="min-h-11 rounded-full" disabled size="lg" variant="outline">Custom ranking rebuild in progress</Button>
            </div>
          </div>
          <div className="self-end overflow-hidden rounded-2xl border border-border bg-card/90 shadow-soft">
            <div className="border-b border-border px-5 py-4">
              <p className="text-sm font-medium">Evidence topology</p>
              <p className="mt-1 text-xs text-muted-foreground">The route determines the source, metric, and interpretation.</p>
            </div>
            <nav aria-label="Leaderboard groups" className="divide-y divide-border">
              {GROUPS.map((group) => {
                const Icon = group.icon;
                return (
                  <Link className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" href={`#${group.id}`} key={group.id}>
                    <span className="grid size-9 place-items-center rounded-xl bg-muted text-muted-foreground"><Icon className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{group.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{group.keys.length} {group.keys.length === 1 ? "lens" : "lenses"}</span>
                    </span>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
        <div className="mb-10 grid gap-5 border-b border-border pb-8 md:grid-cols-[1fr_1.2fr] md:items-end">
          <h2 className="max-w-xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Every route answers a narrower, more useful question.</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:justify-self-end">Source rank stays source rank. TokenBench-derived value views disclose their workload assumptions. Missing measurements remain unavailable instead of becoming zero.</p>
        </div>

        <div className="space-y-14">
          {GROUPS.map((group) => {
            const Icon = group.icon;
            return (
              <section aria-labelledby={`${group.id}-title`} className="scroll-mt-28" id={group.id} key={group.id}>
                <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
                  <div>
                    <Icon className="size-5 text-muted-foreground" />
                    <h2 className="mt-5 text-xl font-semibold" id={`${group.id}-title`}>{group.title}</h2>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{group.copy}</p>
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-border bg-card">
                    {group.keys.map((routeKey, index) => <LeaderboardRow index={index} key={routeKey} routeKey={routeKey} />)}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <section className="border-y border-border bg-muted/25">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_1fr] lg:px-10">
          <div>
            <Gauge className="size-5 text-muted-foreground" />
            <h2 className="mt-5 text-2xl font-semibold">Keep published rank intact.</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Use the dedicated routes when you need the source&apos;s own ordering, measurement conditions, freshness, and methodology context.</p>
            <Button className="mt-6 min-h-11 rounded-full" nativeButton={false} render={<Link href="/models/" />} variant="outline">Open model workbench<ArrowRight /></Button>
          </div>
          <div className="border-t border-border pt-8 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
            <SlidersHorizontal className="size-5 text-muted-foreground" />
            <h2 className="mt-5 text-2xl font-semibold">Re-rank with your own priorities.</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Submit the exact six-weight and filter matrix when a generic leaderboard cannot represent your workload. The shared link keeps that decision reproducible.</p>
            <Button className="mt-6 min-h-11 rounded-full" disabled>Custom ranking rebuild in progress<ChartNoAxesCombined /></Button>
          </div>
        </div>
      </section>
    </div>
  );
}
