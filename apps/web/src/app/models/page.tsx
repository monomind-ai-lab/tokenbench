import type { Metadata } from "next";

import { ModelsWorkbenchPage } from "@/components/models-workbench-page";
import { RouteEvidenceUnavailableState } from "@/components/route-evidence-ui";
import { loadModelSurfaceDirectory } from "@/lib/model-surface-data.server";
import { projectSurfaceDirectory } from "@tokenbench/frontend/model-surface-projectors";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI Model Workbench",
  description: "Explore the current published model response, inspect capability and route-pricing evidence, and build an ordered comparison set.",
  alternates: { canonical: "/models/" },
};

export default async function ModelsPage() {
  const snapshot = await loadModelSurfaceDirectory();
  if (snapshot.envelope === null || snapshot.mode === "unconfigured") {
    return <RouteEvidenceUnavailableState detail={snapshot.error ?? "Model evidence could not be loaded for this environment."} heading="Model evidence is not configured" />;
  }
  const projection = projectSurfaceDirectory(snapshot.envelope);
  return <ModelsWorkbenchPage mode={projection.mode} models={projection.data ?? []} status={projection.status} />;
}
