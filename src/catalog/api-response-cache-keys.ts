import { BOOTSTRAP_CATALOG } from './bootstrap';

const catalogCachePrefix = `catalog:bootstrap:${BOOTSTRAP_CATALOG.revision}`;

/**
 * The checked-in subscription overlay is part of every materialized catalog
 * response. Version its lookup key so a Pages deploy cannot reuse a body that
 * was generated with an older overlay.
 */
export function catalogApiCacheKey(providerId: string | null): string {
  return providerId ? `${catalogCachePrefix}:provider:${providerId}` : catalogCachePrefix;
}

/** The common empty-provider response is versioned with the same overlay. */
export function catalogApiEmptyProviderCacheKey(): string {
  return `${catalogCachePrefix}:provider-empty`;
}
