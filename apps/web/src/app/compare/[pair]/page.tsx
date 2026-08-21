import type { Metadata } from "next";

import { RouteEvidencePairPage } from "@/components/route-evidence-pair-page";
import { RouteEvidenceUnavailableState } from "@/components/route-evidence-ui";
import { loadRouteEvidenceComparison } from "@/lib/route-evidence-loader.server";
import {
  parseRouteEvidencePair,
  routeEvidenceQueryState,
} from "@tokenbench/frontend/route-evidence-projectors";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pair Evidence",
  description: "Compare the exact ordered pair of requested models while retaining unavailable capability, runtime, lifecycle, and route-pricing facts.",
};

export default async function RouteEvidencePairRoute({
  params,
  searchParams,
}: {
  params: Promise<{ pair: string }>;
  searchParams: Promise<{ models?: string | string[] }>;
}) {
  const [{ pair: pairSlug }, query] = await Promise.all([params, searchParams]);
  const pair = parseRouteEvidencePair(pairSlug);
  if (pair === null) {
    return (
      <RouteEvidenceUnavailableState
        detail="A comparison route must use two distinct, valid slugs in left-vs-right order. Neither side was inferred from the request."
        heading="Pair evidence unavailable"
      />
    );
  }

  const snapshot = await loadRouteEvidenceComparison([pair.left, pair.right]);
  if (snapshot.envelope === null || snapshot.mode === "unconfigured" || snapshot.envelope.status === "unavailable" || snapshot.envelope.data === null) {
    return (
      <RouteEvidenceUnavailableState
        detail={snapshot.error ?? snapshot.envelope?.reason ?? "No evidence response could be loaded for this requested ordered pair."}
        heading="Pair evidence is not configured"
      />
    );
  }

  return (
    <RouteEvidencePairPage
      dataMode={snapshot.mode}
      envelope={snapshot.envelope}
      pair={pair}
      queryState={routeEvidenceQueryState(query.models, pair)}
    />
  );
}
