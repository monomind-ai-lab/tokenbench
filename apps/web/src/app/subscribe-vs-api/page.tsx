import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SubscriptionSimulatorPage } from "@/components/subscription-simulator-page";
import { parseSubscriptionScenario, serializeSubscriptionScenario } from "@/lib/subscription-simulator";

export const metadata: Metadata = {
  title: "Subscription vs API Cost Simulator",
  description: "Build a shareable provider-plan, multi-model, message-workload and token-volume scenario with exact breakeven and price-source tables.",
  alternates: { canonical: "/subscribe-vs-api/" },
};

export default async function SubscribeVsApiPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  Object.entries(raw).forEach(([key, value]) => {
    const accepted = Array.isArray(value) ? value[0] : value;
    if (accepted !== undefined) params.set(key, accepted);
  });
  const scenario = parseSubscriptionScenario(params);
  const canonical = serializeSubscriptionScenario(scenario);
  if (params.toString() !== canonical) redirect(`/subscribe-vs-api/?${canonical}`);
  return <SubscriptionSimulatorPage key={scenario.plan} scenario={scenario} />;
}
