import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SubscriptionSimulatorPage } from "@/components/subscription-simulator-page";
import {
  loadSubscriptionSimulatorCalculation,
  loadSubscriptionSimulatorCatalog,
} from "@/lib/subscription-simulator-data.server";
import {
  buildSubscriptionCalculationRequest,
  mergeSubscriptionCalculation,
  reconcileSubscriptionScenario,
} from "@/lib/subscription-simulator-projector";
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
  const requestedScenario = parseSubscriptionScenario(params);
  const catalog = await loadSubscriptionSimulatorCatalog();
  const scenario = reconcileSubscriptionScenario(requestedScenario, catalog);
  const canonical = serializeSubscriptionScenario(scenario);
  if (params.toString() !== canonical) redirect(`/subscribe-vs-api/?${canonical}`);
  const calculationRequest = buildSubscriptionCalculationRequest(scenario, catalog);
  const calculatedCatalog = calculationRequest.request === null
    ? { ...catalog, calculationReason: calculationRequest.reason }
    : mergeSubscriptionCalculation(catalog, await loadSubscriptionSimulatorCalculation(calculationRequest.request));
  return <SubscriptionSimulatorPage key={`${scenario.provider}-${scenario.plan}`} catalog={calculatedCatalog} scenario={scenario} />;
}
