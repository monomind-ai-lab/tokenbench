import type { Metadata } from "next";
import Link from "next/link";

import { ModelProfilePage } from "@/components/model-profile-page";
import { catalogModels } from "@/lib/model-catalog";

export const metadata: Metadata = {
  title: "Model Profile",
  description: "Inspect an AI model's capability evidence, runtime history, limits, price routes, workload economics, and source conflicts.",
};

export default async function ModelProfileRoute({ searchParams }: { searchParams: Promise<{ model?: string | string[] }> }) {
  const query = await searchParams;
  const requested = Array.isArray(query.model) ? query.model[0] : query.model;
  const model = catalogModels.find((candidate) => candidate.id === requested);
  if (!model) {
    return <main className="px-4 py-24 sm:px-6"><div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-8 sm:p-12"><p className="font-mono text-xs text-muted-foreground">MODEL PROFILE</p><h1 className="mt-4 text-3xl font-semibold tracking-tight">Choose a published model</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">{requested ? `“${requested}” is not available in the current model-profile fixture.` : "This route needs a model query parameter."} Unknown identifiers are not silently replaced with a different model.</p><Link className="mt-7 inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground" href="/models/">Open the model workbench</Link></div></main>;
  }
  return <ModelProfilePage model={model} />;
}
