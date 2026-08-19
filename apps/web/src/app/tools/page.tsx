import type { Metadata } from "next";
import { ArrowRight, Calculator, Check } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "AI cost decision tools",
  description: "TokenBench tools for comparing verifiable model, subscription, and API costs.",
};

export default function ToolsPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:px-10">
      <div className="max-w-3xl">
        <p className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Tools</p>
        <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">AI cost decision tools</h1>
        <p className="mt-5 text-pretty text-base leading-7 text-muted-foreground">Start with the costs you can verify, then make every assumption visible enough to share and review.</p>
      </div>

      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight">Start with the costs you can verify</h2>
        <Card className="mt-7 overflow-hidden">
          <CardContent className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <span className="grid size-10 place-items-center rounded-xl border border-border bg-muted"><Calculator className="size-5" /></span>
              <h3 className="mt-6 text-xl font-semibold">Subscription vs. API calculator</h3>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Compare an individual subscription with a provider, plan, one-to-four-model usage mix, input/output assumptions, and monthly token volume. The result never claims unpublished account capacity.</p>
              <ul className="mt-5 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <li className="flex items-center gap-2"><Check className="size-3.5" />Shareable scenario URL</li>
                <li className="flex items-center gap-2"><Check className="size-3.5" />Source and derived lines separated</li>
                <li className="flex items-center gap-2"><Check className="size-3.5" />Breakeven chart and exact table</li>
                <li className="flex items-center gap-2"><Check className="size-3.5" />CSV, print, and copy-link actions</li>
              </ul>
            </div>
            <Button className="self-start rounded-full lg:self-auto" nativeButton={false} render={<Link href="/subscribe-vs-api/" />} size="lg">Open calculator<ArrowRight /></Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
