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
<header><a class="brand-home" href="/">TokenBench</a><nav aria-label="Primary navigation"><a href="/tools/">Tools</a><a href="/compare/">Compare</a><a href="/leaderboards/">Leaderboards</a><a href="/guides/">Guides</a></nav><button data-theme-toggle aria-label="Toggle light theme">Theme</button></header>
<main id="page-content"><h1>Fixture</h1></main><script src="tokenbench-mockup.js"></script></body></html>`;

describe('mockup contract', () => {
  it('rejects an artifact without the direction contract or shared assets', () => {
    expect(validateMockupHtml('<html><body><h1>Broken</h1></body></html>', { h1: 'Broken' }))
      .toEqual(expect.arrayContaining(['missing direction contract', 'missing shared stylesheet', 'missing shared behavior']));
  });

  it('accepts a complete semantic shell', () => {
    expect(validateMockupHtml(validHtml, { h1: 'Fixture' })).toEqual([]);
  });

  it('rejects a mutated theme contract and accepts the shipped stylesheet', () => {
    expect(validateMockupCss(`:root { --bg: #ffffff; }`)).toEqual(expect.arrayContaining(['missing dark canvas #0f0f0f', 'missing light canvas #f7f8fc', 'missing 44px target rule', 'missing focus-visible rule']));
    const css = readFileSync('.stitch/designs/tokenbench-mockup.css', 'utf8');
    expect(validateMockupCss(css)).toEqual([]);
  });
});
