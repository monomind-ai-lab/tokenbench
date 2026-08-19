import type { Metadata } from "next";

import { ModelsWorkbenchPage } from "@/components/models-workbench-page";

export const metadata: Metadata = {
  title: "AI Model Workbench",
  description: "Explore 30 leading AI models, inspect the price-performance frontier, and build a two-to-four model comparison set.",
  alternates: { canonical: "/models/" },
};

export default function ModelsPage() {
  return <ModelsWorkbenchPage />;
}
