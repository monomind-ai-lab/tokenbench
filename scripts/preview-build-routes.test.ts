import { resolveConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import { previewHtmlEntries } from './generate-preview-documents';

describe('preview build routes', () => {
  it('keeps prototype routes out of Vite HTML inputs until their delivery flag changes', async () => {
    const config = await resolveConfig({ configFile: 'vite.config.ts' }, 'build', 'production');
    const inputs = config.build.rollupOptions.input as Record<string, string>;

    expect(previewHtmlEntries(process.cwd())).toEqual({});
    expect(Object.keys(inputs)).not.toContain('preview-home-index-html');
  });
});
