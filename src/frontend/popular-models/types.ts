/** The seven capability lenses rendered by the Popular Models page. */
export const POPULAR_CATEGORY_KEYS = [
  'reasoning',
  'coding',
  'agenticCoding',
  'mathematics',
  'dataAnalysis',
  'language',
  'instructionFollowing',
] as const;

export type PopularCategoryKey = (typeof POPULAR_CATEGORY_KEYS)[number];

/** Page-local compatibility name used by the Popular Models presentation components. */
export type BenchmarkCategoryKey = PopularCategoryKey;

export const POPULAR_CATEGORY_LABELS = {
  reasoning: 'Reasoning',
  coding: 'Coding',
  agenticCoding: 'Agentic coding',
  mathematics: 'Mathematics',
  dataAnalysis: 'Data analysis',
  language: 'Language',
  instructionFollowing: 'Instruction following',
} as const satisfies Readonly<Record<PopularCategoryKey, string>>;

export type PopularCategoryScores = Readonly<Record<PopularCategoryKey, number>>;

export interface PopularModelSubtaskDetail {
  readonly id: string;
  readonly label: string;
  readonly score: number;
  readonly note: string;
}

export type PopularModelCategorySubtasks = Readonly<Record<
  PopularCategoryKey,
  readonly PopularModelSubtaskDetail[]
>>;

/**
 * A deliberately local UI fixture. It is never a benchmark, price sheet, or
 * statement of a provider's capabilities or availability.
 */
export interface PopularModelFixture {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly organization: string;
  readonly openWeights: boolean;
  readonly finetune: boolean;
  readonly overallScore: number;
  readonly categoryScores: PopularCategoryScores;
  readonly costPerSuccessfulTask: number;
  readonly outputCostPerMillion: number;
  readonly verbosityTokens: number;
  readonly categorySubtasks: PopularModelCategorySubtasks;
  readonly fixture: true;
}

export interface PopularModelsFixtureMetadata {
  readonly fixture: true;
  readonly kind: 'illustrative-ui-data';
  readonly productionData: false;
  readonly title: string;
  readonly disclaimer: string;
}

export const POPULAR_SORT_KEYS = [
  'overallScore',
  ...POPULAR_CATEGORY_KEYS,
  'costPerSuccessfulTask',
  'outputCostPerMillion',
  'verbosityTokens',
] as const;

export type PopularSortKey = (typeof POPULAR_SORT_KEYS)[number];
export type PopularSortDirection = 'ascending' | 'descending';
export type PopularWeightsFilter = 'all' | 'openWeights' | 'closedWeights';
export type PopularFinetuneFilter = 'all' | 'supported' | 'unsupported';

export interface PopularModelsFilterState {
  readonly query: string;
  readonly organization: string | null;
  readonly category: PopularCategoryKey | null;
  readonly minimumCategoryScore: number | null;
  readonly weights: PopularWeightsFilter;
  readonly finetune: PopularFinetuneFilter;
}

export interface PopularModelsSortState {
  readonly key: PopularSortKey;
  readonly direction: PopularSortDirection;
}

export interface PopularModelsViewState {
  readonly filters: PopularModelsFilterState;
  readonly sort: PopularModelsSortState;
}

export interface PopularLogCostScatterPoint {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly organization: string;
  readonly overallScore: number;
  readonly costPerSuccessfulTask: number;
  readonly logCost: number;
  readonly isValueFrontier: boolean;
}

export interface PopularLogCostScatter {
  readonly points: readonly PopularLogCostScatterPoint[];
  readonly valueFrontier: readonly PopularLogCostScatterPoint[];
}
