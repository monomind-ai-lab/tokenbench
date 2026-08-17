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

function readExample<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(contractRoot, 'examples', `${name}.json`), 'utf8')) as T;
}

function readContractFile<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(contractRoot, path), 'utf8')) as T;
}

type JsonRecord = Record<string, unknown>;

interface ContractSchema extends JsonRecord {
  readonly $id: string;
  readonly $schema: string;
}

interface ContractMetaSchema extends JsonRecord {
  readonly $id: string;
  readonly $schema: string;
  readonly $vocabulary: Readonly<Record<string, boolean>>;
}

interface ManifestEntry {
  readonly method: UiDataContractV1Method;
  readonly file: string;
  readonly schemaRef: string;
  readonly classification: 'positive consumer example' | 'expected rejection';
}

interface Manifest {
  readonly examples: readonly ManifestEntry[];
}

const schema = readContractFile<ContractSchema>('schema.json');
const metaSchema = readContractFile<ContractMetaSchema>('meta-schema.json');
const manifest = readContractFile<Manifest>('examples/manifest.json');

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function schemaValidator(schemaRef: string) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, validateFormats: true });
  ajv.addFormat('date-time', { type: 'string', validate: isStrictUtcTimestamp });
  ajv.addFormat('date', { type: 'string', validate: isStrictCalendarDate });
  ajv.addMetaSchema(metaSchema);
  ajv.addSchema(schema);
  const validate = ajv.getSchema(`${schema.$id}${schemaRef}`);
  if (!validate) throw new Error(`Manifest schema reference did not resolve: ${schemaRef}`);
  return validate;
}

function expectSchemaAndParserParity(
  value: unknown,
  method: UiDataContractV1Method,
  expectedValid: boolean,
): void {
  const validate = schemaValidator(`#/$defs/${method}Envelope`);
  expect(validate(value), JSON.stringify(validate.errors)).toBe(expectedValid);
  if (expectedValid) {
    expect(() => parseUiDataContractV1(value, method)).not.toThrow();
  } else {
    expect(() => parseUiDataContractV1(value, method)).toThrow();
  }
}

const examples = {
  models: readExample<unknown>('models'),
  profile: readExample<unknown>('profile'),
  lifecycle: readExample<unknown>('lifecycle'),
  rankings: readExample<unknown>('rankings'),
  comparison: readExample<unknown>('comparison'),
  subscription: readExample<unknown>('subscription'),
  mixedSource: readExample<unknown>('mixed-source'),
  unsupportedVersion: readExample<unknown>('unsupported-version'),
};

const methods: readonly UiDataContractV1Method[] = [
  'models',
  'profile',
  'lifecycle',
  'rankings',
  'comparison',
  'subscription',
];

describe('parseUiDataContractV1', () => {
  it.each(methods)(
    'parses the proposed %s example without a page-specific transformation',
    (method) => {
      const parsed = parseUiDataContractV1(examples[method], method);

      expect(parsed.contractVersion).toBe('ui-data-contract/v1');
      expect(parsed).toEqual(examples[method]);
    },
  );

  it('preserves mixed-source and unavailable evidence verbatim', () => {
    const parsed = parseUiDataContractV1(examples.mixedSource, 'rankings');

    expect(parsed.effectiveAt).toBeNull();
    expect(new Set(parsed.provenance.map((source) => source.effectiveAt)).size).toBeGreaterThan(1);
    expect(JSON.stringify(parsed)).toContain('No approved source');
  });

  it('rejects unsupported versions and invalid UTC timestamps', () => {
    expect(() => parseUiDataContractV1(examples.unsupportedVersion, 'models'))
      .toThrow(/Unsupported UI data contract version/);
    expect(() => parseUiDataContractV1({
      ...readExample<Record<string, unknown>>('models'),
      fetchedAt: '2026-08-17T12:00:00+08:00',
    }, 'models')).toThrow(/UTC ISO-8601 timestamp/);
    expect(() => parseUiDataContractV1({
      ...readExample<Record<string, unknown>>('models'),
      fetchedAt: '2026-02-30T00:00:00.000Z',
    }, 'models')).toThrow(/UTC ISO-8601 timestamp/);
  });

  it('rejects envelope fields not declared by the proposed schema', () => {
    expect(() => parseUiDataContractV1({
      ...readExample<Record<string, unknown>>('models'),
      cacheNamespace: 'internal-only',
    }, 'models')).toThrow(/undeclared envelope field/);
  });

  it('rejects unavailable evidence with an empty reason', () => {
    const comparison = readExample<Record<string, unknown>>('comparison');
    const data = comparison.data as { unavailableModelIds: unknown[] };

    expect(() => parseUiDataContractV1({
      ...comparison,
      data: {
        ...data,
        unavailableModelIds: [{ availability: 'unavailable', reason: '' }],
      },
    }, 'comparison')).toThrow(/non-empty reason/);
  });

  it('rejects impossible nested calendar dates', () => {
    const invalidRelease = clone(examples.models) as JsonRecord;
    const releaseModel = ((invalidRelease.data as JsonRecord).models as JsonRecord[])[0]!;
    const identityProvenance = (releaseModel.identity as JsonRecord).provenance;
    releaseModel.benchmark = {
      availability: 'available',
      value: { releaseOn: '2026-02-30', subtasks: [] },
      provenance: identityProvenance,
    };

    const invalidSunset = clone(examples.lifecycle) as JsonRecord;
    const lifecycleModel = ((invalidSunset.data as JsonRecord).models as JsonRecord[])[0]!;
    const sunset = ((lifecycleModel.lifecycle as JsonRecord).value as JsonRecord).sunsetOn as JsonRecord;
    sunset.value = '2026-02-30';

    expect(() => parseUiDataContractV1(invalidRelease, 'models')).toThrow(/calendar date/);
    expect(() => parseUiDataContractV1(invalidSunset, 'lifecycle')).toThrow(/calendar date/);
  });
});

