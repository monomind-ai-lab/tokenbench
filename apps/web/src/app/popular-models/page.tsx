import type { Metadata } from "next";

import { PopularModelsPage } from "@/components/popular-models-page";
import { loadLeaderboardRankings } from "@/lib/ui-data.server";
import { projectPopularModelsV1 } from "@tokenbench/frontend/popular-models-v1";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Popular Models Benchmark Workbench",
  description:
    "Explore published benchmark capability categories, evaluation cost, and selected-route pricing without deriving unavailable values.",
  alternates: { canonical: "/popular-models/" },
};

type PopularModelsRouteProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PopularModelsRoute({
  searchParams,
}: PopularModelsRouteProps) {
  const [snapshot, parameters] = await Promise.all([
    loadLeaderboardRankings(),
    searchParams,
  ]);
  return (
    <PopularModelsPage
      dataMode={snapshot.mode}
      initialParameters={parameters}
      viewModel={projectPopularModelsV1(snapshot.envelope, snapshot.error)}
    />
  );
}
