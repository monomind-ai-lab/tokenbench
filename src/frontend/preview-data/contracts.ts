export interface Provenance {
  readonly id: string;
  /** A UI-visible attribution label. Fixture records use `Illustrative prototype data`. */
  readonly label: string;
  readonly kind: 'illustrative_prototype' | 'approved_manual';
  /** The time the source fact applied, not the adapter fetch time. */
  readonly effectiveAt: string;
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

export interface CachePricing {
  readonly readUsdPerMillion: EvidenceValue<number>;
  readonly writeUsdPerMillion: EvidenceValue<number>;
}

export interface RoutePricing {
  readonly route: string;
  readonly inputUsdPerMillion: number;
  readonly outputUsdPerMillion: number;
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
  readonly status: 'Current' | 'Retirement scheduled';
  readonly sunsetOn: EvidenceValue<string>;
}

export interface PreviewModel {
  /** Stable fixture key for query and selection mechanics; identity claims remain evidence values. */
  readonly id: string;
  readonly identity: EvidenceValue<ModelIdentity>;
  readonly access: EvidenceValue<ModelAccess>;
  readonly benchmark: EvidenceValue<BenchmarkRelease>;
  readonly routePricing: EvidenceValue<RoutePricing>;
  readonly taskEconomics: EvidenceValue<TaskEconomics>;
  readonly runtime: EvidenceValue<RuntimeSla>;
  readonly lifecycle: EvidenceValue<ModelLifecycle>;
}

export interface ModelDirectoryQuery {
  readonly search?: string;
  readonly access?: ModelAccess;
  readonly provider?: string;
}

export interface ModelDirectoryData {
  readonly models: readonly PreviewModel[];
}

export interface PreviewModelProfileData {
  readonly model: PreviewModel;
}

export interface LifecycleQuery {
  readonly horizonDays: number;
}

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

export interface RankingQuery {
  readonly limit?: number;
}

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
  readonly modelId?: string;
  readonly seats?: number;
}

export interface SubscriptionPlan {
  readonly id: string;
  readonly provider: EvidenceValue<string>;
  readonly displayName: EvidenceValue<string>;
  readonly monthlyUsd: EvidenceValue<number>;
  readonly includedUsage: EvidenceValue<string>;
}

export interface SubscriptionData {
  readonly plans: readonly SubscriptionPlan[];
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
