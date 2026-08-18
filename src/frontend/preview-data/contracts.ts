export interface Provenance {
  readonly id: string;
  /** A UI-visible attribution label. */
  readonly label: string;
  readonly kind: 'illustrative_prototype' | 'approved_manual' | 'accepted_pipeline';
  /** The source fact time, which remains null when the accepted producer made it unknown. */
  readonly effectiveAt: string | null;
  readonly note: string;
}

export type EvidenceValue<T> =
  | { readonly availability: 'available'; readonly value: T; readonly provenance: Provenance }
  | { readonly availability: 'unavailable'; readonly reason: string; readonly provenance?: Provenance };

export interface UiDataContractV1<T> {
  readonly contractVersion: 'ui-data-contract/v1';
  readonly status: 'available' | 'partial' | 'unavailable';
  /** Present whenever the entire requested surface is unavailable. */
  readonly reason?: string;
  readonly fetchedAt: string;
  /** A common effective time, or null when the envelope contains mixed sources. */
  readonly effectiveAt: string | null;
  readonly data: T | null;
  readonly provenance: readonly Provenance[];
}

export interface ModelIdentity {
  readonly slug: string;
  readonly name: string;
  readonly provider: string;
}

export type ModelAccess = 'Proprietary' | 'Open weights';

export interface BenchmarkSubtask {
  readonly id: string;
  readonly label: string;
}

export interface BenchmarkRelease {
  readonly releaseOn: string;
  readonly subtasks: readonly BenchmarkSubtask[];
}

/**
 * Illustrative preview-only capability evidence. It deliberately mirrors the
 * radar primitive's observable inputs without claiming a published benchmark
 * model or importing the production profile contract.
 */
export interface CapabilityRadarAxis {
  readonly key: string;
  readonly label: string;
  readonly percentile: number | null;
  readonly rank: number | null;
  readonly fieldSize: number | null;
}

export interface ModelCapability {
  readonly compositeScore: number;
  readonly radar: readonly CapabilityRadarAxis[];
}

export interface CachePricing {
  readonly readUsdPerMillion: EvidenceValue<number>;
  readonly writeUsdPerMillion: EvidenceValue<number>;
}

export interface RoutePricing {
  readonly route: string;
  readonly inputUsdPerMillion: number;
  readonly outputUsdPerMillion: number;
  /** Optional only because the directory fixture does not claim a blended route price. */
  readonly blendedUsdPerMillion?: EvidenceValue<number>;
  /** Optional because many providers do not publish a distinct long-context input tier. */
  readonly longContextInputUsdPerMillion?: EvidenceValue<number>;
  readonly cache: EvidenceValue<CachePricing>;
}

export interface TaskEconomics {
  readonly costUsdPerSuccessfulTask: number;
  readonly workload: string;
}

export interface RuntimeSla {
  readonly ttftP50Seconds: number;
  readonly outputTokensPerSecond: number;
  readonly conditions: string;
}

export interface ModelLifecycle {
  readonly status: 'Current' | 'Retirement scheduled' | 'Retired';
  readonly sunsetOn: EvidenceValue<string>;
}

export interface PreviewModel {
  /** Stable fixture key for query and selection mechanics; identity claims remain evidence values. */
  readonly id: string;
  readonly identity: EvidenceValue<ModelIdentity>;
  readonly access: EvidenceValue<ModelAccess>;
  readonly benchmark: EvidenceValue<BenchmarkRelease>;
  readonly capability: EvidenceValue<ModelCapability>;
  readonly routePricing: EvidenceValue<RoutePricing>;
  readonly taskEconomics: EvidenceValue<TaskEconomics>;
  readonly runtime: EvidenceValue<RuntimeSla>;
  readonly lifecycle: EvidenceValue<ModelLifecycle>;
}

export interface ModelDirectoryQuery {
  readonly search?: string;
  readonly access?: ModelAccess;
  readonly provider?: string;
  readonly cursor?: string | null;
  readonly limit?: number;
  readonly providerIds?: readonly string[];
}

export interface ModelDirectoryData {
  readonly models: readonly PreviewModel[];
}

export interface PreviewModelProfileData {
  readonly model: PreviewModel;
}

export interface LifecycleQuery {
  /** The UTC reference time required by the accepted lifecycle request. */
  readonly asOf: string;
  readonly horizonDays: number;
}

/** UTC reference time retained by the accepted lifecycle response. */
export const ACCEPTED_LIFECYCLE_AS_OF = '2026-08-18T00:00:00.000Z';

export interface LifecycleReplacement {
  readonly modelId: string;
  readonly migrationNote: string;
}

export interface LifecycleModel {
  readonly modelId: string;
  readonly identity: EvidenceValue<ModelIdentity>;
  readonly lifecycle: EvidenceValue<ModelLifecycle>;
  readonly replacement: EvidenceValue<LifecycleReplacement>;
}

export interface LifecycleData {
  readonly models: readonly LifecycleModel[];
}

