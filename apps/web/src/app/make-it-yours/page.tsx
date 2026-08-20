import type { Metadata } from "next";

import { MakeItYoursWorkbench } from "@/components/make-it-yours-workbench";
import { loadMakeItYoursRanking } from "@/lib/make-it-yours-ranking.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Make it yours · custom model ranking",
  description:
    "Re-rank complete published leaderboard candidate facts with an explicit six-axis matrix and service-level constraints, without filling missing measurements.",
  alternates: { canonical: "/make-it-yours/" },
};

type MakeItYoursRouteProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MakeItYoursRoute({
  searchParams,
}: MakeItYoursRouteProps) {
  const [snapshot, initialSearchParams] = await Promise.all([
    loadMakeItYoursRanking(),
    searchParams,
  ]);

  return (
    <>
      {snapshot.mode === "production" ? (
        <aside
          className="border-b border-border bg-muted/35"
          role="status"
        >
          <div className="mx-auto max-w-7xl px-5 py-3 text-sm leading-6 text-muted-foreground sm:px-8 lg:px-10">
            <span className="font-medium text-foreground">Published-candidate re-ranking.</span>{" "}
            The published leaderboard response is re-ranked client-side with the current six-axis weights and filters; incomplete candidates remain unavailable.
          </div>
        </aside>
      ) : null}
      <MakeItYoursWorkbench
        dataMode={snapshot.mode}
        envelope={snapshot.envelope}
        initialSearchParams={initialSearchParams}
        loaderError={snapshot.error}
      />
    </>
  );
}
