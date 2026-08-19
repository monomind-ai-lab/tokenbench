import {
  type LiveBenchCategory,
  type LiveBenchLicenseEvidence,
  type LiveBenchModelConfiguration,
  type LiveBenchReleaseBundle,
  type LiveBenchTask,
  type LiveBenchTaskEconomics,
  type LiveBenchTaskScore,
  LiveBenchValidationError,
  validateLiveBenchLicenseEvidence,
  validateLiveBenchRelease,
} from './contracts';
import { parseCsv, type ParsedCsv } from './csv';
import { parseRestrictedLiteral, type RestrictedLiteral } from './restricted-literal';

export interface ParseLiveBenchReleaseInput {
  readonly releaseId: string;
  readonly sourceCommit: string;
  readonly observedAt: string;
  /** Required because the upstream repository currently has no license declaration. */
  readonly licenseEvidence: LiveBenchLicenseEvidence;
  readonly tableCsv: string | Uint8Array;
  readonly categoriesJson: string | Uint8Array;
  readonly costCsv: string | Uint8Array;
  readonly modelLinksSource: string | Uint8Array;
}

interface SourceModelLink {
  readonly sourceModelId: string;
  readonly info: Readonly<Record<string, RestrictedLiteral>>;
  readonly variant: Readonly<Record<string, RestrictedLiteral>> | null;
}

const MAX_CATEGORIES_JSON_BYTES = 1_048_576;
const MAX_MODEL_LINKS_SOURCE_BYTES = 1_048_576;
const OPTIONAL_COST_COLUMNS = new Set(['avg_input_tokens', 'avg_output_tokens', 'input_price_per_million', 'output_price_per_million']);

function decodeUtf8(input: string | Uint8Array, context: string, maxBytes: number): string {
  if (typeof input === 'string') {
    if (new TextEncoder().encode(input).byteLength > maxBytes) {
      throw new LiveBenchValidationError(`${context} exceeds ${maxBytes} byte limit`);
    }
    return input;
  }
  if (input.byteLength > maxBytes) throw new LiveBenchValidationError(`${context} exceeds ${maxBytes} byte limit`);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(input);
  } catch {
    throw new LiveBenchValidationError(`${context} is not valid UTF-8`);
  }
}

function sourceRecord(value: RestrictedLiteral | unknown, context: string): Readonly<Record<string, RestrictedLiteral>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LiveBenchValidationError(`${context} must be an object`);
  }
  return value as Readonly<Record<string, RestrictedLiteral>>;
}

function sourceString(value: unknown, context: string): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
    throw new LiveBenchValidationError(`${context} must be a non-blank string`);
  }
  return value;
}

function optionalSourceString(value: unknown, context: string): string | null {
  if (value === undefined || value === null) return null;
  return sourceString(value, context);
}

function optionalSourceBoolean(value: unknown, context: string): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'boolean') throw new LiveBenchValidationError(`${context} must be boolean when present`);
  return value;
}

function parseFiniteDecimal(value: string, context: string, minimum: number, maximum = Number.POSITIVE_INFINITY): number {
  if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(value)) {
    throw new LiveBenchValidationError(`${context} must be a finite decimal`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new LiveBenchValidationError(`${context} must be finite and between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function parseOptionalDecimal(value: string, context: string, minimum: number): number | null {
  return value === '' ? null : parseFiniteDecimal(value, context, minimum);
}

function parsePositiveInteger(value: string, context: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) throw new LiveBenchValidationError(`${context} must be a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new LiveBenchValidationError(`${context} must be a safe integer`);
  return parsed;
}

function categorySlug(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) throw new LiveBenchValidationError(`category label ${JSON.stringify(label)} cannot produce a stable categoryId`);
  return slug;
}

function parseCategories(input: string | Uint8Array): { readonly categories: readonly LiveBenchCategory[]; readonly tasks: readonly LiveBenchTask[] } {
  const text = decodeUtf8(input, 'categories JSON', MAX_CATEGORIES_JSON_BYTES);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new LiveBenchValidationError('categories JSON is invalid');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new LiveBenchValidationError('categories JSON must be an object');
  }

  const categoryEntries = Object.entries(parsed as Record<string, unknown>);
  if (!categoryEntries.length || categoryEntries.length > 100) {
    throw new LiveBenchValidationError('categories JSON must contain a bounded non-empty taxonomy');
  }
  const categoryIds = new Set<string>();
  const taskIds = new Set<string>();
  const categories: LiveBenchCategory[] = [];
  const tasks: LiveBenchTask[] = [];
  for (const [labelValue, taskValues] of categoryEntries) {
    const label = sourceString(labelValue, 'category label');
    const categoryId = categorySlug(label);
    if (categoryIds.has(categoryId)) throw new LiveBenchValidationError(`duplicate categoryId ${categoryId}`);
    categoryIds.add(categoryId);
    if (!Array.isArray(taskValues) || !taskValues.length || taskValues.length > 1_000) {
      throw new LiveBenchValidationError(`category ${label} must list a bounded non-empty task array`);
    }
    const categoryTaskIds = taskValues.map((taskValue, taskIndex) => {
      const taskId = sourceString(taskValue, `category ${label} task ${taskIndex}`);
      if (taskIds.has(taskId)) throw new LiveBenchValidationError(`duplicate taskId ${taskId}`);
      taskIds.add(taskId);
      tasks.push({ taskId, label: taskId, categoryId });
      return taskId;
    });
    categories.push({ categoryId, label, taskIds: categoryTaskIds });
  }
  return { categories, tasks };
}

