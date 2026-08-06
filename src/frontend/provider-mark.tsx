import { useEffect, useState } from 'react';
import { modelBrand, providerBrand } from '../brand/provider-brands';
import type { ProviderBrand } from '../brand/provider-brands';

declare global {
  interface ImportMeta {
    readonly env: Record<string, string | undefined>;
  }
}

type MarkSize = 20 | 24 | 32;
type MarkTheme = 'light' | 'dark';
type MarkLoading = 'eager' | 'lazy';

interface MarkProps {
  readonly size?: MarkSize;
  readonly theme?: MarkTheme;
  readonly decorative?: boolean;
  readonly loading?: MarkLoading;
}

export interface ProviderMarkProps extends MarkProps {
  readonly providerId: string;
  readonly providerName: string;
}

export interface ModelMarkProps extends MarkProps {
  readonly modelId: string;
  readonly providerId: string;
  readonly providerName: string;
}

function logoUrl(brand: ProviderBrand, theme: MarkTheme, size: MarkSize): string | null {
  const clientId = import.meta.env?.VITE_BRANDFETCH_CLIENT_ID;
  if (!brand.domain || !clientId) return null;
  return `https://cdn.brandfetch.io/${brand.domain}/w/${size}/h/${size}/theme/${theme}/icon?c=${encodeURIComponent(clientId)}`;
}

function BrandMark({ brand, label, size = 20, theme = 'light', decorative = false, loading = 'lazy' }: MarkProps & { readonly brand: ProviderBrand; readonly label: string }) {
  const [clientReady, setClientReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const imageSource = clientReady ? logoUrl(brand, theme, size) : null;
  const brandIdentity = `${brand.domain ?? ''}:${brand.label}:${brand.fallback}`;

  useEffect(() => setClientReady(true), []);
  useEffect(() => setImageFailed(false), [brandIdentity, imageSource]);

  const source = imageFailed ? null : imageSource;

  if (source) {
    return (
      <img
        className="provider-mark"
        src={source}
        width={size}
        height={size}
        loading={loading}
        decoding="async"
        alt={decorative ? '' : label}
        aria-hidden={decorative || undefined}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <span
      className="provider-mark provider-mark-fallback"
      style={{ width: `${size}px`, height: `${size}px` }}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
    >
      {brand.fallback}
    </span>
  );
}

export function ProviderMark({ providerId, providerName, size, theme, decorative, loading }: ProviderMarkProps) {
  return <BrandMark brand={providerBrand(providerId)} label={providerName} size={size} theme={theme} decorative={decorative} loading={loading} />;
}

export function ModelMark({ modelId, providerId, providerName, size, theme, decorative, loading }: ModelMarkProps) {
  const reviewedModelBrand = modelBrand(modelId);
  if (!reviewedModelBrand) {
    return <ProviderMark providerId={providerId} providerName={providerName} size={size} theme={theme} decorative={decorative} loading={loading} />;
  }
  return <BrandMark brand={reviewedModelBrand} label={reviewedModelBrand.label} size={size} theme={theme} decorative={decorative} loading={loading} />;
}
