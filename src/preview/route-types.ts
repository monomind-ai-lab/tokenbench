import type { ComponentType } from 'react';
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

export interface PreviewRouteMatch {
  readonly routeId: PreviewRouteId;
  readonly pathname: string;
  readonly search: URLSearchParams;
  readonly hash: string;
  readonly params: Readonly<Record<string, string>>;
}

export interface PreviewPayloadDefinition {
  readonly key: string;
}

export interface PreviewPageProps {
  readonly match: PreviewRouteMatch;
}

export interface PreviewRoute {
  readonly id: PreviewRouteId;
  readonly match: (url: URL) => PreviewRouteMatch | null;
  readonly outputPathname: string;
  readonly delivery: 'prototype' | 'react';
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
