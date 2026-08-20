import type { Metadata } from "next";

import { MakeItYoursWorkbench } from "@/components/make-it-yours-workbench";
import { loadMakeItYoursRanking } from "@/lib/make-it-yours-ranking.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Make it yours · custom model ranking",
  description:
    "Adjust an explicit six-axis custom ranking, retain service-level constraints, and inspect the resulting evidence without filling missing measurements.",
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
    <MakeItYoursWorkbench
      dataMode={snapshot.mode}
      envelope={snapshot.envelope}
      initialSearchParams={initialSearchParams}
      loaderError={snapshot.error}
    />
  );
}
