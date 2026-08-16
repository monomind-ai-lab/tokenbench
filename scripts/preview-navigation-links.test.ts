import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const prototypeRoot = 'prototypes/ui-revamp-3';

describe('preview navigation links', () => {
  it('keeps the vanilla shell on preview destinations', async () => {
    const shell = await readFile(`${prototypeRoot}/common.js`, 'utf8');

    expect(shell).toContain("compare:'/compare'");
    expect(shell).toContain("modelProfile:'/model-profile'");
    expect(shell).toContain("makeItYours:'/make-it-yours'");
    expect(shell).not.toContain('https://tokenbench.monomind.one/models/');
    expect(shell).not.toContain('href="/models/"');
    expect(shell).not.toContain('href="/compare/"');
    expect(shell).not.toContain('href="/make-it-yours/"');
  });

  it('does not leave prototype content links pointing at production guide pages', async () => {
    const [articles, articleDetail] = await Promise.all([
      readFile(`${prototypeRoot}/articles.html`, 'utf8'),
      readFile(`${prototypeRoot}/article-hybrid-router.html`, 'utf8'),
    ]);

    for (const document of [articles, articleDetail]) {
      expect(document).not.toMatch(/href="https:\/\/tokenbench\.monomind\.one\/guides\//);
      expect(document).not.toContain('href="index.html"');
      expect(document).not.toContain('href="compare.html"');
      expect(document).not.toContain('href="article-hybrid-router.html"');
    }
  });

});
