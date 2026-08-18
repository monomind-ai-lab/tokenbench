import { renderToString } from 'react-dom/server';
import { PageFrame } from '../frontend/page-frame';
import { documentHtml, headMarkup } from '../seo/static-page';
import type { PreviewRoute, PreviewRouteMatch } from './route-types';

export interface PreviewDocumentOptions {
  readonly assets?: {
    readonly script: string;
    readonly stylesheet: string;
  };
}

/** Renders one manifest route as a static React document that can later hydrate. */
export function renderPreviewDocument(
  route: PreviewRoute,
  match: PreviewRouteMatch,
  data: unknown,
  options: PreviewDocumentOptions = {},
): string {
  const body = renderToString(
    <PageFrame shell={route.shell}>
      <route.Page match={match} data={data} />
    </PageFrame>,
  );

  return documentHtml(
    headMarkup(route.metadata(match), [...route.structuredData(match)]),
    body,
    {
      assets: options.assets,
      payload: data === undefined
        ? undefined
        : { id: route.payload?.key ?? 'preview-initial-data', value: data },
    },
  );
}
