import type { ComponentType, ReactElement } from 'react';
import type { SiteNavigationPage } from '../routing/routes';
import type { PageMetadata } from '../seo/metadata';

export type PreviewRouteId =
  | 'home'
  | 'models'
  | 'model-profile'
  | 'model-lifecycle'
  | 'popular-models'
  | 'make-it-yours'
  | 'compare'
  | 'subscribe-vs-api'
  | 'articles'
  | 'article-detail'
  | 'llm-price-performance';

export type PreviewRuntimeRouteId =
  | 'comparison-detail'
  | 'model-profile-detail';

export type PreviewPrototypeMountPolicy = 'preserve' | 'popular-models-workbench';

export type PreviewClientRouteId = PreviewRouteId | PreviewRuntimeRouteId;

export interface PreviewRouteMatch {
  readonly routeId: PreviewRouteId;
  readonly pathname: string;
  readonly search: URLSearchParams;
  readonly hash: string;
  readonly params: Readonly<Record<string, string>>;
}

export interface PreviewRuntimeRouteMatch {
  readonly routeId: PreviewRuntimeRouteId;
  readonly pathname: string;
  readonly search: URLSearchParams;
  readonly hash: string;
  readonly params: Readonly<Record<string, string>>;
}

export interface PreviewPayloadDefinition {
  readonly key: string;
  readonly parse: (value: unknown) => unknown | null;
}

export type PreviewDocumentReadiness =
  | { readonly status: 'ready' }
  | { readonly status: 'blocked'; readonly reason: string };

export interface PreviewPageProps {
  readonly match: PreviewRouteMatch;
  readonly data?: unknown;
}

export interface PreviewRoute {
  readonly id: PreviewRouteId;
  readonly match: (url: URL) => PreviewRouteMatch | null;
  readonly outputPathname: string;
  readonly delivery: 'prototype' | 'react';
  readonly prototypeMount: PreviewPrototypeMountPolicy;
  readonly documentReadiness: PreviewDocumentReadiness;
  readonly shell: {
    readonly activePage: SiteNavigationPage;
    readonly skipLinkTarget: string;
    readonly skipLinkLabel: string;
  };
  readonly metadata: (match: PreviewRouteMatch) => PageMetadata;
  readonly structuredData: (match: PreviewRouteMatch) => readonly unknown[];
  readonly staticData: (match: PreviewRouteMatch) => Promise<unknown | undefined>;
  readonly payload: PreviewPayloadDefinition | null;
  readonly Page: ComponentType<PreviewPageProps>;
}

/** Runtime-only SSR routes are deliberately excluded from static preview output. */
export interface PreviewRuntimeRoute {
  readonly id: PreviewRuntimeRouteId;
  readonly match: (url: URL) => PreviewRuntimeRouteMatch | null;
  readonly payload: PreviewPayloadDefinition;
  readonly render: (data: unknown) => ReactElement;
}

export interface PreviewStaticEntry {
  readonly routeId: PreviewRouteId;
  readonly delivery: 'prototype' | 'react';
  readonly source: 'prototype-bundle' | 'generated-guide';
  readonly outputPathname: string;
  readonly output: readonly string[];
  readonly document: string | undefined;
  readonly clearOutputDirectory: boolean;
  readonly match: PreviewRouteMatch;
}
