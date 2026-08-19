import type { Metadata } from "next";
import { ArrowRight, BookOpen } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { guideIndexArticles } from "@/lib/articles";

export const metadata: Metadata = { title: "AI Cost and Model Guides", description: "Five practical field guides for AI usage evidence, API cost control, model routing, and legitimate access programs.", alternates: { canonical: "/guides/" } };

export default function GuidesPage() {
  return <main><section className="border-b border-border px-4 py-14 sm:px-6 sm:py-20"><div className="mx-auto max-w-7xl"><Badge className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em]" variant="secondary">Field guides</Badge><h1 className="max-w-4xl text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">Apply model and cost evidence to real workflows.</h1><p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">Five published guides with canonical detail pages in the TokenBench research library.</p></div></section><section className="px-4 py-12 sm:px-6 sm:py-16"><div className="mx-auto max-w-7xl"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{guideIndexArticles.map((article) => <Card key={article.slug}><CardHeader><div className="flex items-center justify-between"><Badge variant="outline">{article.topic}</Badge><span className="text-xs text-muted-foreground">{article.date}</span></div><CardTitle className="mt-4 text-xl">{article.title}</CardTitle></CardHeader><CardContent><p className="min-h-20 text-sm leading-6 text-muted-foreground">{article.dek}</p><div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><BookOpen className="size-4" />{article.readTime}</div></CardContent><CardFooter><Link className="inline-flex items-center gap-1 text-xs font-medium hover:underline" href={`/articles/${article.slug}/`}>Read guide <ArrowRight className="size-3" /></Link></CardFooter></Card>)}</div></div></section><section className="border-y border-border bg-muted/25 px-4 py-12 sm:px-6"><div className="mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-semibold">Turn the guidance into a cost scenario.</h2><p className="mt-2 text-sm text-muted-foreground">Use the complete provider, plan, model-mix, and workload simulator.</p></div><Link className={buttonVariants()} href="/subscribe-vs-api/">Open Subscribe vs API<ArrowRight /></Link></div></section></main>;
}