describe('published ui-data-contract/v1 schema', () => {
  it('declares date and date-time formats as required assertions', () => {
    expect(metaSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.$schema).toBe(metaSchema.$id);
    expect(metaSchema.$vocabulary).toMatchObject({
      'https://json-schema.org/draft/2020-12/vocab/format-assertion': true,
    });
  });

  it('resolves every manifest example through the published schema', () => {
    for (const entry of manifest.examples) {
      const validate = schemaValidator(entry.schemaRef);
      const value = readContractFile<unknown>(`examples/${entry.file}`);
      expect(validate(value), `${entry.file}: ${JSON.stringify(validate.errors)}`)
        .toBe(entry.classification === 'positive consumer example');
    }
  });

  it('keeps parser and schema status/effective-time rules in parity', () => {
    const availableWithNullTime = clone(examples.models) as JsonRecord;
    availableWithNullTime.status = 'available';
    availableWithNullTime.effectiveAt = null;

    const unavailableWithTime = clone(examples.models) as JsonRecord;
    unavailableWithTime.status = 'unavailable';
    unavailableWithTime.reason = 'No approved source for the requested surface';
    unavailableWithTime.data = null;

    const partialWithIndependentTime = clone(examples.models) as JsonRecord;
    partialWithIndependentTime.effectiveAt = '2026-08-09T00:00:00.000Z';

    expectSchemaAndParserParity(availableWithNullTime, 'models', false);
    expectSchemaAndParserParity(unavailableWithTime, 'models', false);
    expectSchemaAndParserParity(examples.mixedSource, 'rankings', true);
    expectSchemaAndParserParity(partialWithIndependentTime, 'models', true);
  });

  it('rejects impossible envelope, provenance, and nested dates through both boundaries', () => {
    const invalidEnvelopeTime = clone(examples.models) as JsonRecord;
    invalidEnvelopeTime.fetchedAt = '2026-02-30T00:00:00.000Z';

    const invalidProvenanceTime = clone(examples.models) as JsonRecord;
    ((invalidProvenanceTime.provenance as JsonRecord[])[0]!).effectiveAt = '2026-02-30T00:00:00.000Z';

    const invalidRelease = clone(examples.models) as JsonRecord;
    const releaseModel = ((invalidRelease.data as JsonRecord).models as JsonRecord[])[0]!;
    releaseModel.benchmark = {
      availability: 'available',
      value: { releaseOn: '2026-02-30', subtasks: [] },
      provenance: (releaseModel.identity as JsonRecord).provenance,
    };

    const invalidSunset = clone(examples.lifecycle) as JsonRecord;
    const lifecycleModel = ((invalidSunset.data as JsonRecord).models as JsonRecord[])[0]!;
    (((lifecycleModel.lifecycle as JsonRecord).value as JsonRecord).sunsetOn as JsonRecord).value = '2026-02-30';

    expectSchemaAndParserParity(invalidEnvelopeTime, 'models', false);
    expectSchemaAndParserParity(invalidProvenanceTime, 'models', false);
    expectSchemaAndParserParity(invalidRelease, 'models', false);
    expectSchemaAndParserParity(invalidSunset, 'lifecycle', false);
  });
});
