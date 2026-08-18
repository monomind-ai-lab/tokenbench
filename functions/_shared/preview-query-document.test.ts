import { describe, expect, it } from 'vitest';
import { renderPreviewQueryDocument } from './preview-query-document';

describe('renderPreviewQueryDocument', () => {
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
