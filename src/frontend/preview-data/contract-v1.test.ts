import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import {
  isStrictCalendarDate,
  isStrictUtcTimestamp,
  parseUiDataContractV1,
  type UiDataContractV1Method,
} from './contract-v1';

const contractRoot = resolve(process.cwd(), 'contracts/ui-data-contract/v1');

type JsonRecord = Record<string, unknown>;

interface ContractSchema extends JsonRecord {
  readonly $id: string;
}

interface ContractMetaSchema extends JsonRecord {
  readonly $id: string;
}

interface AcceptedArtifact {
  readonly classification: 'method_response' | 'mixed_source' | 'unavailable' | 'expected_rejection';
  readonly expected: {
    readonly errorCode: 'invalid_timestamp' | 'unsupported_contract_version' | null;
    readonly outcome: 'accept' | 'reject';
  };
  readonly id: string;
  readonly method: UiDataContractV1Method;
  readonly path: string;
  readonly schemaRef: string;
}

interface EvidenceManifest {
  readonly artifacts: readonly AcceptedArtifact[];
  readonly contractVersion: 'ui-data-contract/v1';
  readonly frontendBaselineCommit: string;
  readonly producerCommitSha: string;
}

function readContractFile<T>(path: string): T {
  const relativePath = path.startsWith('contracts/ui-data-contract/v1/')
    ? path.slice('contracts/ui-data-contract/v1/'.length)
    : path;
  return JSON.parse(readFileSync(resolve(contractRoot, relativePath), 'utf8')) as T;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function schemaValidator(schema: ContractSchema, metaSchema: ContractMetaSchema, schemaRef: string) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, validateFormats: true });
  ajv.addFormat('date-time', { type: 'string', validate: isStrictUtcTimestamp });
  ajv.addFormat('date', { type: 'string', validate: isStrictCalendarDate });
  ajv.addMetaSchema(metaSchema);
  ajv.addSchema(schema);
  const validate = ajv.getSchema(`${schema.$id}${schemaRef}`);
  if (!validate) throw new Error(`Manifest schema reference did not resolve: ${schemaRef}`);
  return validate;
}

const schema = readContractFile<ContractSchema>('schema.json');
const metaSchema = readContractFile<ContractMetaSchema>('meta-schema.json');
const manifest = readContractFile<EvidenceManifest>('evidence/manifest.json');
const acceptedArtifacts = manifest.artifacts.filter((artifact) => artifact.expected.outcome === 'accept');
const rejectedArtifacts = manifest.artifacts.filter((artifact) => artifact.expected.outcome === 'reject');

describe('parseUiDataContractV1 accepted pipeline boundary', () => {
  it.each(acceptedArtifacts)(
    'validates the accepted $id $method envelope without changing its accepted facts',
    (artifact) => {
      const candidate = readContractFile<unknown>(artifact.path);
      const validate = schemaValidator(schema, metaSchema, artifact.schemaRef);

      expect(validate(candidate), `${artifact.path}: ${JSON.stringify(validate.errors)}`).toBe(true);
      expect(parseUiDataContractV1(candidate, artifact.method)).toEqual(candidate);
    },
  );

  it('retains producer, baseline, six-method, mixed-source, and unavailable acceptance evidence', () => {
    expect(manifest).toMatchObject({
      contractVersion: 'ui-data-contract/v1',
      producerCommitSha: 'ac42000893fa2e15d0ae76f7f83ebcea5745f7b5',
      frontendBaselineCommit: '5d649d315a0bdb052e90bb96d6b7e94544f9ad31',
    });
    expect(new Set(acceptedArtifacts.filter((artifact) => artifact.classification === 'method_response').map((artifact) => artifact.method))).toEqual(
      new Set(['models', 'profile', 'lifecycle', 'rankings', 'comparison', 'subscription']),
    );

    const mixedSource = readContractFile<JsonRecord>('evidence/responses/rankings.mixed-source.json');
    const parsed = parseUiDataContractV1(mixedSource, 'rankings');
    const sources = parsed.sources;

    expect(parsed.effectiveAt).toBeNull();
    expect(new Set(sources.map((source) => source.effectiveAt))).toEqual(new Set([
      '2026-08-18T00:00:00.000Z',
      '2026-08-17T00:00:00.000Z',
    ]));

    const unavailable = parseUiDataContractV1(readContractFile<unknown>('evidence/responses/profile.unavailable.json'), 'profile');
    expect(unavailable).toMatchObject({ status: 'unavailable', effectiveAt: null, data: null });
  });

  it.each(rejectedArtifacts)('rejects $id with the stable $expected.errorCode code', (artifact) => {
    const candidate = readContractFile<unknown>(artifact.path);
    const validate = schemaValidator(schema, metaSchema, artifact.schemaRef);

    expect(validate(candidate)).toBe(false);
    expect(() => parseUiDataContractV1(candidate, artifact.method)).toThrow(
      expect.objectContaining({ code: artifact.expected.errorCode }),
    );
  });

  it('rejects malformed nested producer data before any page-view-model mapping occurs', () => {
    const malformed = clone(readContractFile<JsonRecord>('evidence/responses/models.json'));
    const models = malformed.data as JsonRecord;
    const firstModel = (models.models as JsonRecord[])[0]!;
    (firstModel.identity as JsonRecord).displayName = 42;

    const validate = schemaValidator(schema, metaSchema, '#/$defs/modelsEnvelope');
    expect(validate(malformed)).toBe(false);
    expect(() => parseUiDataContractV1(malformed, 'models')).toThrow();
  });
});
