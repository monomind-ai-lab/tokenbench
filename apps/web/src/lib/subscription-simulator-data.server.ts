import "server-only";

import { parseUiDataContractV1 } from "@tokenbench/frontend/preview-data/contract-v1";
import { createEvidenceTransport } from "@tokenbench/frontend/preview-data/evidence-transport";
import { createHttpTransport } from "@tokenbench/frontend/preview-data/http-transport";

import {
  projectSubscriptionCatalog,
  subscriptionRequestMatches,
  type StrictSubscriptionCalculationQuery,
  type StrictSubscriptionEnvelope,
  type SubscriptionSimulatorCatalog,
} from "@/lib/subscription-simulator-projector";
import { loadPublishedCatalog } from "@/lib/published-compatibility.server";
import {
  calculatePublishedSubscription,
  projectPublishedSubscriptionCatalog,
} from "@/lib/published-subscription.server";

function productionBaseUrl(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new TypeError("TOKENBENCH_UI_DATA_BASE_URL is not configured.");
  }
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError("TOKENBENCH_UI_DATA_BASE_URL must use HTTP or HTTPS.");
  }
  return url.toString();
}

function safeError(error: unknown, subject: "catalog" | "calculation"): string {
  if (error instanceof Error && error.message.includes("TOKENBENCH_UI_DATA_BASE_URL")) {
    return "Published subscription data is not configured for this environment.";
  }
  return subject === "catalog"
    ? "The reviewed subscription catalog could not be loaded."
    : "The reviewed subscription calculation could not be loaded.";
}

function parseStrictSubscriptionEnvelope(candidate: unknown): StrictSubscriptionEnvelope {
  // This is the import-safe strict v1 schema boundary used by the public data
  // adapter. The projector then reads only schema-declared fields and turns a
  // malformed or incomplete record into an explicit unavailable state.
  return parseUiDataContractV1(candidate, "subscription");
}

async function loadEnvelope(
  mode: "production" | "evidence",
  query: { readonly operation: "catalog" } | StrictSubscriptionCalculationQuery,
): Promise<StrictSubscriptionEnvelope> {
  const transport = mode === "production"
    ? createHttpTransport(fetch, productionBaseUrl(process.env.TOKENBENCH_UI_DATA_BASE_URL))
    : createEvidenceTransport();
  const candidate = await transport.request("subscription", query);
  const envelope = parseStrictSubscriptionEnvelope(candidate);
  if (!subscriptionRequestMatches(envelope, query)) {
    throw new TypeError("The subscription response does not echo the exact requested operation.");
  }
  return envelope;
}

/**
 * Strict-v1 catalog boundary for the simulator.
 *
 * The catalog is always fetched before a calculate request so URL state can be
 * reconciled against emitted exact plan-to-model-to-route bindings.
 */
export async function loadSubscriptionSimulatorCatalog(): Promise<SubscriptionSimulatorCatalog> {
  const configuredMode = process.env.TOKENBENCH_UI_DATA_MODE;

  if (configuredMode === "evidence") {
    if (process.env.NODE_ENV === "production") {
      return projectSubscriptionCatalog(
        null,
        "unconfigured",
        "Preview-only subscription evidence is disabled in production builds.",
      );
    }
    try {
      return projectSubscriptionCatalog(await loadEnvelope("evidence", { operation: "catalog" }), "evidence");
    } catch (error) {
      return projectSubscriptionCatalog(null, "evidence", safeError(error, "catalog"));
    }
  }

  if (configuredMode !== "http" && process.env.NODE_ENV !== "production") {
    return projectSubscriptionCatalog(
      null,
      "unconfigured",
      "Choose TOKENBENCH_UI_DATA_MODE=http or evidence before loading subscription data.",
    );
  }

  try {
    return projectPublishedSubscriptionCatalog(await loadPublishedCatalog());
  } catch (error) {
    return projectSubscriptionCatalog(null, "production", safeError(error, "catalog"));
  }
}

export async function loadSubscriptionSimulatorCalculation(
  query: StrictSubscriptionCalculationQuery,
): Promise<SubscriptionSimulatorCatalog> {
  const configuredMode = process.env.TOKENBENCH_UI_DATA_MODE;
  if (configuredMode === "evidence") {
    if (process.env.NODE_ENV === "production") {
      return projectSubscriptionCatalog(null, "unconfigured", "Preview-only subscription evidence is disabled in production builds.");
    }
    try {
      return projectSubscriptionCatalog(await loadEnvelope("evidence", query), "evidence");
    } catch (error) {
      return projectSubscriptionCatalog(null, "evidence", safeError(error, "calculation"));
    }
  }
  if (configuredMode !== "http" && process.env.NODE_ENV !== "production") {
    return projectSubscriptionCatalog(null, "unconfigured", "Choose TOKENBENCH_UI_DATA_MODE=http or evidence before calculating subscription data.");
  }
  try {
    return calculatePublishedSubscription(await loadPublishedCatalog(), query);
  } catch (error) {
    return projectSubscriptionCatalog(null, "production", safeError(error, "calculation"));
  }
}
