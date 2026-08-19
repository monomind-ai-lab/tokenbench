import type { Metadata } from "next";

import { ModelLifecyclePage } from "@/components/model-lifecycle-page";

export const metadata: Metadata = { title: "AI Model Lifecycle Radar", description: "Track model retirement alerts, published successors, migration horizons, and recent AI model releases.", alternates: { canonical: "/model-lifecycle/" } };

export default function ModelLifecycleRoute() { return <ModelLifecyclePage />; }