function requireExactTaskColumns(csv: ParsedCsv, expectedTaskIds: readonly string[], kind: 'table' | 'cost'): void {
  const actualTaskColumns = kind === 'table'
    ? csv.headers.filter((header) => header !== 'model')
    : csv.headers.filter((header) => expectedTaskIds.includes(header));
  const actual = new Set(actualTaskColumns);
  const expected = new Set(expectedTaskIds);
  if (actual.size !== expected.size || [...expected].some((taskId) => !actual.has(taskId))) {
    const missing = expectedTaskIds.filter((taskId) => !actual.has(taskId));
    const unknown = actualTaskColumns.filter((taskId) => !expected.has(taskId));
    throw new LiveBenchValidationError(`${kind} has missing task column ${missing[0] ?? 'none'} or unknown task column ${unknown[0] ?? 'none'}`);
  }
}

function parseScoreRows(table: ParsedCsv, taskIds: readonly string[]): {
  readonly modelOrder: readonly string[];
  readonly scoresByModel: ReadonlyMap<string, Readonly<Record<string, number>>>;
} {
  if (!table.headers.includes('model')) throw new LiveBenchValidationError('table must contain a model column');
  requireExactTaskColumns(table, taskIds, 'table');
  if (!table.rows.length) throw new LiveBenchValidationError('table must contain at least one model row');
  const modelOrder: string[] = [];
  const scoresByModel = new Map<string, Readonly<Record<string, number>>>();
  for (const [rowIndex, row] of table.rows.entries()) {
    const sourceModelId = sourceString(row.model, `table row ${rowIndex + 2} model`);
    if (scoresByModel.has(sourceModelId)) throw new LiveBenchValidationError(`duplicate model ${sourceModelId} in table`);
    const scores: Record<string, number> = {};
    for (const taskId of taskIds) {
      scores[taskId] = parseFiniteDecimal(row[taskId] as string, `table ${sourceModelId} ${taskId}`, 0, 100);
    }
    modelOrder.push(sourceModelId);
    scoresByModel.set(sourceModelId, scores);
  }
  return { modelOrder, scoresByModel };
}

function literalArray(value: RestrictedLiteral | undefined, context: string): readonly RestrictedLiteral[] {
  if (!Array.isArray(value)) throw new LiveBenchValidationError(`${context} must be an array`);
  return value;
}

