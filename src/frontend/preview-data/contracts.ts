export interface Provenance {
  readonly id: string;
  /** A UI-visible attribution label. */
  readonly label: string;
  readonly kind: 'illustrative_prototype' | 'approved_manual' | 'accepted_pipeline';
  /** The source fact time, which remains null when the accepted producer made it unknown. */
  readonly effectiveAt: string | null;
  /** Canonical source location when the published receipt exposes one. */
  readonly url?: string;
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

/** Exact receipt for one published provider route. */
export interface RouteReceipt {
  readonly sourceId: string;
  readonly providerId: string;
  readonly routeId: string;
  readonly sourceModelId: string;
  readonly sourceArtifactId: string;
  readonly sourceUrl: string;
  readonly observedAt: string;
  readonly verificationStatus: 'primary' | 'corroborating' | 'conflict';
}

export interface RoutePricing {
  readonly route: string;
  readonly inputUsdPerMillion: number;
  readonly outputUsdPerMillion: number;
  readonly contextWindowTokens: EvidenceValue<number>;
  /** Independent maximum input receipt; it must not be assumed to equal context. */
  readonly maxInputTokens?: EvidenceValue<number>;
  readonly maxOutputTokens: EvidenceValue<number>;
  readonly inputModalities: readonly string[];
  readonly outputModalities: readonly string[];
  /** Model-level route parameters supplied by the exact route receipt. */
  readonly supportedParameters?: EvidenceValue<readonly string[]>;
  readonly receipt?: RouteReceipt;
  /** Optional only because the directory fixture does not claim a blended route price. */
  readonly blendedUsdPerMillion?: EvidenceValue<number>;
  /** Optional because many providers do not publish a distinct long-context input tier. */
  readonly longContextInputUsdPerMillion?: EvidenceValue<number>;
  readonly cache: EvidenceValue<CachePricing>;
}

/**
 * Complete exact-route receipt. Unlike the selected convenience route, this
 * shape keeps routes with partial pricing so one missing meter cannot erase
 * independently published limits or compatibility facts.
 */
export interface RouteFact {
  readonly receipt: RouteReceipt;
  readonly inputUsdPerMillion: EvidenceValue<number>;
  readonly outputUsdPerMillion: EvidenceValue<number>;
  readonly cacheReadUsdPerMillion: EvidenceValue<number>;
  readonly cacheWriteUsdPerMillion: EvidenceValue<number>;
  readonly contextWindowTokens: EvidenceValue<number>;
  readonly maxInputTokens: EvidenceValue<number>;
  readonly maxOutputTokens: EvidenceValue<number>;
  readonly inputModalities: EvidenceValue<readonly string[]>;
  readonly outputModalities: EvidenceValue<readonly string[]>;
  readonly supportedParameters: EvidenceValue<readonly string[]>;
}

export interface ModelSourceCoverage {
  readonly benchmarkCount: number;
  readonly categoryCount: number;
  readonly rankedCategoryCount: number;
  readonly sourceCount: number;
}

export interface ModelBenchmarkCategoryFact {
  readonly key: string;
  readonly metricKey: string;
  readonly label: string;
  readonly score: number;
  readonly rawScore: number | null;
  readonly rank: number | null;
  readonly fieldSize: number | null;
  readonly percentile: number | null;
  readonly evidenceStatus: string;
  readonly benchmarkCount: number;
  readonly rankingEligible: boolean;
  readonly unit: string;
  readonly sourceId: string;
}

export interface ModelBenchmarkLedgerFact {
  readonly metricKey: string;
  readonly category: string;
  readonly benchmarkName: string;
  readonly displayValue: number;
  readonly rawValue: number | null;
  readonly unit: string;
  readonly rank: number | null;
  readonly bestVerifiedComparison: number | null;
  readonly gap: number | null;
  readonly weight: number | null;
  readonly evidenceStatus: string;
  readonly observedAt: string;
  readonly sourceId: string;
  readonly sourceArtifactId: string;
  readonly sourceUrl: string;
}

export interface ModelBenchmarkFacts {
  readonly overallRank: number | null;
  readonly evidenceStatus: string;
  readonly publishedAt: string | null;
  readonly checkedAt: string;
  readonly categories: readonly ModelBenchmarkCategoryFact[];
  readonly ledger: readonly ModelBenchmarkLedgerFact[];
}

/**
 * Profile metadata from a source-published snapshot. Every independently
 * nullable field remains evidence rather than becoming a synthetic default.
 */
export interface ModelSpecifications {
  readonly reasoningType: EvidenceValue<string>;
  readonly familyId: EvidenceValue<string>;
  readonly variantId: EvidenceValue<string>;
  readonly releaseDate: EvidenceValue<string>;
  readonly createdAt: EvidenceValue<string>;
  readonly expirationDate: EvidenceValue<string>;
  readonly knowledgeCutoff: EvidenceValue<string>;
  readonly tokenizer: EvidenceValue<string>;
  readonly instructionFormat: EvidenceValue<string>;
  readonly isModerated: EvidenceValue<boolean>;
  readonly perRequestLimits: EvidenceValue<Readonly<Record<string, unknown>>>;
  readonly contextWindowTokens: EvidenceValue<number>;
  readonly maxInputTokens: EvidenceValue<number>;
  readonly maxOutputTokens: EvidenceValue<number>;
  readonly inputModalities: EvidenceValue<readonly string[]>;
  readonly outputModalities: EvidenceValue<readonly string[]>;
  readonly supportedParameters: EvidenceValue<readonly string[]>;
  readonly selfHostingAvailable: EvidenceValue<boolean>;
}

export interface ModelDataFreshness {
  readonly status: 'fresh' | 'stale';
  readonly checkedAt: string;
  readonly message: string | null;
}

export interface ModelProfileFacts {
  readonly freshness: ModelDataFreshness;
  readonly sourceCoverage: ModelSourceCoverage;
  readonly benchmark: ModelBenchmarkFacts;
  readonly specifications: ModelSpecifications;
  readonly routes: readonly RouteFact[];
  readonly sources: readonly Provenance[];
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
  /** Full source-published profile facts when this surface loaded a profile. */
  readonly profileFacts?: EvidenceValue<ModelProfileFacts>;
  /** All exact provider routes when the source publishes more than the selected route. */
  readonly routeOptions?: EvidenceValue<readonly RoutePricing[]>;
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
  /** Present only for a source-published leaderboard row. */
  readonly sourceRank?: number;
  /** Present only for a source-published leaderboard row. */
  readonly aggregate?: RankingAggregateEconomics;
  /** Present only for a source-published leaderboard row; preserves every published task fact. */
  readonly taskEconomics?: readonly RankingTaskEconomics[];
}

/** Source receipt for a published leaderboard release. */
export interface RankingReleaseReceipt {
  readonly releaseId: string;
  readonly releaseOn: string;
  readonly licenseId: string;
  readonly provenance: readonly Provenance[];
}

/** A source-published taxonomy task, retained so the workbench need not infer categories from model rows. */
export interface RankingTaxonomyTask {
  readonly taskId: string;
  readonly label: string;
}

/** A source-published taxonomy category and its ordered tasks. */
export interface RankingTaxonomyCategory {
  readonly categoryId: string;
  readonly label: string;
  readonly tasks: readonly RankingTaxonomyTask[];
}

/** Row-level aggregate facts published with a leaderboard result. */
export interface RankingAggregateEconomics {
  readonly costPerSuccessfulEvaluationUsd: EvidenceValue<number>;
  readonly meanOutputTokens: EvidenceValue<number>;
  readonly pareto: boolean;
}

/** Full source-published task economics; unavailable measurements remain evidence values rather than defaults. */
export interface RankingTaskEconomics {
  readonly taskId: string;
  readonly label: string;
  readonly categoryId: string;
  readonly score: EvidenceValue<number>;
  readonly questionCount: EvidenceValue<number>;
  readonly evaluationCostUsd: EvidenceValue<number>;
  readonly inputPriceUsdPerMillion: EvidenceValue<number>;
  readonly outputPriceUsdPerMillion: EvidenceValue<number>;
  readonly equivalentSuccesses: EvidenceValue<number>;
  readonly costPerSuccessfulEvaluationUsd: EvidenceValue<number>;
  readonly meanInputTokens: EvidenceValue<number>;
  readonly meanOutputTokens: EvidenceValue<number>;
}

export interface RankingData {
  readonly models: readonly RankingEntry[];
  /** Present only for the strict v1 leaderboard operation. */
  readonly release?: RankingReleaseReceipt;
  /** Present only for the strict v1 leaderboard operation. */
  readonly taxonomy?: readonly RankingTaxonomyCategory[];
  /** Present only for the strict v1 leaderboard operation. */
  readonly total?: number;
  /** Present only for the strict v1 leaderboard operation; null is an explicit end-of-page receipt. */
  readonly nextCursor?: string | null;
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

/** Page-facing normalized input that produced a validated subscription calculation. */
export interface SubscriptionCalculationRequest {
  readonly planId: string;
  readonly seats: number;
  readonly modelMix: readonly {
    readonly modelSlug: string;
    readonly pricingTierId: string | null;
    readonly routeId: string;
    readonly shareBasisPoints: number;
    readonly tierContextTokens: number;
  }[];
  readonly workload: NonNullable<SubscriptionQuery['workload']>;
  readonly cacheReadShareBasisPoints: number;
  readonly cacheWriteShareBasisPoints: number;
  readonly crossoverTokenVolume: number;
}

export interface SubscriptionCalculation {
  readonly request: SubscriptionCalculationRequest;
  readonly monthlySubscriptionUsd: number;
  readonly selectedVolumeApiUsd: number;
  readonly crossoverTokens: number | null;
  readonly domain: readonly {
    readonly tokens: number;
    readonly apiUsd: number;
    readonly monthlySubscriptionUsd: number;
  }[];
  readonly lineItems: readonly {
    readonly id: string;
    readonly tokens: number;
    readonly rateUsdPerMillion: number;
    readonly costUsd: number;
  }[];
}

export interface SubscriptionData {
  readonly plans: readonly SubscriptionPlan[];
  /** Route-pricing evidence available to the subscription comparison surface. */
  readonly models: readonly PreviewModel[];
  readonly selectedModelTaskEconomics: EvidenceValue<TaskEconomics>;
  /** Explicitly unavailable for catalog responses, available only for validated calculate responses. */
  readonly calculation: EvidenceValue<SubscriptionCalculation>;
}

export interface PreviewDataAdapter {
  models(query: ModelDirectoryQuery): Promise<UiDataContractV1<ModelDirectoryData>>;
  profile(slug: string): Promise<UiDataContractV1<PreviewModelProfileData>>;
  lifecycle(query: LifecycleQuery): Promise<UiDataContractV1<LifecycleData>>;
  rankings(query: RankingQuery): Promise<UiDataContractV1<RankingData>>;
  comparison(query: CompareQuery): Promise<UiDataContractV1<CompareData>>;
  subscription(query: SubscriptionQuery): Promise<UiDataContractV1<SubscriptionData>>;
}
