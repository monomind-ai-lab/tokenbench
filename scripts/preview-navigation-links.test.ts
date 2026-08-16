import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const prototypeRoot = 'prototypes/ui-revamp-3';

describe('preview navigation links', () => {
  it('keeps the vanilla shell on the approved preview destinations', async () => {
    const shell = await readFile(`${prototypeRoot}/common.js`, 'utf8');

    expect(shell).toContain("home:'/models'");
    expect(shell).toContain("models:'/models'");
    expect(shell).toContain("modelCatalog:'/models#catalog'");
    expect(shell).toContain("popularModels:'/popular-models/'");
    expect(shell).toContain("compare:'/compare'");
    expect(shell).not.toContain("compare:'/compare/'");
    expect(shell).toContain("modelProfile:'/model-profile'");
    expect(shell).toContain("makeItYours:'/make-it-yours/'");
    expect(shell).toContain("articles:'/articles'");
    expect(shell).toContain("articleDetail:'/articles/hybrid-router'");
    expect(shell).toContain("cost:'/cost'");
    expect(shell).toContain("costCalculator:'/cost/calculator'");
    expect(shell).toContain("costBreakeven:'/cost/breakeven'");
    expect(shell).not.toContain('https://tokenbench.monomind.one/models/');
    expect(shell).not.toContain('href="/models/"');
    expect(shell).not.toContain('href="/compare/"');
  });

  it('keeps article content on the approved preview routes', async () => {
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
    expect(articles).toContain('href="/articles/hybrid-router"');
    expect(articles).not.toContain('href="/article-hybrid-router"');
    expect(articleDetail).toContain('href="/models"');
    expect(articleDetail).toContain('href="/make-it-yours/"');
    expect(articleDetail).toContain('href="/articles"');
  });

  it('publishes legacy redirects to the approved canonical preview routes', async () => {
    const redirects = await readFile('public/_redirects', 'utf8');

    expect(redirects).toContain('/ /models 301');
    expect(redirects).toContain('/article-hybrid-router /articles/hybrid-router 301');
    expect(redirects).toContain('/custom-leaderboard /make-it-yours/ 301');
  });

});
