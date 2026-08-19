import type { Metadata } from "next";

import { LeaderboardsDirectoryPage } from "@/components/leaderboards-directory-page";

export const metadata: Metadata = {
  title: "AI Model Leaderboards",
  description: "Choose among source-aware AI capability, preference, value, pricing, context, multimodal, image, and video leaderboard lenses.",
  alternates: { canonical: "/leaderboards/" },
};

export default function LeaderboardsRoute() {
  return <LeaderboardsDirectoryPage />;
}
