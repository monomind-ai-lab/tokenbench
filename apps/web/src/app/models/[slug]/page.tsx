import type { Metadata } from "next";

import { RouteEvidenceModelProfilePage } from "@/components/route-evidence-model-profile-page";
import { RouteEvidenceUnavailableState } from "@/components/route-evidence-ui";
import { loadRouteEvidenceProfile } from "@/lib/route-evidence-loader.server";
import { isRouteEvidenceSlug } from "@tokenbench/frontend/route-evidence-projectors";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Model Evidence",
  description: "Inspect the requested model's published capability, runtime, lifecycle, and route-pricing evidence without substituting unavailable facts.",
};

export default async function RouteEvidenceModelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isRouteEvidenceSlug(slug)) {
    return (
      <RouteEvidenceUnavailableState
        detail="This path does not contain a valid model slug. No model has been selected as a replacement."
        heading="Model evidence unavailable"
      />
    );
  }

  const snapshot = await loadRouteEvidenceProfile(slug);
  if (snapshot.envelope === null || snapshot.mode === "unconfigured") {
    return (
      <RouteEvidenceUnavailableState
        detail={snapshot.error ?? "No evidence record could be loaded for this requested model."}
        heading="Model evidence is not configured"
      />
    );
  }

  return <RouteEvidenceModelProfilePage dataMode={snapshot.mode} envelope={snapshot.envelope} slug={slug} />;
}