function parseModelLinks(source: string | Uint8Array): ReadonlyMap<string, SourceModelLink> {
  const sourceText = decodeUtf8(source, 'modelLinks source', MAX_MODEL_LINKS_SOURCE_BYTES);
  // New-livebench currently colocates harmless UI helper definitions after the
  // data export. We never parse or execute those helpers, but fail closed on
  // direct host/environment access or dynamic invocation in the ignored tail.
  if (/\b(?:globalThis|window|document|process|Deno|Bun)\s*(?:\.|\[)|\b(?:fetch|eval|Function|require|import|XMLHttpRequest|WebSocket)\s*\(/.test(sourceText)) {
    throw new LiveBenchValidationError('modelLinks source contains forbidden executable host access');
  }
  const parsed = parseRestrictedLiteral(sourceText, {
    exportName: 'modelLinks',
    // The upstream source currently puts UI helpers after this export. They are
    // deliberately ignored, never imported or evaluated; only the literal is read.
    allowTrailingSource: true,
  });
  const root = sourceRecord(parsed, 'modelLinks export');
  const links = new Map<string, SourceModelLink>();
  const add = (sourceModelId: string, info: Readonly<Record<string, RestrictedLiteral>>, variant: Readonly<Record<string, RestrictedLiteral>> | null) => {
    if (links.has(sourceModelId)) throw new LiveBenchValidationError(`duplicate modelLinks configuration ${sourceModelId}`);
    links.set(sourceModelId, { sourceModelId, info, variant });
  };
  for (const [modelId, value] of Object.entries(root)) {
    const info = sourceRecord(value, `modelLinks ${modelId}`);
    sourceString(modelId, 'modelLinks key');
    add(modelId, info, null);
    if (info.variants === undefined) continue;
    const variants = literalArray(info.variants, `modelLinks ${modelId} variants`);
    if (variants.length > 100) throw new LiveBenchValidationError(`modelLinks ${modelId} has too many variants`);
    for (const [variantIndex, variantValue] of variants.entries()) {
      const variant = sourceRecord(variantValue, `modelLinks ${modelId} variant ${variantIndex}`);
      const rawName = sourceString(variant.rawName, `modelLinks ${modelId} variant ${variantIndex} rawName`);
      optionalSourceString(variant.displayName, `modelLinks ${rawName} displayName`);
      optionalSourceString(variant.url, `modelLinks ${rawName} url`);
      optionalSourceBoolean(variant.openweight, `modelLinks ${rawName} openweight`);
      optionalSourceBoolean(variant.reasoner, `modelLinks ${rawName} reasoner`);
      add(rawName, info, variant);
    }
  }
  return links;
}

function resolveModel(
  sourceModelId: string,
  sourceLinks: ReadonlyMap<string, SourceModelLink>,
  displayNameIndex: ReadonlyMap<string, readonly string[]>,
): LiveBenchModelConfiguration {
  const link = sourceLinks.get(sourceModelId);
  if (!link) throw new LiveBenchValidationError(`table model ${sourceModelId} has no modelLinks metadata`);
  const info = link.info;
  const variant = link.variant;
  const displayName = optionalSourceString(variant?.displayName, `modelLinks ${sourceModelId} variant displayName`)
    ?? sourceString(info.displayName, `modelLinks ${sourceModelId} displayName`);
  const organization = sourceString(info.organization, `modelLinks ${sourceModelId} organization`);
  const openWeights = optionalSourceBoolean(variant?.openweight, `modelLinks ${sourceModelId} variant openweight`)
    ?? optionalSourceBoolean(info.openweight, `modelLinks ${sourceModelId} openweight`);
  const reasoner = optionalSourceBoolean(variant?.reasoner, `modelLinks ${sourceModelId} variant reasoner`)
    ?? optionalSourceBoolean(info.reasoner, `modelLinks ${sourceModelId} reasoner`);
  const finetune = info.finetune === undefined ? null : sourceRecord(info.finetune, `modelLinks ${sourceModelId} finetune`);
  if (!finetune) {
    return {
      configurationId: sourceModelId,
      sourceModelId,
      displayName,
      organization,
      openWeights,
      reasoner,
      isDerivativeFinetune: false,
      baseConfigurationId: null,
      lineageSourceUrl: null,
    };
  }
  const baseModel = sourceString(finetune.baseModel, `modelLinks ${sourceModelId} finetune baseModel`);
  const baseConfigurationIds = displayNameIndex.get(baseModel) ?? [];
  const baseConfigurationId = sourceLinks.has(baseModel)
    ? baseModel
    : baseConfigurationIds.length === 1 ? baseConfigurationIds[0] as string : null;
  const lineageSourceUrl = optionalSourceString(info.huggingface, `modelLinks ${sourceModelId} huggingface`)
    ?? optionalSourceString(variant?.url, `modelLinks ${sourceModelId} variant url`)
    ?? optionalSourceString(info.url, `modelLinks ${sourceModelId} url`);
  return {
    configurationId: sourceModelId,
    sourceModelId,
    displayName,
    organization,
    openWeights,
    reasoner,
    isDerivativeFinetune: true,
    baseConfigurationId,
    lineageSourceUrl,
  };
}

function displayNameIndex(sourceLinks: ReadonlyMap<string, SourceModelLink>): ReadonlyMap<string, readonly string[]> {
  const result = new Map<string, string[]>();
  for (const [sourceModelId, link] of sourceLinks) {
    const displayName = optionalSourceString(link.variant?.displayName, `modelLinks ${sourceModelId} variant displayName`)
      ?? optionalSourceString(link.info.displayName, `modelLinks ${sourceModelId} displayName`);
    if (!displayName) continue;
    const entries = result.get(displayName) ?? [];
    entries.push(sourceModelId);
    result.set(displayName, entries);
  }
  return result;
}

function requireCostSchema(cost: ParsedCsv, taskIds: readonly string[]): void {
  if (!cost.headers.includes('model')) throw new LiveBenchValidationError('cost must contain a model column');
  requireExactTaskColumns(cost, taskIds, 'cost');
  const required = new Set([
    'model',
    ...taskIds,
    ...taskIds.map((taskId) => `nq_${taskId}`),
    ...OPTIONAL_COST_COLUMNS,
  ]);
  for (const header of cost.headers) {
    const isKnownOutputTokenColumn = header.startsWith('out_') && taskIds.includes(header.slice(4));
    if (!required.has(header) && !isKnownOutputTokenColumn && header !== 'cost_per_question' && header !== 'cost_per_successful_task') {
      throw new LiveBenchValidationError(`cost has unknown column ${header}`);
    }
  }
  for (const header of required) {
    if (!cost.headers.includes(header)) throw new LiveBenchValidationError(`cost is missing required column ${header}`);
  }
}

function parseCostRows(
  cost: ParsedCsv,
  taskIds: readonly string[],
  expectedModels: readonly string[],
): ReadonlyMap<string, Readonly<Record<string, string>>> {
  requireCostSchema(cost, taskIds);
  const rows = new Map<string, Readonly<Record<string, string>>>();
  for (const [rowIndex, row] of cost.rows.entries()) {
    const sourceModelId = sourceString(row.model, `cost row ${rowIndex + 2} model`);
    if (rows.has(sourceModelId)) throw new LiveBenchValidationError(`duplicate model ${sourceModelId} in cost`);
    rows.set(sourceModelId, row);
  }
  if (rows.size !== expectedModels.length || expectedModels.some((modelId) => !rows.has(modelId))) {
    throw new LiveBenchValidationError('cost model set must exactly match the table model set');
  }
  return rows;
}

/**
 * Convert one fully pinned upstream release into a bounded, source-only bundle.
 * It intentionally contains no editorial notes, no capability classifications,
 * and no synthesized multimodal score.
 */
export function parseLiveBenchRelease(input: ParseLiveBenchReleaseInput): LiveBenchReleaseBundle {
  // License evidence is intentionally not inferred from new-livebench. The
  // validated record remains caller-owned publication metadata.
  validateLiveBenchLicenseEvidence(input.licenseEvidence);
  const { categories, tasks } = parseCategories(input.categoriesJson);
  const taskIds = tasks.map((task) => task.taskId);
  const table = parseCsv(input.tableCsv);
  const { modelOrder, scoresByModel } = parseScoreRows(table, taskIds);
  const sourceLinks = parseModelLinks(input.modelLinksSource);
  const nameIndex = displayNameIndex(sourceLinks);
  const models = modelOrder.map((sourceModelId) => resolveModel(sourceModelId, sourceLinks, nameIndex));
  const cost = parseCsv(input.costCsv);
  const costRows = parseCostRows(cost, taskIds, modelOrder);

  const taskScores: LiveBenchTaskScore[] = [];
  const taskEconomics: LiveBenchTaskEconomics[] = [];
  for (const model of models) {
    const scores = scoresByModel.get(model.sourceModelId);
    const costRow = costRows.get(model.sourceModelId);
    if (!scores || !costRow) throw new LiveBenchValidationError(`missing source rows for ${model.sourceModelId}`);
    const meanInputTokens = parseOptionalDecimal(costRow.avg_input_tokens as string, `cost ${model.sourceModelId} avg_input_tokens`, 0);
    const meanOutputTokens = parseOptionalDecimal(costRow.avg_output_tokens as string, `cost ${model.sourceModelId} avg_output_tokens`, 0);
    const inputPriceUsdPerMillion = parseOptionalDecimal(costRow.input_price_per_million as string, `cost ${model.sourceModelId} input_price_per_million`, 0);
    const outputPriceUsdPerMillion = parseOptionalDecimal(costRow.output_price_per_million as string, `cost ${model.sourceModelId} output_price_per_million`, 0);
    for (const taskId of taskIds) {
      taskScores.push({
        configurationId: model.configurationId,
        taskId,
        score: scores[taskId] as number,
      });
      taskEconomics.push({
        configurationId: model.configurationId,
        taskId,
        questionCount: parsePositiveInteger(costRow[`nq_${taskId}`] as string, `cost ${model.sourceModelId} nq_${taskId}`),
        evaluationCostUsd: parseFiniteDecimal(costRow[taskId] as string, `cost ${model.sourceModelId} ${taskId}`, 0),
        inputPriceUsdPerMillion,
        outputPriceUsdPerMillion,
        meanInputTokens,
        meanOutputTokens,
      });
    }
  }

  return validateLiveBenchRelease({
    schemaVersion: 1,
    releaseId: input.releaseId,
    sourceCommit: input.sourceCommit,
    observedAt: input.observedAt,
    categories,
    tasks,
    models,
    taskScores,
    taskEconomics,
  });
}
