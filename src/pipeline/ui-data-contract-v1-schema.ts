import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv';
import { isCanonicalIsoTimestamp } from '../benchmarks/contracts';

type JsonSchema = Record<string, unknown>;

const metaSchema = JSON.parse(readFileSync(
  'contracts/ui-data-contract/v1/meta-schema.json',
  'utf8',
)) as JsonSchema;
const schema = JSON.parse(readFileSync(
  'contracts/ui-data-contract/v1/schema.json',
  'utf8',
)) as JsonSchema & { readonly $id: string };

function isStrictCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month! - 1
    && parsed.getUTCDate() === day;
}

export function createUiDataContractV1SchemaValidator(schemaRef: string): ValidateFunction {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictTypes: false,
    validateFormats: true,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false,
  });
  ajv.addFormat('date-time', { type: 'string', validate: isCanonicalIsoTimestamp });
  ajv.addFormat('date', { type: 'string', validate: isStrictCalendarDate });
  ajv.addMetaSchema(metaSchema);
  ajv.addSchema(schema);
  const validate = ajv.getSchema(`${schema.$id}${schemaRef}`);
  if (!validate) throw new Error(`Schema reference did not resolve: ${schemaRef}`);
  return validate;
}
