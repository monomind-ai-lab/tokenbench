import { resolveConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import { previewHtmlEntries } from './generate-preview-documents';

describe('preview build routes', () => {
  it('provides Vite HTML inputs only for the React-delivered Home and Popular Models routes', async () => {
    const config = await resolveConfig({ configFile: 'vite.config.ts' }, 'build', 'production');
    const inputs = config.build.rollupOptions.input as Record<string, string>;
    const entries = previewHtmlEntries(process.cwd());

    expect(entries).toMatchObject({
      'preview-home-index-html': `${process.cwd()}/index.html`,
      'preview-popular-models-popular-models-index-html': `${process.cwd()}/popular-models/index.html`,
    });
    expect(Object.keys(inputs)).toEqual(expect.arrayContaining([
      'preview-home-index-html',
      'preview-popular-models-popular-models-index-html',
    ]));
    expect(Object.keys(inputs)).not.toContain('preview-llm-price-performance-llm-price-performance-index-html');
  });
});
