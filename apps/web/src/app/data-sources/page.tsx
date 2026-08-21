import type { Metadata } from "next";

import { DataSourcesPage } from "@/components/data-sources-page";

export const metadata: Metadata = {
  title: "Data sources and methodology",
  description: "Review the benchmark, catalog, pricing, and subscription sources behind TokenBench and the publication rules applied to each.",
};

export default function Page() {
  return <DataSourcesPage />;
}
