import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CompareWorkbenchPage } from "@/components/compare-workbench-page";
import { catalogModels } from "@/lib/model-catalog";

export const metadata: Metadata = {
  title: "Compare AI Models",
  description: "Compare two to four AI models across capability, runtime, token economics, context capacity, and source provenance.",
  alternates: { canonical: "/compare/" },
};

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ models?: string | string[] }> }) {
  const query = await searchParams;
  const rawValue = Array.isArray(query.models) ? query.models[0] : query.models;
  const raw = rawValue ?? "";
  const requested = raw.split(",").map((value) => value.trim()).filter(Boolean);
  const known = new Set(catalogModels.map((model) => model.id));
  const normalized = Array.from(new Set(requested.filter((id) => known.has(id)))).slice(0, 4);
  const canonical = normalized.join(",");
  if (raw && raw !== canonical) redirect(canonical ? `/compare?models=${canonical}` : "/compare");
  const models = normalized.map((id) => catalogModels.find((model) => model.id === id)).filter((model) => model !== undefined);
  return <CompareWorkbenchPage models={models} />;
}
