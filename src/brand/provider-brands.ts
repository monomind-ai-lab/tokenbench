export interface ProviderBrand {
  readonly domain: string | null;
  readonly label: string;
  readonly fallback: string;
}

const BRANDS: Readonly<Record<string, ProviderBrand>> = {
  openai: { domain: 'openai.com', label: 'OpenAI', fallback: 'O' },
  anthropic: { domain: 'anthropic.com', label: 'Anthropic', fallback: 'A' },
  google: { domain: 'google.com', label: 'Google', fallback: 'G' },
  xai: { domain: 'x.ai', label: 'xAI', fallback: 'X' },
  moonshot: { domain: 'moonshot.ai', label: 'Moonshot AI', fallback: 'M' },
};

/**
 * Add entries only after the exact model-family identity has been reviewed.
 * Until then, ModelMark deliberately inherits its verified provider mark.
 */
const MODEL_FAMILY_BRANDS: Readonly<Record<string, ProviderBrand>> = {};

function fallbackLabel(providerId: string): string {
  const normalized = providerId.trim().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  if (!normalized) return 'Unknown provider';
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

export function providerBrand(providerId: string): ProviderBrand {
  const normalizedId = providerId.trim().toLowerCase();
  const knownBrand = BRANDS[normalizedId];
  if (knownBrand) return knownBrand;

  const label = fallbackLabel(providerId);
  return { domain: null, label, fallback: label.charAt(0).toUpperCase() };
}

export function modelBrand(modelId: string): ProviderBrand | null {
  return MODEL_FAMILY_BRANDS[modelId] ?? null;
}
