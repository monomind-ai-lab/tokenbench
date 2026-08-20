import type { Metadata } from "next";
import { Suspense } from "react";

import { LlmPricePerformancePage } from "@/components/llm-price-performance-page";
import { loadLlmPricePerformance } from "@/lib/llm-price-performance-data.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "LLM Price vs Performance Benchmark",
  description:
    "Compare validated API pricing and benchmark lanes without treating unavailable values as zero.",
  alternates: { canonical: "/llm-price-performance/" },
};

function LlmPricePerformanceLoading() {
  return (
    <main aria-busy="true" className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <div className="h-10 w-80 max-w-full animate-pulse rounded-lg bg-muted" />
      <div className="mt-5 h-5 w-full max-w-2xl animate-pulse rounded bg-muted" />
      <div className="mt-10 h-80 animate-pulse rounded-2xl border border-border bg-card" />
    </main>
  );
}

export default async function LlmPricePerformanceRoute() {
  const snapshot = await loadLlmPricePerformance();
  return (
    <Suspense fallback={<LlmPricePerformanceLoading />}>
      <LlmPricePerformancePage snapshot={snapshot} />
    </Suspense>
  );
}
