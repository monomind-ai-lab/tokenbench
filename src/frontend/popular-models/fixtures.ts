import {
  type PopularCategoryKey,
  type PopularModelCategorySubtasks,
  type PopularModelFixture,
  type PopularModelSubtaskDetail,
  type PopularModelsFixtureMetadata,
} from './types';

export { POPULAR_CATEGORY_KEYS, POPULAR_CATEGORY_LABELS } from './types';

export const POPULAR_MODELS_FIXTURE_METADATA = {
  fixture: true,
  kind: 'illustrative-ui-data',
  productionData: false,
  title: 'Illustrative Popular Models UI fixtures',
  disclaimer: 'Every name, score, cost, verbosity value, capability detail, and availability flag in this dataset is invented for interface development. It is not benchmark evidence, pricing guidance, a model release record, or a claim about any organization.',
} as const satisfies PopularModelsFixtureMetadata;

interface PopularModelFixtureSeed {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly organization: string;
  readonly openWeights: boolean;
  readonly finetune: boolean;
  readonly overallScore: number;
  readonly categoryScores: PopularModelFixture['categoryScores'];
  readonly costPerSuccessfulTask: number;
  readonly outputCostPerMillion: number;
  readonly verbosityTokens: number;
}

const POPULAR_CATEGORY_SUBTASK_LABELS = {
  reasoning: ['Constraint synthesis', 'Multi-step planning'],
  coding: ['Repository patch', 'Test repair'],
  agenticCoding: ['Tool-use workflow', 'Long-horizon implementation'],
  mathematics: ['Symbolic derivation', 'Quantitative verification'],
  dataAnalysis: ['Dataset diagnosis', 'Analytical narrative'],
  language: ['Multilingual rewrite', 'Nuanced summarization'],
  instructionFollowing: ['Structured response', 'Constraint adherence'],
} as const satisfies Readonly<Record<PopularCategoryKey, readonly [string, string]>>;

function boundedFixtureScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function fixtureSubtasks(
  category: PopularCategoryKey,
  score: number,
  fixtureName: string,
): readonly PopularModelSubtaskDetail[] {
  const [firstLabel, secondLabel] = POPULAR_CATEGORY_SUBTASK_LABELS[category];
  return [
    {
      id: `${category}-scenario`,
      label: firstLabel,
      score: boundedFixtureScore(score + 2),
      note: `${fixtureName} illustrative fixture detail; not a measured result.`,
    },
    {
      id: `${category}-verification`,
      label: secondLabel,
      score: boundedFixtureScore(score - 2),
      note: `${fixtureName} illustrative fixture detail; not a measured result.`,
    },
  ] as const;
}

function fixtureCategorySubtasks(seed: PopularModelFixtureSeed): PopularModelCategorySubtasks {
  const { categoryScores, name } = seed;
  return {
    reasoning: fixtureSubtasks('reasoning', categoryScores.reasoning, name),
    coding: fixtureSubtasks('coding', categoryScores.coding, name),
    agenticCoding: fixtureSubtasks('agenticCoding', categoryScores.agenticCoding, name),
    mathematics: fixtureSubtasks('mathematics', categoryScores.mathematics, name),
    dataAnalysis: fixtureSubtasks('dataAnalysis', categoryScores.dataAnalysis, name),
    language: fixtureSubtasks('language', categoryScores.language, name),
    instructionFollowing: fixtureSubtasks('instructionFollowing', categoryScores.instructionFollowing, name),
  };
}

function popularFixture(seed: PopularModelFixtureSeed): PopularModelFixture {
  return {
    ...seed,
    categorySubtasks: fixtureCategorySubtasks(seed),
    fixture: true,
  };
}

/**
 * This ordered list is intentionally fabricated sample content for the page.
 * Keep it separate from the repository's benchmark and catalog schemas.
 */
