export interface LiveBenchCategory {
  readonly categoryId: string;
  readonly label: string;
  readonly taskIds: readonly string[];
}

export interface LiveBenchTask {
  readonly taskId: string;
  readonly label: string;
  readonly categoryId: string;
}

export interface LiveBenchModelConfiguration {
  readonly configurationId: string;
  readonly sourceModelId: string;
  readonly displayName: string;
  readonly organization: string;
  readonly openWeights: boolean | null;
  readonly reasoner: boolean | null;
  readonly isDerivativeFinetune: boolean;
  readonly baseConfigurationId: string | null;
  readonly lineageSourceUrl: string | null;
}

export interface LiveBenchTaskScore {
  readonly configurationId: string;
  readonly taskId: string;
  readonly score: number;
}

export interface LiveBenchTaskEconomics {
  readonly configurationId: string;
  readonly taskId: string;
  readonly questionCount: number;
  readonly evaluationCostUsd: number;
  readonly inputPriceUsdPerMillion: number | null;
  readonly outputPriceUsdPerMillion: number | null;
  readonly meanInputTokens: number | null;
  readonly meanOutputTokens: number | null;
}

export interface LiveBenchReleaseBundle {
  readonly schemaVersion: 1;
  readonly releaseId: string;
  readonly sourceCommit: string;
  readonly observedAt: string;
  readonly categories: readonly LiveBenchCategory[];
  readonly tasks: readonly LiveBenchTask[];
  readonly models: readonly LiveBenchModelConfiguration[];
  readonly taskScores: readonly LiveBenchTaskScore[];
  readonly taskEconomics: readonly LiveBenchTaskEconomics[];
}

/**
 * The upstream repository currently does not declare the required data license.
 * Publication must therefore be given an independently reviewed evidence record;
 * parsing rejects absent or structurally invalid evidence instead of inferring it.
 */
export interface LiveBenchLicenseEvidence {
  readonly licenseId: 'CDLA-Permissive-2.0';
  readonly verificationUrl: string;
  readonly verifiedAt: string;
}

export type LiveBenchArtifactId = 'table' | 'categories' | 'cost' | 'model-links';

export interface LiveBenchReleaseArtifact {
  readonly artifactId: LiveBenchArtifactId;
  readonly path: string;
  readonly blobId: string;
  readonly rawUrl: string;
}

export interface LiveBenchReleaseDescriptor {
  readonly releaseId: string;
  readonly commit: string;
  readonly fingerprint: `sha256:${string}`;
  readonly artifacts: readonly LiveBenchReleaseArtifact[];
}

export interface LiveBenchDiscoveryState {
  readonly etag: string | null;
  readonly headCommit: string | null;
  readonly fingerprint: string | null;
  readonly verifiedIsoWeek: string | null;
}

export type LiveBenchDiscoveryResult =
  | { readonly status: 'unchanged'; readonly checkedAt: string; readonly state: LiveBenchDiscoveryState }
  | {
    readonly status: 'incomplete_upstream_release';
    readonly checkedAt: string;
    readonly releaseId: string;
    readonly state: LiveBenchDiscoveryState;
  }
  | {
    readonly status: 'changed';
    readonly checkedAt: string;
    readonly release: LiveBenchReleaseDescriptor;
    readonly state: LiveBenchDiscoveryState;
  };

export class LiveBenchValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveBenchValidationError';
  }
}

const SHA_PATTERN = /^[a-f0-9]{40}$/;
const CONTENT_HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ISO_WEEK_PATTERN = /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/;
const MAX_CATEGORIES = 100;
const MAX_TASKS = 1_000;
const MAX_MODELS = 10_000;
const MAX_FACTS = 250_000;

function record(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LiveBenchValidationError(`${context} must be an object`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, context: string, maximum: number): readonly unknown[] {
  if (!Array.isArray(value)) throw new LiveBenchValidationError(`${context} must be an array`);
  if (value.length > maximum) throw new LiveBenchValidationError(`${context} exceeds ${maximum} items`);
  return value;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], context: string): void {
  const actual = Object.keys(value);
  if (actual.length !== expected.length || actual.some((key) => !expected.includes(key))) {
    throw new LiveBenchValidationError(`${context} has unknown or missing fields`);
  }
}

function nonBlankString(value: unknown, context: string, maximum = 1_024): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    throw new LiveBenchValidationError(`${context} must be a non-blank string`);
  }
  if (value !== value.trim()) throw new LiveBenchValidationError(`${context} must not have surrounding whitespace`);
  return value;
}

