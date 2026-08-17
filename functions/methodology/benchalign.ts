interface PreviewRouteContext {
  readonly env: { readonly CF_PAGES_BRANCH?: string };
  readonly next: () => Promise<Response>;
}

export async function onRequest({ env, next }: PreviewRouteContext): Promise<Response> {
  if (env.CF_PAGES_BRANCH !== 'ui-revamp-3') return next();

  return new Response('Not Found', {
    status: 404,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
