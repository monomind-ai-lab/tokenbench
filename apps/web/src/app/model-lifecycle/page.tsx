import type { Metadata } from "next";

import { ModelLifecyclePage } from "@/components/model-lifecycle-page";
import { RouteEvidenceUnavailableState } from "@/components/route-evidence-ui";
import { loadModelSurfaceLifecycle } from "@/lib/model-surface-data.server";
import { projectSurfaceLifecycle } from "@tokenbench/frontend/model-surface-projectors";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "AI Model Lifecycle Radar", description: "Track model retirement alerts, documented successors, migration horizons, and unavailable lifecycle evidence.", alternates: { canonical: "/model-lifecycle/" } };

export default async function ModelLifecycleRoute() {
  const snapshot = await loadModelSurfaceLifecycle();
  if (snapshot.envelope === null || snapshot.mode === "unconfigured" || snapshot.envelope.status === "unavailable" || snapshot.envelope.data === null) {
    return <RouteEvidenceUnavailableState detail={snapshot.error ?? snapshot.envelope?.reason ?? "Lifecycle evidence could not be loaded for this environment."} heading="Lifecycle evidence is not configured" />;
  }
  const projection = projectSurfaceLifecycle(snapshot.envelope, snapshot.query.asOf);
  return <ModelLifecyclePage asOf={snapshot.query.asOf} mode={projection.mode} rows={projection.data ?? []} sources={projection.provenance} status={projection.status} />;
}
