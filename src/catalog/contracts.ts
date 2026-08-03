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

export interface PlanOffer {
  id: string;
  providerId: string;
  displayName: string;
  monthlyCostMicroDollars: number;
  currency: Currency;
  pricingBasis: 'subscription';
  route: 'subscription';
  entitlement: PlanEntitlement;
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
  sourceId: string;
}

export interface SourceProvenance {
  id: string;
  providerId: string;
  sourceUrl: string;
  observedAt: string;
  sourceKind: 'official_json' | 'manual_manifest';
  confidence: 'official' | 'manual_verified';
  snapshotKey?: string;
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
}
