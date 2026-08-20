import "server-only";

import { parsePricePerformanceEnvelope, type PricePerformanceEnvelope } from "@tokenbench/benchmarks/price-performance-contracts";

export type LlmPricePerformanceDataMode =
  | "production"
  | "preview"
  | "unconfigured";

export interface LlmPricePerformanceSnapshot {
  readonly envelope: PricePerformanceEnvelope | null;
  readonly error: string | null;
  readonly mode: LlmPricePerformanceDataMode;
}

function baseUrlFor(mode: LlmPricePerformanceDataMode): string | null {
  const value =
    mode === "preview"
      ? process.env.TOKENBENCH_PRICE_PERFORMANCE_PREVIEW_BASE_URL
      : process.env.TOKENBENCH_PRICE_PERFORMANCE_BASE_URL;
  if (!value?.trim()) return null;

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function endpointFor(baseUrl: string): string {
  return new URL("/api/benchmarks/price-performance", baseUrl).toString();
}

/**
 * The projection remains an explicit HTTP boundary. Preview mode is opt-in and
 * can never become a production fallback or a silent local fixture.
 */
export async function loadLlmPricePerformance(): Promise<LlmPricePerformanceSnapshot> {
  const requestedMode = process.env.TOKENBENCH_PRICE_PERFORMANCE_MODE;
  if (requestedMode !== undefined && requestedMode !== "preview" && requestedMode !== "production") {
    return {
      envelope: null,
      error: "TOKENBENCH_PRICE_PERFORMANCE_MODE must be production or preview.",
      mode: "unconfigured",
    };
  }

  const mode: LlmPricePerformanceDataMode =
    requestedMode === "preview" ? "preview" : "production";
  if (mode === "preview" && process.env.NODE_ENV === "production") {
    return {
      envelope: null,
      error: "Preview evidence is disabled in production builds.",
      mode: "unconfigured",
    };
  }

  const baseUrl = baseUrlFor(mode);
  if (!baseUrl) {
    return {
      envelope: null,
      error:
        mode === "preview"
          ? "Preview evidence is not configured for this environment."
          : "The validated price-performance projection endpoint is not configured for this environment.",
      mode: "unconfigured",
    };
  }

  try {
    const response = await fetch(endpointFor(baseUrl), {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return {
        envelope: null,
        error: `The price-performance projection request failed (${response.status}).`,
        mode,
      };
    }
    const envelope = parsePricePerformanceEnvelope(await response.json());
    if (!envelope) {
      return {
        envelope: null,
        error: "The price-performance projection response was incomplete.",
        mode,
      };
    }
    return { envelope, error: null, mode };
  } catch {
    return {
      envelope: null,
      error: "The validated price-performance projection could not be reached.",
      mode,
    };
  }
}
