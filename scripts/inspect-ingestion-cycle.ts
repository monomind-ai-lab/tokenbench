import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

export type InspectIngestionScope = 'catalog' | 'benchmarks';

export interface InspectIngestionArgs {
  readonly scope: InspectIngestionScope;
}

export interface IngestionCycleInspection {
  readonly scope: InspectIngestionScope;
  readonly cycleId: string;
  readonly cadenceKey: string;
  readonly state: string;
  readonly phase: string;
  readonly cursor: number;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly activeRevision: string | null;
  readonly lastCompletedRevision: string | null;
}

type CommandExecutor = (command: string, args: readonly string[]) => Promise<string>;

const execFileAsync = promisify(execFile);
const MAX_WRANGLER_OUTPUT_BYTES = 256 * 1024;

function fail(message: string): never {
  throw new Error(message);
}

export function parseInspectIngestionArgs(argv: readonly string[]): InspectIngestionArgs {
  if (argv.length !== 2) {
    if (argv.length > 0 && argv[0] !== '--scope') fail(`unknown argument: ${argv[0]}`);
    if (argv.length > 2) fail(`unknown argument: ${argv[2]}`);
    fail('--scope must be supplied once with catalog|benchmarks');
  }
  if (argv[0] !== '--scope') fail(`unknown argument: ${argv[0]}`);
  if (argv[1] !== 'catalog' && argv[1] !== 'benchmarks') {
    fail('--scope must be catalog|benchmarks');
  }
  return { scope: argv[1] };
}

function requiredString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
    fail(`ingestion receipt is corrupt: ${key}`);
  }
  return value;
}

function nullableString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
    fail(`ingestion receipt is corrupt: ${key}`);
  }
  return value;
}

export function parseWranglerD1Json(raw: string): IngestionCycleInspection {
  if (new TextEncoder().encode(raw).byteLength > MAX_WRANGLER_OUTPUT_BYTES) {
    fail('D1 inspection output exceeds the safety bound');
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    fail('D1 inspection output is corrupt JSON');
  }
  if (!Array.isArray(payload) || payload.length === 0) fail('ingestion cycle is missing');
  if (payload.length !== 1 || typeof payload[0] !== 'object' || payload[0] === null) {
    fail('D1 inspection returned an unexpected result envelope');
  }
  const envelope = payload[0] as { success?: unknown; results?: unknown };
  if (envelope.success !== true) fail('D1 inspection failed');
  if (!Array.isArray(envelope.results) || envelope.results.length === 0) fail('ingestion cycle is missing');
  if (envelope.results.length !== 1 || typeof envelope.results[0] !== 'object' || envelope.results[0] === null) {
    fail('D1 inspection must return exactly one cycle');
  }
  const row = envelope.results[0] as Record<string, unknown>;
  const scope = requiredString(row, 'scope');
  if (scope !== 'catalog' && scope !== 'benchmarks') fail('ingestion receipt is corrupt: scope');
  const cursor = row.cursor;
  if (!Number.isSafeInteger(cursor) || (cursor as number) < 0) fail('ingestion receipt is corrupt: cursor');
  const startedAt = requiredString(row, 'startedAt');
  const updatedAt = requiredString(row, 'updatedAt');
  if (!Number.isFinite(Date.parse(startedAt)) || !Number.isFinite(Date.parse(updatedAt))) {
    fail('ingestion receipt is corrupt: timestamp');
  }
  return {
    scope,
    cycleId: requiredString(row, 'cycleId'),
    cadenceKey: requiredString(row, 'cadenceKey'),
    state: requiredString(row, 'state'),
    phase: requiredString(row, 'phase'),
    cursor: cursor as number,
    startedAt,
    updatedAt,
    activeRevision: nullableString(row, 'activeRevision'),
    lastCompletedRevision: nullableString(row, 'lastCompletedRevision'),
  };
}

function inspectionSql(scope: InspectIngestionScope): string {
  const activeRevisionSql = scope === 'catalog'
    ? "SELECT active_revision FROM catalog_publication_state WHERE singleton = 1"
    : "SELECT active_revision FROM benchmark_publication_state WHERE singleton = 1";
  return `WITH latest AS (
    SELECT scope, cycle_id, cadence_key, state, phase, cursor, started_at, updated_at
    FROM ingestion_cycles
    WHERE scope = '${scope}'
    ORDER BY updated_at DESC, cycle_id DESC
    LIMIT 1
  ), completed AS (
    SELECT final_revision
    FROM ingestion_cycles
    WHERE scope = '${scope}' AND state = 'published' AND final_revision IS NOT NULL
    ORDER BY completed_at DESC, updated_at DESC
    LIMIT 1
  )
  SELECT latest.scope AS scope, latest.cycle_id AS cycleId, latest.cadence_key AS cadenceKey,
    latest.state AS state, latest.phase AS phase, latest.cursor AS cursor,
    latest.started_at AS startedAt, latest.updated_at AS updatedAt,
    (${activeRevisionSql}) AS activeRevision,
    (SELECT final_revision FROM completed) AS lastCompletedRevision
  FROM latest`;
}

const defaultExecutor: CommandExecutor = async (command, args) => {
  const result = await execFileAsync(command, [...args], {
    cwd: resolve(import.meta.dirname, '..'),
    maxBuffer: MAX_WRANGLER_OUTPUT_BYTES,
    encoding: 'utf8',
  });
  return result.stdout;
};

export async function inspectIngestionCycle(
  args: InspectIngestionArgs,
  execute: CommandExecutor = defaultExecutor,
): Promise<IngestionCycleInspection> {
  const output = await execute('wrangler', [
    'd1', 'execute', 'ai-plan-catalog',
    '--remote',
    '--config', 'workers/benchmark-ingest/wrangler.toml',
    '--command', inspectionSql(args.scope),
    '--json',
  ]);
  return parseWranglerD1Json(output);
}

async function runCli(): Promise<void> {
  try {
    const result = await inspectIngestionCycle(parseInspectIngestionArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Unable to inspect ingestion cycle'}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void runCli();
}
