import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateMockupCss, validateMockupHtml } from './mockup-contract';

const validHtml = `<!doctype html><html lang="en" data-theme="dark"><head>
<link rel="stylesheet" href="tokenbench-mockup.css"></head><body><!--
THESIS: Evidence stays attached to the decision.
OWN-WORLD: Compact neutral panels with electric-blue state.
STORY: Select, inspect, and verify.
FIRST VIEWPORT: Shared shell above the task workspace.
FORM: Decision workstation; approved 2026-08-06.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
--><a class="skip-link" href="#page-content">Skip to page content</a>
<header><a class="brand-home" href="/">TokenBench</a><nav id="primary-navigation" class="primary-nav" data-primary-nav aria-label="Primary navigation"><a href="/tools/">Tools</a><a href="/compare/">Compare</a><a href="/leaderboards/">Leaderboards</a><a href="/guides/">Guides</a></nav><button class="menu-button" data-menu-toggle aria-controls="primary-navigation" aria-expanded="false">Menu</button><label class="language-control"><select aria-label="Language"><option value="en">English</option></select></label><button data-theme-toggle aria-label="Toggle light theme">Theme</button></header>
<main id="page-content"><h1>Fixture</h1></main><script src="tokenbench-mockup.js"></script></body></html>`;

describe('mockup contract', () => {
  it('rejects an artifact without the direction contract or shared assets', () => {
    expect(validateMockupHtml('<html><body><h1>Broken</h1></body></html>', { h1: 'Broken' }))
      .toEqual(expect.arrayContaining(['missing direction contract', 'missing shared stylesheet', 'missing shared behavior']));
  });

  it('accepts a complete semantic shell', () => {
    expect(validateMockupHtml(validHtml, { h1: 'Fixture' })).toEqual([]);
  });

  it('requires the shared mobile navigation hooks', () => {
    expect(validateMockupHtml(validHtml.replace(' data-primary-nav', ''), { h1: 'Fixture' }))
      .toEqual(expect.arrayContaining(['missing primary navigation behavior hook']));
    expect(validateMockupHtml(validHtml.replace(' data-menu-toggle', ''), { h1: 'Fixture' }))
      .toEqual(expect.arrayContaining(['missing menu toggle behavior hook']));
  });

  it('requires an accessible language selector in the shared shell', () => {
    expect(validateMockupHtml(validHtml.replace(' aria-label="Language"', ' aria-label="Locale"'), { h1: 'Fixture' }))
      .toEqual(expect.arrayContaining(['missing accessible language control']));
  });

  it('accepts body whitespace before the direction contract but not meaningful text', () => {
    expect(validateMockupHtml(validHtml.replace('<body><!--', '<body>\n  \t<!--'), { h1: 'Fixture' })).toEqual([]);
    expect(validateMockupHtml(validHtml.replace('<body><!--', '<body>Before the contract<!--'), { h1: 'Fixture' }))
      .toEqual(expect.arrayContaining(['missing direction contract']));
  });

  it('rejects protocol-relative and case-insensitive remote runtime resources', () => {
    const html = validHtml
      .replace('</head>', '<link rel="stylesheet" href="//cdn.example/mockup.css"></head>')
      .replace('</body>', '<img src="HTTPS://cdn.example/cover.png"><img srcset="/cover.png 1x, //cdn.example/cover@2x.png 2x"><video src="http://cdn.example/demo.mp4"></video><audio src="HTTPS://cdn.example/brief.mp3"></audio><iframe src="//cdn.example/embed"></iframe></body>');
    expect(validateMockupHtml(html, { h1: 'Fixture' })).toEqual(expect.arrayContaining([
      expect.stringContaining('href="//cdn.example/mockup.css"'),
      expect.stringContaining('src="HTTPS://cdn.example/cover.png"'),
      expect.stringContaining('srcset="/cover.png 1x, //cdn.example/cover@2x.png 2x"'),
      expect.stringContaining('src="http://cdn.example/demo.mp4"'),
      expect.stringContaining('src="HTTPS://cdn.example/brief.mp3"'),
      expect.stringContaining('src="//cdn.example/embed"'),
    ]));
  });

  it('rejects a mutated theme contract and accepts the shipped stylesheet', () => {
    expect(validateMockupCss(`:root { --bg: #ffffff; }`)).toEqual(expect.arrayContaining(['missing dark canvas #0f0f0f', 'missing light canvas #f7f8fc', 'missing 44px target rule', 'missing focus-visible rule']));
    const css = readFileSync('.stitch/designs/tokenbench-mockup.css', 'utf8');
    expect(validateMockupCss(css)).toEqual([]);
  });

  it('rejects remote CSS imports and URLs', () => {
    const css = readFileSync('.stitch/designs/tokenbench-mockup.css', 'utf8');
    expect(validateMockupCss(`${css}\n@import url("HTTPS://cdn.example/mockup.css");\n.remote { background-image: url(//cdn.example/background.svg); }`))
      .toEqual(expect.arrayContaining([
        expect.stringContaining('external runtime asset: @import'),
        expect.stringContaining('external runtime asset: url(//cdn.example/background.svg)'),
      ]));
  });

  it('rejects qualified direct-string remote CSS imports', () => {
    const css = readFileSync('.stitch/designs/tokenbench-mockup.css', 'utf8');
    expect(validateMockupCss(`${css}\n@import "HTTPS://cdn.example/mockup.css" screen;\n@import "//cdn.example/print.css" layer(theme) supports(display: grid) print and (min-width: 48rem);`))
      .toEqual(expect.arrayContaining([
        expect.stringContaining('external runtime asset: @import "HTTPS://cdn.example/mockup.css" screen;'),
        expect.stringContaining('external runtime asset: @import "//cdn.example/print.css" layer(theme) supports(display: grid) print and (min-width: 48rem);'),
      ]));
  });
});
