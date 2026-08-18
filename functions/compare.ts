import { renderPreviewQueryDocument } from './_shared/preview-query-document';

export function onRequestGet({ request }: { request: Request }): Promise<Response> {
  return renderPreviewQueryDocument(request, 'compare');
}
