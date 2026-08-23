/**
 * JSON 404 for any `/api/*` path no specific Function claims.
 *
 * Cloudflare Pages falls through to the SPA shell for unmatched paths, and with
 * no `404.html` present that shell is served at HTTP 200. An API client that
 * branches on `response.ok` therefore treats the HTML document as a successful
 * JSON response and fails while parsing it, which reads as a data defect rather
 * than a missing route.
 *
 * Pages resolves more specific routes ahead of a `[[path]]` catch-all, so every
 * real endpoint keeps its own handler; only genuinely unmatched `/api/*` paths
 * reach this one. It deliberately does not serve the versioned data envelope: no
 * source was consulted, so there is no receipt to report.
 */
function notFound(request: Request): Response {
  const { pathname } = new URL(request.url);
  return new Response(
    JSON.stringify({
      error: {
        code: 'not_found',
        message: `No TokenBench API endpoint is published at ${pathname}.`,
      },
    }),
    {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      },
    },
  );
}

export function onRequest({ request }: { request: Request }): Response {
  return notFound(request);
}
