export type PricingBasis = 'subscription' | 'direct_provider_api' | 'openrouter' | 'opencode_zen';
export type PriceRoute = 'subscription' | 'direct_provider' | 'openrouter' | 'opencode_zen';
export type Currency = 'USD';
export type PriceUnit = 'micro_dollars_per_million_tokens';

export type PlanEntitlement =
  | { kind: 'fixed_tokens'; monthlyTokens: number }
  | { kind: 'rolling_limit'; description: string }
  | { kind: 'credits'; description: string; creditsMicroDollars?: number }
  | { kind: 'guardrail_limited'; description: string }
  | { kind: 'unknown'; description: string };

/**
 * Separates what a plan actually entitles from the copy used to present it.
 *
 * - `verified` may drive a coverage determination when the unit is comparable
 *   with the user's workload.
 * - `projected` yields a scenario only: it must never produce guaranteed
 *   savings or a verified-capacity badge.
 * - `dynamic_unknown` explains the provider policy without inventing a number.
 * - `stale` blocks a recommendation until the row is refreshed.
 */
export type EntitlementEvidenceStatus = 'verified' | 'projected' | 'dynamic_unknown' | 'stale';
export type EntitlementBoundType = 'hard_max' | 'practical_upper' | 'outer_ceiling' | 'unknown';
export type EntitlementMetric = 'messages' | 'model_calls' | 'credits' | 'tasks' | 'feature_uses';
export type EntitlementWindow = 'rolling_5h' | 'weekly' | 'monthly' | 'billing_cycle';

export interface EntitlementDimension {
  metric: EntitlementMetric;
  min?: number;
  max?: number;
  unit: string;
  window: EntitlementWindow;
  resetRule?: string;
  modelId?: string;
  feature?: string;
  sharedPoolId?: string;
}

export interface EntitlementProjection {
  /** Human-readable derivation, e.g. `5 x F x 144`. Never presented as a guarantee. */
  formula: string;
  assumptions: string[];
  caveats: string[];
}

export interface EntitlementEvidenceSource {
  url: string;
  accessedAt: string;
  publishedOrModifiedAt?: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface EntitlementEvidence {
  status: EntitlementEvidenceStatus;
  boundType: EntitlementBoundType;
  dimensions: EntitlementDimension[];
  projection?: EntitlementProjection;
  /** Required when status is `stale`: why the row cannot back a recommendation. */
  staleReason?: string;
  source: EntitlementEvidenceSource;
}

export interface PlanOffer {
  id: string;
  providerId: string;
  displayName: string;
  monthlyCostMicroDollars: number;
  currency: Currency;
  pricingBasis: 'subscription';
  route: 'subscription';
  entitlement: PlanEntitlement;
  /** Evidence backing `entitlement`; kept separate from presentation copy. */
  entitlementEvidence: EntitlementEvidence;
  /** Omitted only when the provider has not published these facts. */
  billingCycle?: 'monthly' | 'annual' | 'other';
  supportedModelIds?: string[];
  sourceId: string;
}

export interface ModelOffer {
  id: string;
  providerId: string;
  displayName: string;
  modelId: string;
  pricingBasis: Exclude<PricingBasis, 'subscription'>;
  route: Exclude<PriceRoute, 'subscription'>;
  currency: Currency;
  unit: PriceUnit;
  inputMicroDollarsPerMillion: number;
  cachedInputMicroDollarsPerMillion?: number;
  outputMicroDollarsPerMillion: number;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  availability?: 'available' | 'limited' | 'deprecated';
  sourceId: string;
}

export interface SourceProvenance {
  id: string;
  providerId: string;
  sourceUrl: string;
  observedAt: string;
  sourceKind: 'official_json' | 'official_html' | 'manual_manifest';
  confidence: 'official' | 'manual_verified';
  snapshotKey?: string;
  contentHash?: string;
  parserVersion?: string;
  evidenceLocator?: string;
  reviewStatus?: 'verified' | 'needs_review' | 'rejected';
}

export interface CatalogFreshness {
  status: 'fresh' | 'stale' | 'bootstrap';
  checkedAt: string;
  message?: string;
}

export interface CatalogResponse {
  revision: string;
  publishedAt: string;
  freshness: CatalogFreshness;
  plans: PlanOffer[];
  modelOffers: ModelOffer[];
  provenance: SourceProvenance[];
}

export interface ModelMixEntry {
  model: ModelOffer;
  shareBasisPoints: number;
}

export interface RecommendationCandidate {
  id: string;
  monthlyCostMicroDollars: number;
  entitlement: PlanEntitlement;
  entitlementEvidence: EntitlementEvidence;
  supportedModelIds?: string[];
}
