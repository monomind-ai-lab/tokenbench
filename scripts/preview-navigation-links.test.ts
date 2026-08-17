import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const prototypeRoot = 'prototypes/ui-revamp-3';

describe('preview navigation links', () => {
  it('keeps the vanilla shell on the approved preview destinations', async () => {
    const shell = await readFile(`${prototypeRoot}/common.js`, 'utf8');

    expect(shell).toContain("home:'/'");
    expect(shell).toContain("models:'/models'");
    expect(shell).toContain("modelCatalog:'/models#catalog'");
    expect(shell).toContain("popularModels:'/popular-models/'");
    expect(shell).toContain("compare:'/compare'");
    expect(shell).not.toContain("compare:'/compare/'");
    expect(shell).toContain("modelProfile:'/model-profile'");
    expect(shell).toContain("makeItYours:'/make-it-yours/'");
    expect(shell).toContain("articles:'/articles'");
    expect(shell).toContain("articleDetail:'/articles/hybrid-router'");
    expect(shell).toContain("cost:'/subscribe-vs-api'");
    expect(shell).not.toContain("costCalculator:'/cost/calculator'");
    expect(shell).not.toContain("costBreakeven:'/cost/breakeven'");
    expect(shell).toContain("const currentPage=current.replace(/\\.html$/,'');");
    expect(shell).toContain("const leaderboardActive=['make-it-yours','popular-models'].includes(currentPage);");
    expect(shell).toContain("const costActive=['subscribe-vs-api'].includes(currentPage);");
    expect(shell).not.toContain('https://tokenbench.monomind.one/models/');
    expect(shell).not.toContain('href="/models/"');
    expect(shell).not.toContain('href="/compare/"');
  });

  it('keeps article content on the approved preview routes', async () => {
    const [home, articles, articleDetail] = await Promise.all([
      readFile(`${prototypeRoot}/home.html`, 'utf8'),
      readFile(`${prototypeRoot}/articles.html`, 'utf8'),
      readFile(`${prototypeRoot}/article-hybrid-router.html`, 'utf8'),
    ]);

    for (const document of [articles, articleDetail]) {
      expect(document).not.toMatch(/href="https:\/\/tokenbench\.monomind\.one\/guides\//);
      expect(document).not.toContain('href="index.html"');
      expect(document).not.toContain('href="compare.html"');
      expect(document).not.toContain('href="article-hybrid-router.html"');
      expect(document).not.toContain('href="/methodology/benchalign/"');
      expect(document).not.toContain('href="/privacy/"');
    }
    expect(articles).toContain('href="/articles/hybrid-router"');
    expect(articles).not.toContain('href="/article-hybrid-router"');
    expect(articleDetail).toContain('href="/models"');
    expect(articleDetail).toContain('href="/make-it-yours/"');
    expect(articleDetail).toContain('Build a ranking around your priorities');
    expect(home).toContain('href="/subscribe-vs-api"');
    expect(home).not.toContain('href="/cost/calculator"');
    expect(articleDetail).toContain('href="/subscribe-vs-api"');
    expect(articleDetail).toContain('Explore Subscribe vs API');
    expect(articleDetail).toContain('Related articles');
    expect(articleDetail).not.toContain('Related guides');
    expect(articleDetail).toContain('href="/articles/track-claude-code-usage/"');
    expect(articleDetail).toContain('href="/models">Models workbench</a>');
    expect(articleDetail).not.toContain('href="/guides/">Guides</a>');
    expect(articles).toContain('href="/subscribe-vs-api">Subscribe vs API</a>');
    expect(articles).toContain('href="/models">Models workbench</a>');
    expect(articleDetail).toContain('href="/articles"');
  });

  it('gives Popular Models the same prototype chrome as Models and Compare', async () => {
    const popularModels = await readFile(`${prototypeRoot}/popular-models.html`, 'utf8');

    expect(popularModels).toContain('<header class="topbar">');
    expect(popularModels).toContain('<nav class="nav" aria-label="Primary"></nav>');
    expect(popularModels).toContain('data-popular-models-workbench');
    expect(popularModels).toContain('setupShell();');
    expect(popularModels).toContain('src="/assets/main.js"');
    expect(popularModels).toContain('href="/assets/tokenbench.css"');
  });

  it('publishes legacy redirects to the approved canonical preview routes', async () => {
    const redirects = await readFile('public/_redirects', 'utf8');

    expect(redirects).not.toContain('/ /models 301');
    expect(redirects).toContain('/article-hybrid-router /articles/hybrid-router 301');
    expect(redirects).toContain('/custom-leaderboard /make-it-yours/ 301');
  });

});