export interface RankingFilters {
  readonly access?: 'all' | 'open' | 'closed';
  readonly excludeDerivativeFinetunes?: boolean;
  readonly maxInputMicroDollarsPerMillion?: number | null;
  readonly maxOutputMicroDollarsPerMillion?: number | null;
  readonly maxTtftP50Ms?: number | null;
  readonly minContextWindowTokens?: number | null;
  readonly minMaxOutputTokens?: number | null;
  readonly minTpsP50?: number | null;
  readonly openWeights?: 'all' | 'only' | 'exclude';
  readonly organizationIds?: readonly string[];
  readonly providerIds?: readonly string[];
  readonly requiredInputModalities?: readonly string[];
}

export interface RankingQuery {
  readonly limit?: number;
  readonly cursor?: string | null;
  readonly operation?: 'leaderboard' | 'custom';
  readonly releaseId?: string | null;
  readonly dimensionSetRevision?: string;
  readonly filters?: RankingFilters;
  readonly includeIneligible?: boolean;
  /** Submitted weights are transported verbatim; the gateway never rebuilds them from UI state. */
  readonly weights?: Readonly<Record<string, number>>;
}

/** Exact submitted custom-ranking matrix retained by the accepted evidence manifest. */
export const ACCEPTED_CUSTOM_RANKING_QUERY = {
  operation: 'custom',
  dimensionSetRevision: 'ui-data-contract-v1-fixture-dimensions',
  filters: {
    access: 'all',
    excludeDerivativeFinetunes: false,
    maxInputMicroDollarsPerMillion: null,
    maxOutputMicroDollarsPerMillion: null,
    maxTtftP50Ms: null,
    minContextWindowTokens: null,
    minMaxOutputTokens: null,
    minTpsP50: null,
    providerIds: [],
    requiredInputModalities: [],
  },
  includeIneligible: true,
  limit: 50,
  weights: { capability: 20, efficiency: 50, reliability: 30 },
} as const satisfies RankingQuery;

export interface RankingEntry {
  readonly model: PreviewModel;
  readonly rank: EvidenceValue<number>;
}

export interface RankingData {
  readonly models: readonly RankingEntry[];
}

export interface CompareQuery {
  readonly modelIds: readonly string[];
}

export interface CompareData {
  readonly models: readonly PreviewModel[];
  readonly unavailableModelIds: readonly EvidenceValue<string>[];
}

export interface SubscriptionQuery {
  readonly operation?: 'catalog' | 'calculate';
  readonly modelId?: string;
  readonly seats?: number;
  readonly planId?: string;
  readonly cacheReadShareBasisPoints?: number;
  readonly cacheWriteShareBasisPoints?: number;
  readonly crossoverTokenVolume?: number;
  readonly modelMix?: readonly {
    readonly modelSlug: string;
    readonly pricingTierId: string | null;
    readonly routeId: string;
    readonly shareBasisPoints: number;
    readonly tierContextTokens: number;
  }[];
  readonly workload?: {
    readonly activeDaysPerMonth: number;
    readonly conversationsPerDay: number;
    readonly inputTokensPerMessage: number;
    readonly messagesPerConversation: number;
    readonly outputTokensPerMessage: number;
  };
}

/** Exact calculate request retained by the accepted subscription evidence manifest. */
export const ACCEPTED_SUBSCRIPTION_QUERY = {
  operation: 'calculate',
  planId: 'fixture-pro',
  seats: 2,
  modelMix: [
    { modelSlug: 'alpha', pricingTierId: null, routeId: 'alpha-direct', shareBasisPoints: 6000, tierContextTokens: 32000 },
    { modelSlug: 'beta', pricingTierId: null, routeId: 'beta-direct', shareBasisPoints: 4000, tierContextTokens: 32000 },
  ],
  workload: {
    activeDaysPerMonth: 20,
    conversationsPerDay: 10,
    inputTokensPerMessage: 1000,
    messagesPerConversation: 5,
    outputTokensPerMessage: 500,
  },
  cacheReadShareBasisPoints: 2000,
  cacheWriteShareBasisPoints: 1000,
  crossoverTokenVolume: 40000000,
} as const satisfies SubscriptionQuery;

export interface SubscriptionPlan {
  readonly id: string;
  readonly provider: EvidenceValue<string>;
  readonly displayName: EvidenceValue<string>;
  readonly monthlyUsd: EvidenceValue<number>;
  readonly includedUsage: EvidenceValue<string>;
}

export interface SubscriptionData {
  readonly plans: readonly SubscriptionPlan[];
  /** Route-pricing evidence available to the subscription comparison surface. */
  readonly models: readonly PreviewModel[];
  readonly selectedModelTaskEconomics: EvidenceValue<TaskEconomics>;
}

export interface PreviewDataAdapter {
  models(query: ModelDirectoryQuery): Promise<UiDataContractV1<ModelDirectoryData>>;
  profile(slug: string): Promise<UiDataContractV1<PreviewModelProfileData>>;
  lifecycle(query: LifecycleQuery): Promise<UiDataContractV1<LifecycleData>>;
  rankings(query: RankingQuery): Promise<UiDataContractV1<RankingData>>;
  comparison(query: CompareQuery): Promise<UiDataContractV1<CompareData>>;
  subscription(query: SubscriptionQuery): Promise<UiDataContractV1<SubscriptionData>>;
}
