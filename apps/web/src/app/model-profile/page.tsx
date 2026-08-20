import type { Metadata } from "next";

import { ModelProfilePage } from "@/components/model-profile-page";
import { RouteEvidenceUnavailableState } from "@/components/route-evidence-ui";
import { loadModelSurfaceProfile } from "@/lib/model-surface-data.server";
import { projectSurfaceProfile } from "@tokenbench/frontend/model-surface-projectors";
import { isRouteEvidenceSlug } from "@tokenbench/frontend/route-evidence-projectors";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Model Profile",
  description: "Inspect an exact model evidence response across capability, route pricing, runtime, lifecycle, and source provenance.",
};

export default async function ModelProfileRoute({ searchParams }: { searchParams: Promise<{ model?: string | string[] }> }) {
  const query = await searchParams;
  const requested = Array.isArray(query.model) ? null : query.model;
  if (requested === undefined || requested === null || !isRouteEvidenceSlug(requested)) {
    return <RouteEvidenceUnavailableState detail="Provide one valid model slug in the model query. Multiple or invalid identifiers are not normalized into another profile." heading="Model evidence unavailable" />;
  }
  const snapshot = await loadModelSurfaceProfile(requested);
  if (snapshot.envelope === null || snapshot.mode === "unconfigured") {
    return <RouteEvidenceUnavailableState detail={snapshot.error ?? "The requested model evidence could not be loaded."} heading="Model evidence is not configured" />;
  }
  const projection = projectSurfaceProfile(snapshot.envelope);
  if (projection.data === null) {
    return <RouteEvidenceUnavailableState detail="No accepted profile evidence was returned for this exact slug. It was not replaced with a catalog model." heading="Model evidence unavailable" />;
  }
  return <ModelProfilePage mode={projection.mode} model={projection.data} sources={projection.provenance} status={projection.status} />;
}
