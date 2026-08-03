import { describe, expect, it } from 'vitest';
import * as runtimeTypes from './types';
import { BOOTSTRAP_CATALOG } from './catalog/bootstrap';
import { validateCatalogResponse } from './catalog/validation';

describe('legacy frontend type module', () => {
  it('exports language choices only and the production bootstrap is source-linked', () => {
    expect(runtimeTypes).not.toHaveProperty('PROVIDERS');
    expect(validateCatalogResponse(BOOTSTRAP_CATALOG)).toBe(BOOTSTRAP_CATALOG);
  });
});
