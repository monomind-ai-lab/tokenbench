import { describe, expect, it } from 'vitest';
import { renderPreviewQueryDocument } from './preview-query-document';

describe('renderPreviewQueryDocument', () => {
  it('does not render default Models evidence for a filtered workbench request', async () => {
    const accepted = await renderPreviewQueryDocument(
      new Request('https://tokenbench.test/models'),
      'models',
    );
    const unavailable = await renderPreviewQueryDocument(
      new Request('https://tokenbench.test/models?provider=OpenAI'),
      'models',
    );

    const acceptedHtml = await accepted.text();
    const unavailableHtml = await unavailable.text();
    expect(acceptedHtml).toContain('<h1 id="models-workbench-heading">Models workbench</h1>');
    expect(unavailableHtml).toContain('<h1>Model data unavailable</h1>');
    expect(unavailableHtml).toContain('does not match the requested query');
    expect(unavailableHtml).not.toContain('ALPHA');
  });

  it('renders the requested article channel in the first document', async () => {
    const response = await renderPreviewQueryDocument(
      new Request('https://tokenbench.test/articles?channel=guides'),
      'articles',
    );

    const html = await response.text();
    expect(html).toContain('id="article-tab-guides" aria-controls="article-index" aria-selected="true"');
    expect(html).toContain('id="articles-initial-data" type="application/json">{"channel":"guides"}</script>');
  });

  it('makes an unsupported weighted-ranking state explicit without default results', async () => {
    const response = await renderPreviewQueryDocument(
      new Request('https://tokenbench.test/make-it-yours/?access=open'),
      'make-it-yours',
    );

    const html = await response.text();
    expect(html).toContain('does not match the requested query');
    expect(html).not.toContain('Weighted score ranking');
  });

  it('makes a non-retained subscription workload explicit without default totals', async () => {
    const response = await renderPreviewQueryDocument(
      new Request('https://tokenbench.test/subscribe-vs-api?seats=1'),
      'subscribe-vs-api',
    );

    const html = await response.text();
    expect(html).toContain('does not match the requested query');
    expect(html).not.toContain('Monthly subscription');
  });

  it('keeps the exact retained profile request and makes an unsupported profile explicit', async () => {
    const accepted = await renderPreviewQueryDocument(
      new Request('https://tokenbench.test/model-profile?model=alpha'),
      'model-profile',
    );
    const unavailable = await renderPreviewQueryDocument(
      new Request('https://tokenbench.test/model-profile?model=beta'),
      'model-profile',
    );

    const acceptedHtml = await accepted.text();
    const unavailableHtml = await unavailable.text();
    expect(acceptedHtml).toContain('<h1>ALPHA</h1>');
    expect(unavailableHtml).toContain('<h1>Model profile unavailable</h1>');
    expect(unavailableHtml).toContain('does not match the requested query');
  });

  it('keeps the retained comparison order and makes reordered requests explicit', async () => {
    const accepted = await renderPreviewQueryDocument(
      new Request('https://tokenbench.test/compare?models=alpha,beta,gamma'),
      'compare',
    );
    const unavailable = await renderPreviewQueryDocument(
      new Request('https://tokenbench.test/compare?models=beta,alpha'),
      'compare',
    );

    const acceptedHtml = await accepted.text();
    const unavailableHtml = await unavailable.text();
    expect(acceptedHtml).toContain('Capability comparison radar for ALPHA, BETA, GAMMA');
    expect(unavailableHtml).toContain('Unavailable model (beta)');
    expect(unavailableHtml).toContain('Unavailable model (alpha)');
    expect(unavailableHtml).toContain('does not match the requested query');
  });
});