function nullableBoolean(value: unknown, context: string): boolean | null {
  if (value === null || typeof value === 'boolean') return value as boolean | null;
  throw new LiveBenchValidationError(`${context} must be boolean or null`);
}

function finiteNumber(value: unknown, context: string, minimum: number, maximum = Number.POSITIVE_INFINITY): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new LiveBenchValidationError(`${context} must be a finite number between ${minimum} and ${maximum}`);
  }
  return value;
}

function nullableFiniteNumber(value: unknown, context: string, minimum: number): number | null {
  if (value === null) return null;
  return finiteNumber(value, context, minimum);
}

function nullableString(value: unknown, context: string): string | null {
  return value === null ? null : nonBlankString(value, context);
}

function httpsUrl(value: string, context: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new LiveBenchValidationError(`${context} must be a URL`);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
    throw new LiveBenchValidationError(`${context} must be a credential-free HTTPS URL without a fragment`);
  }
  return value;
}

function nullableHttpsUrl(value: unknown, context: string): string | null {
  if (value === null) return null;
  return httpsUrl(nonBlankString(value, context, 4_096), context);
}

export function assertLiveBenchReleaseId(value: unknown, context = 'releaseId'): string {
  const releaseId = nonBlankString(value, context, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(releaseId);
  if (!match) throw new LiveBenchValidationError(`${context} must be YYYY-MM-DD`);
  const date = new Date(`${releaseId}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf())
    || date.getUTCFullYear() !== Number(match[1])
    || date.getUTCMonth() + 1 !== Number(match[2])
    || date.getUTCDate() !== Number(match[3])) {
    throw new LiveBenchValidationError(`${context} must be a calendar date`);
  }
  return releaseId;
}

export function assertLiveBenchCommit(value: unknown, context = 'sourceCommit'): string {
  const commit = nonBlankString(value, context, 40);
  if (!SHA_PATTERN.test(commit)) throw new LiveBenchValidationError(`${context} must be a lowercase 40-character Git SHA`);
  return commit;
}

export function assertLiveBenchTimestamp(value: unknown, context = 'timestamp'): string {
  const timestamp = nonBlankString(value, context, 30);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp)
    || Number.isNaN(Date.parse(timestamp))
    || new Date(timestamp).toISOString() !== timestamp) {
    throw new LiveBenchValidationError(`${context} must be a canonical ISO-8601 UTC timestamp`);
  }
  return timestamp;
}

export function validateLiveBenchLicenseEvidence(value: unknown): LiveBenchLicenseEvidence {
  const candidate = record(value, 'license evidence');
  exactKeys(candidate, ['licenseId', 'verificationUrl', 'verifiedAt'], 'license evidence');
  if (candidate.licenseId !== 'CDLA-Permissive-2.0') {
    throw new LiveBenchValidationError('license evidence must identify CDLA-Permissive-2.0');
  }
  return Object.freeze({
    licenseId: 'CDLA-Permissive-2.0' as const,
    verificationUrl: httpsUrl(nonBlankString(candidate.verificationUrl, 'license evidence verificationUrl', 4_096), 'license evidence verificationUrl'),
    verifiedAt: assertLiveBenchTimestamp(candidate.verifiedAt, 'license evidence verifiedAt'),
  });
}

export function validateLiveBenchDiscoveryState(value: unknown): LiveBenchDiscoveryState {
  const candidate = record(value, 'discovery state');
  exactKeys(candidate, ['etag', 'headCommit', 'fingerprint', 'verifiedIsoWeek'], 'discovery state');
  const etag = candidate.etag === null ? null : nonBlankString(candidate.etag, 'discovery state etag', 1_024);
  const headCommit = candidate.headCommit === null ? null : assertLiveBenchCommit(candidate.headCommit, 'discovery state headCommit');
  const fingerprint = candidate.fingerprint === null
    ? null
    : nonBlankString(candidate.fingerprint, 'discovery state fingerprint', 80);
  if (fingerprint !== null && !CONTENT_HASH_PATTERN.test(fingerprint)) {
    throw new LiveBenchValidationError('discovery state fingerprint must be a sha256 digest');
  }
  const verifiedIsoWeek = candidate.verifiedIsoWeek === null
    ? null
    : nonBlankString(candidate.verifiedIsoWeek, 'discovery state verifiedIsoWeek', 8);
  if (verifiedIsoWeek !== null && !ISO_WEEK_PATTERN.test(verifiedIsoWeek)) {
    throw new LiveBenchValidationError('discovery state verifiedIsoWeek must be an ISO week');
  }
  return Object.freeze({ etag, headCommit, fingerprint, verifiedIsoWeek });
}

function normalizedReleaseIdFromArtifactPath(path: string, artifactId: Exclude<LiveBenchArtifactId, 'model-links'>): string | null {
  const match = new RegExp(`^public/${artifactId}_(\\d{4}[-_]\\d{2}[-_]\\d{2})\\.${artifactId === 'categories' ? 'json' : 'csv'}$`).exec(path);
  if (!match) return null;
  const normalized = match[1]?.replaceAll('_', '-');
  return normalized ? assertLiveBenchReleaseId(normalized, `artifact ${artifactId} release`) : null;
}

export function validateLiveBenchReleaseDescriptor(value: unknown): LiveBenchReleaseDescriptor {
  const candidate = record(value, 'release descriptor');
  exactKeys(candidate, ['releaseId', 'commit', 'fingerprint', 'artifacts'], 'release descriptor');
  const releaseId = assertLiveBenchReleaseId(candidate.releaseId, 'release descriptor releaseId');
  const commit = assertLiveBenchCommit(candidate.commit, 'release descriptor commit');
  const fingerprint = nonBlankString(candidate.fingerprint, 'release descriptor fingerprint', 80);
  if (!CONTENT_HASH_PATTERN.test(fingerprint)) {
    throw new LiveBenchValidationError('release descriptor fingerprint must be a sha256 digest');
  }
  const artifacts = array(candidate.artifacts, 'release descriptor artifacts', 4).map((value, index) => {
    const artifact = record(value, `release descriptor artifact ${index}`);
    exactKeys(artifact, ['artifactId', 'path', 'blobId', 'rawUrl'], `release descriptor artifact ${index}`);
    if (artifact.artifactId !== 'table' && artifact.artifactId !== 'categories'
      && artifact.artifactId !== 'cost' && artifact.artifactId !== 'model-links') {
      throw new LiveBenchValidationError(`release descriptor artifact ${index} has an unknown artifactId`);
    }
    const artifactId = artifact.artifactId;
    const path = nonBlankString(artifact.path, `release descriptor artifact ${artifactId} path`, 1_024);
    if (artifactId === 'model-links') {
      if (path !== 'src/Table/modelLinks.js') {
        throw new LiveBenchValidationError('model-links artifact must use src/Table/modelLinks.js');
      }
    } else if (normalizedReleaseIdFromArtifactPath(path, artifactId) !== releaseId) {
      throw new LiveBenchValidationError(`artifact ${artifactId} path does not match release ${releaseId}`);
    }
    const blobId = assertLiveBenchCommit(artifact.blobId, `release descriptor artifact ${artifactId} blobId`);
    const rawUrl = httpsUrl(nonBlankString(artifact.rawUrl, `release descriptor artifact ${artifactId} rawUrl`, 4_096), `release descriptor artifact ${artifactId} rawUrl`);
    const expectedUrl = `https://raw.githubusercontent.com/LiveBench/new-livebench/${commit}/${path}`;
    if (rawUrl !== expectedUrl) {
      throw new LiveBenchValidationError(`artifact ${artifactId} rawUrl must be immutable and pinned to the descriptor commit`);
    }
    return Object.freeze({ artifactId, path, blobId, rawUrl });
  });
  const expectedIds: LiveBenchArtifactId[] = ['table', 'categories', 'cost', 'model-links'];
  if (artifacts.length !== expectedIds.length || new Set(artifacts.map((artifact) => artifact.artifactId)).size !== expectedIds.length
    || expectedIds.some((artifactId) => !artifacts.some((artifact) => artifact.artifactId === artifactId))) {
    throw new LiveBenchValidationError('release descriptor must contain one complete table/categories/cost/model-links bundle');
  }
  return Object.freeze({
    releaseId,
    commit,
    fingerprint: fingerprint as `sha256:${string}`,
    artifacts: Object.freeze(artifacts),
  });
}

