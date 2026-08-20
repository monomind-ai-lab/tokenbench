import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LeaderboardDetailPage } from "@/components/leaderboard-detail-page";
import { loadLeaderboardRouteLiveSnapshot } from "@/lib/leaderboard-route-live.server";
import { loadLeaderboardRankings } from "@/lib/ui-data.server";
import {
  leaderboardDetailDefinition,
  leaderboardKeyFromSegments,
  parseLeaderboardFilters,
} from "@tokenbench/frontend/leaderboard-detail";
import { LEADERBOARD_ROUTES } from "@tokenbench/routing/leaderboard-routes";

export const dynamic = "force-dynamic";

type LeaderboardPageProps = {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: LeaderboardPageProps): Promise<Metadata> {
  const key = leaderboardKeyFromSegments((await params).segments);
  if (key === null) return {};
  const route = LEADERBOARD_ROUTES[key];
  return {
    title: { absolute: route.seo.title },
    description: route.seo.description,
    alternates: { canonical: route.pathname },
  };
}

export default async function LeaderboardChildRoute({ params, searchParams }: LeaderboardPageProps) {
  const key = leaderboardKeyFromSegments((await params).segments);
  if (key === null) notFound();
  const definition = leaderboardDetailDefinition(key);
  const parameters = await searchParams;
  const initialFilters = parseLeaderboardFilters(definition, parameters);
  // Retained evidence remains the exact accepted strict-v1 preview path. Every
  // other deployed path resolves the published endpoint for this route key.
  const snapshot = process.env.TOKENBENCH_UI_DATA_MODE === "evidence"
    ? await loadLeaderboardRankings()
    : await loadLeaderboardRouteLiveSnapshot(key, initialFilters.profile);
  return (
    <LeaderboardDetailPage
      initialFilters={initialFilters}
      routeKey={key}
      snapshot={snapshot}
    />
  );
}