export const POPULAR_MODEL_FIXTURES: readonly PopularModelFixture[] = Object.freeze([
  popularFixture({
    id: 'claude-opus-4-1', slug: 'claude-opus-4-1', name: 'Claude Opus 4.1', organization: 'Anthropic', openWeights: false, finetune: false,
    overallScore: 96.8, categoryScores: { reasoning: 99, coding: 98, agenticCoding: 97, mathematics: 96, dataAnalysis: 94, language: 92, instructionFollowing: 98 },
    costPerSuccessfulTask: 9.5, outputCostPerMillion: 75, verbosityTokens: 1_400,
  }),
  popularFixture({
    id: 'claude-sonnet-4-5', slug: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', organization: 'Anthropic', openWeights: false, finetune: false,
    overallScore: 92.4, categoryScores: { reasoning: 94, coding: 96, agenticCoding: 93, mathematics: 91, dataAnalysis: 90, language: 92, instructionFollowing: 95 },
    costPerSuccessfulTask: 2.8, outputCostPerMillion: 15, verbosityTokens: 1_000,
  }),
  popularFixture({
    id: 'claude-haiku-4-5', slug: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', organization: 'Anthropic', openWeights: false, finetune: false,
    overallScore: 83.8, categoryScores: { reasoning: 82, coding: 86, agenticCoding: 80, mathematics: 79, dataAnalysis: 81, language: 88, instructionFollowing: 85 },
    costPerSuccessfulTask: 0.58, outputCostPerMillion: 5, verbosityTokens: 650,
  }),
  popularFixture({
    id: 'deepseek-r1', slug: 'deepseek-r1', name: 'DeepSeek R1', organization: 'DeepSeek', openWeights: true, finetune: true,
    overallScore: 91.6, categoryScores: { reasoning: 97, coding: 88, agenticCoding: 84, mathematics: 98, dataAnalysis: 91, language: 80, instructionFollowing: 85 },
    costPerSuccessfulTask: 1.65, outputCostPerMillion: 8, verbosityTokens: 2_200,
  }),
  popularFixture({
    id: 'deepseek-v3-2', slug: 'deepseek-v3-2', name: 'DeepSeek V3.2', organization: 'DeepSeek', openWeights: true, finetune: true,
    overallScore: 86.4, categoryScores: { reasoning: 86, coding: 89, agenticCoding: 87, mathematics: 86, dataAnalysis: 88, language: 86, instructionFollowing: 90 },
    costPerSuccessfulTask: 0.28, outputCostPerMillion: 1.2, verbosityTokens: 900,
  }),
  popularFixture({
    id: 'gemini-2-5-pro', slug: 'gemini-2-5-pro', name: 'Gemini 2.5 Pro', organization: 'Google', openWeights: false, finetune: false,
    overallScore: 94.6, categoryScores: { reasoning: 96, coding: 93, agenticCoding: 92, mathematics: 95, dataAnalysis: 94, language: 93, instructionFollowing: 96 },
    costPerSuccessfulTask: 1.15, outputCostPerMillion: 10, verbosityTokens: 1_100,
  }),
  popularFixture({
    id: 'gemini-2-5-flash', slug: 'gemini-2-5-flash', name: 'Gemini 2.5 Flash', organization: 'Google', openWeights: false, finetune: false,
    overallScore: 87.1, categoryScores: { reasoning: 85, coding: 87, agenticCoding: 84, mathematics: 84, dataAnalysis: 88, language: 90, instructionFollowing: 92 },
    costPerSuccessfulTask: 0.36, outputCostPerMillion: 2.5, verbosityTokens: 700,
  }),
  popularFixture({
    id: 'llama-4-maverick', slug: 'llama-4-maverick', name: 'Llama 4 Maverick', organization: 'Meta', openWeights: true, finetune: true,
    overallScore: 86.8, categoryScores: { reasoning: 84, coding: 90, agenticCoding: 86, mathematics: 82, dataAnalysis: 86, language: 88, instructionFollowing: 87 },
    costPerSuccessfulTask: 0.75, outputCostPerMillion: 1.5, verbosityTokens: 950,
  }),
  popularFixture({
    id: 'llama-4-scout', slug: 'llama-4-scout', name: 'Llama 4 Scout', organization: 'Meta', openWeights: true, finetune: true,
    overallScore: 80.4, categoryScores: { reasoning: 78, coding: 82, agenticCoding: 79, mathematics: 76, dataAnalysis: 81, language: 85, instructionFollowing: 84 },
    costPerSuccessfulTask: 0.22, outputCostPerMillion: 0.9, verbosityTokens: 620,
  }),
  popularFixture({
    id: 'mistral-large-3', slug: 'mistral-large-3', name: 'Mistral Large 3', organization: 'Mistral', openWeights: false, finetune: false,
    overallScore: 88.6, categoryScores: { reasoning: 89, coding: 91, agenticCoding: 87, mathematics: 85, dataAnalysis: 88, language: 90, instructionFollowing: 90 },
    costPerSuccessfulTask: 1.1, outputCostPerMillion: 6, verbosityTokens: 890,
  }),
  popularFixture({
    id: 'mistral-small-3-2', slug: 'mistral-small-3-2', name: 'Mistral Small 3.2', organization: 'Mistral', openWeights: true, finetune: true,
    overallScore: 78.7, categoryScores: { reasoning: 75, coding: 80, agenticCoding: 77, mathematics: 74, dataAnalysis: 79, language: 82, instructionFollowing: 83 },
    costPerSuccessfulTask: 0.18, outputCostPerMillion: 0.6, verbosityTokens: 540,
  }),
  popularFixture({
    id: 'gpt-5', slug: 'gpt-5', name: 'GPT-5', organization: 'OpenAI', openWeights: false, finetune: false,
    overallScore: 95.8, categoryScores: { reasoning: 97, coding: 96, agenticCoding: 95, mathematics: 96, dataAnalysis: 95, language: 94, instructionFollowing: 98 },
    costPerSuccessfulTask: 5.4, outputCostPerMillion: 45, verbosityTokens: 1_260,
  }),
  popularFixture({
    id: 'gpt-5-mini', slug: 'gpt-5-mini', name: 'GPT-5 mini', organization: 'OpenAI', openWeights: false, finetune: true,
    overallScore: 88.9, categoryScores: { reasoning: 87, coding: 90, agenticCoding: 88, mathematics: 86, dataAnalysis: 89, language: 91, instructionFollowing: 93 },
    costPerSuccessfulTask: 0.82, outputCostPerMillion: 4, verbosityTokens: 780,
  }),
  popularFixture({
    id: 'o3', slug: 'o3', name: 'o3', organization: 'OpenAI', openWeights: false, finetune: false,
    overallScore: 93.7, categoryScores: { reasoning: 98, coding: 92, agenticCoding: 90, mathematics: 99, dataAnalysis: 94, language: 84, instructionFollowing: 90 },
    costPerSuccessfulTask: 4.2, outputCostPerMillion: 30, verbosityTokens: 2_000,
  }),
  popularFixture({
    id: 'qwen3-235b-a22b', slug: 'qwen3-235b-a22b', name: 'Qwen3 235B A22B', organization: 'Qwen', openWeights: true, finetune: true,
    overallScore: 88.1, categoryScores: { reasoning: 88, coding: 91, agenticCoding: 87, mathematics: 89, dataAnalysis: 88, language: 87, instructionFollowing: 89 },
    costPerSuccessfulTask: 0.56, outputCostPerMillion: 2.2, verbosityTokens: 980,
  }),
  popularFixture({
    id: 'qwen3-coder-480b-a35b', slug: 'qwen3-coder-480b-a35b', name: 'Qwen3 Coder 480B A35B', organization: 'Qwen', openWeights: true, finetune: true,
    overallScore: 90.5, categoryScores: { reasoning: 86, coding: 98, agenticCoding: 96, mathematics: 87, dataAnalysis: 89, language: 82, instructionFollowing: 88 },
    costPerSuccessfulTask: 0.92, outputCostPerMillion: 3.8, verbosityTokens: 1_050,
  }),
  popularFixture({
    id: 'grok-4', slug: 'grok-4', name: 'Grok 4', organization: 'xAI', openWeights: false, finetune: false,
    overallScore: 91.9, categoryScores: { reasoning: 94, coding: 93, agenticCoding: 91, mathematics: 92, dataAnalysis: 90, language: 89, instructionFollowing: 92 },
    costPerSuccessfulTask: 3.1, outputCostPerMillion: 18, verbosityTokens: 1_150,
  }),
  popularFixture({
    id: 'grok-3-mini', slug: 'grok-3-mini', name: 'Grok 3 mini', organization: 'xAI', openWeights: false, finetune: false,
    overallScore: 82.5, categoryScores: { reasoning: 82, coding: 84, agenticCoding: 80, mathematics: 81, dataAnalysis: 83, language: 85, instructionFollowing: 87 },
    costPerSuccessfulTask: 0.48, outputCostPerMillion: 3, verbosityTokens: 720,
  }),
  popularFixture({
    id: 'command-a', slug: 'command-a', name: 'Command A', organization: 'Cohere', openWeights: false, finetune: true,
    overallScore: 81.4, categoryScores: { reasoning: 78, coding: 82, agenticCoding: 80, mathematics: 76, dataAnalysis: 86, language: 88, instructionFollowing: 84 },
    costPerSuccessfulTask: 0.7, outputCostPerMillion: 2.6, verbosityTokens: 760,
  }),
  popularFixture({
    id: 'phi-4', slug: 'phi-4', name: 'Phi-4', organization: 'Microsoft', openWeights: true, finetune: true,
    overallScore: 77.8, categoryScores: { reasoning: 76, coding: 79, agenticCoding: 74, mathematics: 82, dataAnalysis: 78, language: 77, instructionFollowing: 81 },
    costPerSuccessfulTask: 0.15, outputCostPerMillion: 0.4, verbosityTokens: 500,
  }),
  popularFixture({
    id: 'kimi-k2', slug: 'kimi-k2', name: 'Kimi K2', organization: 'Moonshot AI', openWeights: true, finetune: true,
    overallScore: 87.6, categoryScores: { reasoning: 88, coding: 92, agenticCoding: 90, mathematics: 85, dataAnalysis: 87, language: 84, instructionFollowing: 88 },
    costPerSuccessfulTask: 0.64, outputCostPerMillion: 2.8, verbosityTokens: 1_020,
  }),
  popularFixture({
    id: 'glm-4-5', slug: 'glm-4-5', name: 'GLM-4.5', organization: 'Z.ai', openWeights: true, finetune: true,
    overallScore: 85.7, categoryScores: { reasoning: 84, coding: 89, agenticCoding: 86, mathematics: 83, dataAnalysis: 86, language: 85, instructionFollowing: 88 },
    costPerSuccessfulTask: 0.44, outputCostPerMillion: 1.8, verbosityTokens: 830,
  }),
]);

/** Singular compatibility export for the page's one illustrative fixture collection. */
export const POPULAR_MODELS_FIXTURE = POPULAR_MODEL_FIXTURES;