/** Validate and copy a release bundle before it crosses into publication code. */
export function validateLiveBenchRelease(value: unknown): LiveBenchReleaseBundle {
  const candidate = record(value, 'LiveBench release');
  exactKeys(candidate, [
    'schemaVersion',
    'releaseId',
    'sourceCommit',
    'observedAt',
    'categories',
    'tasks',
    'models',
    'taskScores',
    'taskEconomics',
  ], 'LiveBench release');
  if (candidate.schemaVersion !== 1) throw new LiveBenchValidationError('LiveBench release schemaVersion must be 1');

  const categories = array(candidate.categories, 'categories', MAX_CATEGORIES).map((value, index) => {
    const category = record(value, `category ${index}`);
    exactKeys(category, ['categoryId', 'label', 'taskIds'], `category ${index}`);
    const categoryId = nonBlankString(category.categoryId, `category ${index} categoryId`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(categoryId)) {
      throw new LiveBenchValidationError(`category ${index} categoryId must be a lowercase slug`);
    }
    const taskIds = array(category.taskIds, `category ${index} taskIds`, MAX_TASKS)
      .map((taskId, taskIndex) => nonBlankString(taskId, `category ${index} taskIds[${taskIndex}]`));
    if (!taskIds.length || new Set(taskIds).size !== taskIds.length) {
      throw new LiveBenchValidationError(`category ${index} must contain unique taskIds`);
    }
    return Object.freeze({
      categoryId,
      label: nonBlankString(category.label, `category ${index} label`),
      taskIds: Object.freeze(taskIds),
    });
  });
  if (!categories.length || new Set(categories.map((category) => category.categoryId)).size !== categories.length) {
    throw new LiveBenchValidationError('categories must be non-empty with unique categoryIds');
  }

  const tasks = array(candidate.tasks, 'tasks', MAX_TASKS).map((value, index) => {
    const task = record(value, `task ${index}`);
    exactKeys(task, ['taskId', 'label', 'categoryId'], `task ${index}`);
    return Object.freeze({
      taskId: nonBlankString(task.taskId, `task ${index} taskId`),
      label: nonBlankString(task.label, `task ${index} label`),
      categoryId: nonBlankString(task.categoryId, `task ${index} categoryId`),
    });
  });
  const categoryById = new Map(categories.map((category) => [category.categoryId, category]));
  if (!tasks.length || new Set(tasks.map((task) => task.taskId)).size !== tasks.length) {
    throw new LiveBenchValidationError('tasks must be non-empty with unique taskIds');
  }
  for (const task of tasks) {
    const category = categoryById.get(task.categoryId);
    if (!category || !category.taskIds.includes(task.taskId)) {
      throw new LiveBenchValidationError(`task ${task.taskId} has unknown category membership`);
    }
  }
  for (const category of categories) {
    const actualTaskIds = tasks.filter((task) => task.categoryId === category.categoryId).map((task) => task.taskId);
    if (actualTaskIds.length !== category.taskIds.length || actualTaskIds.some((taskId) => !category.taskIds.includes(taskId))) {
      throw new LiveBenchValidationError(`category ${category.categoryId} task membership does not match tasks`);
    }
  }

  const models = array(candidate.models, 'models', MAX_MODELS).map((value, index) => {
    const model = record(value, `model ${index}`);
    exactKeys(model, [
      'configurationId',
      'sourceModelId',
      'displayName',
      'organization',
      'openWeights',
      'reasoner',
      'isDerivativeFinetune',
      'baseConfigurationId',
      'lineageSourceUrl',
    ], `model ${index}`);
    const isDerivativeFinetune = model.isDerivativeFinetune;
    if (typeof isDerivativeFinetune !== 'boolean') {
      throw new LiveBenchValidationError(`model ${index} isDerivativeFinetune must be boolean`);
    }
    const baseConfigurationId = nullableString(model.baseConfigurationId, `model ${index} baseConfigurationId`);
    const lineageSourceUrl = nullableHttpsUrl(model.lineageSourceUrl, `model ${index} lineageSourceUrl`);
    if (!isDerivativeFinetune && (baseConfigurationId !== null || lineageSourceUrl !== null)) {
      throw new LiveBenchValidationError(`non-derivative model ${index} cannot carry lineage facts`);
    }
    return Object.freeze({
      configurationId: nonBlankString(model.configurationId, `model ${index} configurationId`),
      sourceModelId: nonBlankString(model.sourceModelId, `model ${index} sourceModelId`),
      displayName: nonBlankString(model.displayName, `model ${index} displayName`),
      organization: nonBlankString(model.organization, `model ${index} organization`),
      openWeights: nullableBoolean(model.openWeights, `model ${index} openWeights`),
      reasoner: nullableBoolean(model.reasoner, `model ${index} reasoner`),
      isDerivativeFinetune,
      baseConfigurationId,
      lineageSourceUrl,
    });
  });
  if (!models.length || new Set(models.map((model) => model.configurationId)).size !== models.length
    || new Set(models.map((model) => model.sourceModelId)).size !== models.length) {
    throw new LiveBenchValidationError('models must be non-empty with unique configurationId and sourceModelId values');
  }

  const expectedFactCount = models.length * tasks.length;
  if (expectedFactCount > MAX_FACTS) throw new LiveBenchValidationError('release score matrix exceeds fact bound');
  const modelIds = new Set(models.map((model) => model.configurationId));
  const taskIds = new Set(tasks.map((task) => task.taskId));
  const taskScores = array(candidate.taskScores, 'taskScores', MAX_FACTS).map((value, index) => {
    const score = record(value, `task score ${index}`);
    exactKeys(score, ['configurationId', 'taskId', 'score'], `task score ${index}`);
    const configurationId = nonBlankString(score.configurationId, `task score ${index} configurationId`);
    const taskId = nonBlankString(score.taskId, `task score ${index} taskId`);
    if (!modelIds.has(configurationId) || !taskIds.has(taskId)) {
      throw new LiveBenchValidationError(`task score ${index} has unknown model or task`);
    }
    return Object.freeze({ configurationId, taskId, score: finiteNumber(score.score, `task score ${index} score`, 0, 100) });
  });
  if (taskScores.length !== expectedFactCount || new Set(taskScores.map((score) => `${score.configurationId}\u0000${score.taskId}`)).size !== taskScores.length) {
    throw new LiveBenchValidationError('score matrix must contain one score per model and task');
  }

  const taskEconomics = array(candidate.taskEconomics, 'taskEconomics', MAX_FACTS).map((value, index) => {
    const economics = record(value, `task economics ${index}`);
    exactKeys(economics, [
      'configurationId',
      'taskId',
      'questionCount',
      'evaluationCostUsd',
      'inputPriceUsdPerMillion',
      'outputPriceUsdPerMillion',
      'meanInputTokens',
      'meanOutputTokens',
    ], `task economics ${index}`);
    const configurationId = nonBlankString(economics.configurationId, `task economics ${index} configurationId`);
    const taskId = nonBlankString(economics.taskId, `task economics ${index} taskId`);
    if (!modelIds.has(configurationId) || !taskIds.has(taskId)) {
      throw new LiveBenchValidationError(`task economics ${index} has unknown model or task`);
    }
    const questionCount = finiteNumber(economics.questionCount, `task economics ${index} questionCount`, 1);
    if (!Number.isSafeInteger(questionCount)) {
      throw new LiveBenchValidationError(`task economics ${index} questionCount must be an integer`);
    }
    return Object.freeze({
      configurationId,
      taskId,
      questionCount,
      evaluationCostUsd: finiteNumber(economics.evaluationCostUsd, `task economics ${index} evaluationCostUsd`, 0),
      inputPriceUsdPerMillion: nullableFiniteNumber(economics.inputPriceUsdPerMillion, `task economics ${index} inputPriceUsdPerMillion`, 0),
      outputPriceUsdPerMillion: nullableFiniteNumber(economics.outputPriceUsdPerMillion, `task economics ${index} outputPriceUsdPerMillion`, 0),
      meanInputTokens: nullableFiniteNumber(economics.meanInputTokens, `task economics ${index} meanInputTokens`, 0),
      meanOutputTokens: nullableFiniteNumber(economics.meanOutputTokens, `task economics ${index} meanOutputTokens`, 0),
    });
  });
  if (taskEconomics.length !== expectedFactCount
    || new Set(taskEconomics.map((economics) => `${economics.configurationId}\u0000${economics.taskId}`)).size !== taskEconomics.length) {
    throw new LiveBenchValidationError('economics matrix must contain one fact per model and task');
  }

  return Object.freeze({
    schemaVersion: 1 as const,
    releaseId: assertLiveBenchReleaseId(candidate.releaseId),
    sourceCommit: assertLiveBenchCommit(candidate.sourceCommit),
    observedAt: assertLiveBenchTimestamp(candidate.observedAt, 'observedAt'),
    categories: Object.freeze(categories),
    tasks: Object.freeze(tasks),
    models: Object.freeze(models),
    taskScores: Object.freeze(taskScores),
    taskEconomics: Object.freeze(taskEconomics),
  });
}
