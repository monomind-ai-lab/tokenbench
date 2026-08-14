import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_CONFIG } from '../src/brand/site-config';
import { INSIGHT_CATEGORIES, INSIGHTS, insightPath, type InsightRecord } from '../src/articles/content';
import { GUIDES, guidePath } from '../src/guides/content';
import {
  FIXED_ROUTES,
  LEADERBOARD_ROUTES,
  ROUTE_PATHS,
  staticHtmlEntries,
  type AppRoute,
} from '../src/routing/routes';
import { metadataForRoute, type PageMetadata } from '../src/seo/metadata';
import { documentHtml, escapeHtml, headMarkup, staticChrome, transactionalChrome, type StaticNavigationPage } from '../src/seo/static-page';
import { generateGuidePages } from './generate-guide-pages';

function activeNavigation(route: AppRoute): StaticNavigationPage {
  switch (route.kind) {
    case 'cost': return undefined;
    case 'tools': return undefined;
    case 'calculator': return 'calculator';
    case 'breakeven': return 'calculator';
    case 'home': return 'home';
    case 'compareHub': return 'compare';
    case 'models': return 'models';
    case 'modelLifecycle': return 'models';
    case 'newsletterConfirmed':
    case 'welcome':
    case 'privacy': return undefined;
    case 'leaderboards':
    case 'leaderboard':
    case 'methodologyBenchAlign': return 'leaderboards';
    case 'guides': return 'guides';
    case 'articles':
    case 'insights': return 'guides';
    default: return undefined;
  }
}

function pageIntro(metadata: PageMetadata, body: string, h1Override?: string): string {
  const h1 = h1Override ?? escapeHtml(metadata.h1);
  return `<main id="page-content" class="page-main" tabindex="-1"><section class="content-stack static-page-content"><h1>${h1}</h1>${body}</section></main>`;
}

function staticNewsletterForm(): string {
  return `<section class="home-newsletter panel" aria-labelledby="home-newsletter-heading"><h2 id="home-newsletter-heading">Get the monthly TokenBench cheatsheet</h2><p>Receive source-backed model pricing, context windows, and benchmark updates. We use your address only to deliver the requested email.</p><form action="/api/newsletter/subscribe" method="post"><label for="static-newsletter-first-name">First name</label><input id="static-newsletter-first-name" name="firstName" autocomplete="given-name" required><label for="static-newsletter-company">Company</label><input id="static-newsletter-company" name="company" autocomplete="organization" required><label for="static-newsletter-email">Email address</label><input id="static-newsletter-email" name="email" type="email" autocomplete="email" required aria-describedby="static-newsletter-consent"><label class="static-newsletter-consent"><input name="monthlyCheatsheet" type="checkbox" value="true" required> <span id="static-newsletter-consent">I agree to receive the monthly TokenBench cheatsheet.</span></label><input name="modelAndPriceAlerts" type="hidden" value="false"><input name="context" type="hidden" value="footer"><button type="submit">Download Free Cheatsheet</button></form></section>`;
}

function staticHomeMetrics(): string {
  return `<section class="home-metrics panel" aria-label="Home metrics"><p class="eyebrow">Evidence snapshot · 50/50 input/output mix</p><dl class="home-metrics-grid"><div><dt>Models tracked</dt><dd>Not reported</dd></div><div><dt>Max savings</dt><dd>Not reported</dd></div><div><dt>Top throughput</dt><dd>Not reported</dd></div><div><dt>Effective at</dt><dd>Not reported</dd></div></dl></section>`;
}

function staticHomePreviews(): string {
  const previews = [
    ['Models preview', 'Browse current and archived model records with route-level evidence.', ROUTE_PATHS.models, 'Inspect models'],
    ['Leaderboards preview', 'Review published benchmark lanes and evidence lenses.', ROUTE_PATHS.leaderboards, 'Inspect leaderboards'],
    ['Compare preview', 'Put two models side by side with comparable facts.', ROUTE_PATHS.compareHub, 'Inspect comparisons'],
    ['Subscribe vs API preview', 'Compare observed workload cost with supported subscription evidence.', ROUTE_PATHS.calculator, 'Inspect subscription costs'],
    ['Articles preview', 'Read source-backed guides for practical AI operating decisions.', ROUTE_PATHS.articles, 'Inspect articles'],
  ] as const;
  return `<section class="home-preview-section" aria-labelledby="home-previews-heading"><div class="panel-heading"><div><span class="eyebrow">Decision surfaces</span><h2 id="home-previews-heading">Inspect the evidence before you act</h2></div></div><div class="home-preview-grid">${previews.map(([title, description, href, action]) => `<section class="panel home-preview" data-home-preview><h2>${title}</h2><p>${title === 'Articles preview' ? `${description} <a href="${ROUTE_PATHS.guides}">Guides</a> and <a href="${ROUTE_PATHS.insights}">LLM insights</a>.` : description}</p><a class="button button-secondary" href="${href}">${action}</a></section>`).join('')}</div></section>`;
}

function editorialDate(value: string): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}

function staticArticlesHub(): string {
  const guides = GUIDES.map((guide) => `<article class="guide-card"><p class="guide-card-meta">Guide · Updated ${editorialDate(guide.updatedAt)}</p><h3><a href="${guidePath(guide.slug)}">${escapeHtml(guide.title)}</a></h3><p>${escapeHtml(guide.dek)}</p><a href="${escapeHtml(guide.relatedDecisionLinks[0].href)}">Related decision tool</a></article>`).join('');
  const insights = INSIGHTS.map((insight) => `<article class="guide-card"><p class="guide-card-meta">Insight · ${escapeHtml(insight.category)} · Updated ${editorialDate(insight.updatedAt)}</p><h3><a href="${insightPath(insight.slug)}">${escapeHtml(insight.title)}</a></h3><p>${escapeHtml(insight.factualBrief)}</p><a href="${escapeHtml(insight.relatedDecisionLinks[0].href)}">Related decision tool</a></article>`).join('');
  return `<main id="page-content" class="guides-main articles-hub" tabindex="-1"><section class="articles-channel-split" aria-label="Article channels"><section aria-labelledby="articles-guides-heading"><h1 id="articles-guides-heading">Guides</h1><p>Source-aware frameworks for routing, cost, lifecycle, and production model selection.</p><a class="button" href="${ROUTE_PATHS.guides}">Browse guides</a></section><section aria-labelledby="articles-insights-heading"><h2 id="articles-insights-heading">Insights</h2><p>Factual briefs and clearly labeled TokenBench interpretation for releases, benchmarks, pricing, lifecycle, and ecosystem updates.</p><a class="button" href="${ROUTE_PATHS.insights}">Browse LLM insights</a></section></section><section class="guide-index"><div class="guide-index-heading"><div><h2>Featured and recent reading</h2></div><p>Topic links have URL state and work without JavaScript.</p></div><nav class="article-filters" aria-label="Article filters"><a href="?topic=all&amp;view=featured">Featured</a><a href="?topic=all&amp;view=recent">Recent</a><a href="?topic=all&amp;view=recent">All topics</a><a href="?topic=hybrid-routing&amp;view=recent">Hybrid routing</a></nav><p role="status">${GUIDES.length + INSIGHTS.length} results for all · recent</p><div class="article-channel-index"><section><h2>Guides</h2><div class="guide-grid">${guides}</div></section><section><h2>Insights</h2><div class="guide-grid">${insights}</div></section></div><p class="article-status">If live editorial metadata cannot load, both authored channel entry links and evidence states remain available.</p></section></main>`;
}

function insightIndexContent(): string {
  const categoryLinks = INSIGHT_CATEGORIES.map((category) => `<a href="?topic=${escapeHtml(category.toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-').replace(/-$/u, ''))}&amp;date=all&amp;view=recent">${escapeHtml(category)}</a>`).join('');
  const cards = INSIGHTS.map((insight) => `<article class="guide-card"><div class="guide-card-meta"><span>Insight · ${escapeHtml(insight.category)}</span><span>Published ${editorialDate(insight.publishedAt)}</span></div><h3><a href="${insightPath(insight.slug)}">${escapeHtml(insight.title)}</a></h3><p>${escapeHtml(insight.factualBrief)}</p><p class="article-status">Factual review: ${escapeHtml(insight.factualReview)}</p></article>`).join('');
  return `<main id="page-content" class="guides-main" tabindex="-1"><section class="guides-hero"><h1>LLM insights</h1><p>Factual primary-source briefs with TokenBench interpretation clearly separated from observed evidence.</p><p><a href="${ROUTE_PATHS.guides}">Browse all guides</a></p></section><section class="guide-index"><div class="guide-index-heading"><div><h2>Five evidence channels</h2></div><p>Each record has one primary category, publication/update dates, and factual-review status.</p></div><nav class="article-filters" aria-label="Insight filters"><a href="?topic=all&amp;date=all&amp;view=featured">Featured</a><a href="?topic=all&amp;date=all&amp;view=recent">Recent</a>${categoryLinks}</nav><p role="status">${INSIGHTS.length} results for all · all date filter · recent</p><div class="guide-grid">${cards}</div><p class="article-status">If live metadata fails, this authored index and each crawlable detail remain available.</p></section></main>`;
}

function sourceLink(label: string, url: string, effectiveAt: string | null, status: string): string {
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)} — ${escapeHtml(effectiveAt ? `effective ${editorialDate(effectiveAt)}` : `effective date ${status}`)} ↗</a>`;
}

function insightDetailContent(insight: InsightRecord): string {
  const facts = insight.factBlocks.map((block) => `<section class="article-section" data-article-block="${escapeHtml(block.kind)}"><h2>${escapeHtml(block.heading)}</h2><p>${escapeHtml(block.body)}</p></section>`).join('');
  const interpretation = insight.interpretationBlocks.map((block) => `<section class="article-section" data-article-block="${escapeHtml(block.kind)}"><h2>${escapeHtml(block.heading)}</h2><p>${escapeHtml(block.body)}</p></section>`).join('');
  const timeline = insight.evidenceTimeline.map((entry) => `<li><strong>${escapeHtml(entry.dateLabel)}</strong><p>${escapeHtml(entry.detail)}</p>${sourceLink(entry.label, entry.url, entry.effectiveAt, entry.evidenceStatus)}</li>`).join('');
  const corrections = insight.corrections.length ? insight.corrections.map((correction) => `<details><summary id="${escapeHtml(correction.id)}">Correction published ${editorialDate(correction.publishedAt)}</summary><p>${escapeHtml(correction.detail)}</p></details>`).join('') : '<p>No corrections have been published for this record.</p>';
  const related = insight.relatedDecisionLinks.map((link) => `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`).join('');
  const cta = insight.ctaEligible ? '<aside class="editorial-cta panel" aria-label="MonoMind AI Lab editorial CTA"><h2>Turn this evidence into a deployment plan</h2><p>Get a focused review of model, cost, and evaluation trade-offs for your production constraints.</p><a class="button" href="https://monomind.ai/">Talk to MonoMind AI Lab</a></aside>' : '';
  return `<main id="page-content" class="guides-main article-main" tabindex="-1"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="${ROUTE_PATHS.articles}">Articles</a><span>›</span><a href="${ROUTE_PATHS.insights}">Insights</a><span>›</span><span aria-current="page">${escapeHtml(insight.title)}</span></nav><article class="guide-article"><header class="article-header"><h1>${escapeHtml(insight.title)}</h1><div class="article-byline"><span>Insight: ${escapeHtml(insight.category)}</span><span>Published ${editorialDate(insight.publishedAt)}</span><span>Updated ${editorialDate(insight.updatedAt)}</span><span>Factual review: ${escapeHtml(insight.factualReview)}</span><span>Author: ${escapeHtml(insight.author.name ?? 'Unavailable')}</span><span>Reviewer: ${escapeHtml(insight.reviewer.name ?? 'Unavailable')}</span></div><p class="article-status">Evidence state: ${escapeHtml(insight.factualReview)}. This record does not silently substitute a current claim for incomplete or undated evidence.</p></header><div class="article-body"><section class="article-section"><h2>Factual brief</h2><p>${escapeHtml(insight.factualBrief)}</p></section><section class="article-section"><h2>What changed</h2><p>${escapeHtml(insight.whatChanged)}</p></section><section class="article-section"><h2>Evidence timeline</h2><ol class="evidence-timeline">${timeline}</ol></section>${facts}${interpretation}<section class="article-section"><h2>Affected models and hosts</h2><p>No verified profile or host mapping is available for this record.</p></section><section class="article-section"><h2>Practical implications</h2><ul>${insight.implications.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section><section class="article-section"><h2>Corrections</h2>${corrections}</section></div></article><section class="guide-callout decision-context"><h2>Related decision links</h2><ul>${related}</ul></section>${cta}</main>`;
}

function insightStructuredData(insight: InsightRecord): unknown[] {
  const metadata = metadataForRoute({ kind: 'insightDetail', slug: insight.slug });
  return [
    { '@context': 'https://schema.org', '@type': 'Article', headline: insight.title, description: insight.factualBrief, datePublished: insight.publishedAt, dateModified: insight.updatedAt, image: metadata.openGraph.image, mainEntityOfPage: metadata.canonical, author: { '@type': 'Organization', name: insight.author.name ?? SITE_CONFIG.parentName, url: SITE_CONFIG.parentUrl }, publisher: { '@type': 'Organization', name: SITE_CONFIG.parentName, url: SITE_CONFIG.parentUrl } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: SITE_CONFIG.name, item: SITE_CONFIG.origin }, { '@type': 'ListItem', position: 2, name: 'Insights', item: `${SITE_CONFIG.origin}${ROUTE_PATHS.insights}` }, { '@type': 'ListItem', position: 3, name: insight.title, item: metadata.canonical }] },
  ];
}

function fixedPageContent(
  route: Exclude<AppRoute, { kind: 'guides' } | { kind: 'comparison' } | { kind: 'redirect' } | { kind: 'notFound' }>,
  metadata: PageMetadata,
): string {
  switch (route.kind) {
    case 'home':
      return pageIntro(metadata, `<p>${escapeHtml(metadata.description)}</p><div class="static-page-links"><a class="button" href="/compare/">Compare models</a><a class="button" href="${ROUTE_PATHS.calculator}">Review Your Subscriptions</a><a class="button" href="/leaderboards/">Browse leaderboards</a><a class="button button-secondary" href="${ROUTE_PATHS.pricePerformance}">Review price vs performance</a></div>${staticHomeMetrics()}${staticHomePreviews()}<section><h2>Make an evidence-aware decision</h2><p>Compare direct API pricing, paid subscriptions, workload context, and benchmark categories without treating missing measurements as zero or presenting estimates as facts.</p></section>${staticNewsletterForm()}`);
    case 'cost':
      return pageIntro(metadata, `<p>Use the Cost Simulator to estimate a concrete workload from normalized source-price line items. Use Breakeven to find where a seat-fee scenario crosses metered API spend.</p><p><strong>Fee crossover is not subscription-capacity evidence.</strong> Included tokens appear only with separately verified entitlement evidence.</p><section><h2>Cost Simulator</h2><p>Output: auditable source prices and derived scenario line items. Needs: a model route, published input/output prices, and workload assumptions.</p><a class="button" href="${ROUTE_PATHS.calculator}">Open Cost Simulator</a></section><section><h2>Breakeven Calculator</h2><p>Output: fee crossover and lower-cost region. Needs: seats, fee, input/output mix, and complete API price dimensions.</p><a class="button" href="${ROUTE_PATHS.breakeven}">Open Breakeven Calculator</a></section><section><h2>Pricing source coverage</h2><p>Source freshness loads with the current catalog. If unavailable, both tools remain reachable and explain the limitation.</p><p><a href="${ROUTE_PATHS.guides}">Read pricing and workload guides</a></p></section>`, 'Choose the right cost question');
    case 'tools':
      return pageIntro(metadata, `<p>Use ${SITE_CONFIG.name} tools to frame AI cost decisions from your observed usage and the provider evidence that is available for the exact route you are considering.</p><section><h2>Available tool</h2><article><h3><a href="${ROUTE_PATHS.calculator}">Subscription vs API cost calculator</a></h3><p>Estimate an API-equivalent cost from monthly tokens and model mix, then compare it with a paid individual subscription while keeping variable limits explicit.</p></article></section>`);
    case 'calculator':
      return pageIntro(metadata, `<p>Estimate a concrete monthly scenario with published, route-specific input and output prices. Missing dimensions are not zero.</p><form method="get" action="${ROUTE_PATHS.calculator}"><fieldset><legend>Scenario inputs</legend><label>Conversations per day <input name="c" type="number" min="0"></label><label>Messages per conversation <input name="m" type="number" min="0"></label><label>Input tokens per message <input name="i" type="number" min="0"></label><label>Output tokens per message <input name="o" type="number" min="0"></label><label>Active days per month <input name="d" type="number" min="0" max="31"></label></fieldset><button type="submit">Simulate cost</button></form><section><h2>Published source prices</h2><p>Input, output, cache, long-context, currency, unit, effective time, and source remain distinct where published.</p></section><section><h2>Scenario result</h2><p>Source prices and derived scenario costs are kept separate; a submitted GET scenario re-renders with its formula and audit rows.</p></section><section><h2>Calculation assumptions</h2><p>Missing cache or long-context dimensions are excluded with an explanation. Print and CSV use the displayed scenario and include timestamped assumptions.</p></section>`);
    case 'breakeven':
      return pageIntro(metadata, `<p>Find the monthly token volume where a seat fee and complete metered API prices are equal. Capacity evidence remains separate.</p><form method="get" action="${ROUTE_PATHS.breakeven}"><fieldset><legend>Fee crossover controls</legend><label>Seats <input name="seats" type="number" min="1" max="50" value="1"></label><label>Fee per seat (USD/month) <input name="fee" type="number" value="20"></label><label>Displayed monthly token domain (0–300M) <input name="volume" type="number" min="0" max="300" value="300"></label></fieldset><button type="submit">Calculate breakeven</button></form><section><h2>Fee result</h2><p>Formula and crossover appear only with complete effective input and output prices. Out-of-domain crossovers identify the cheaper option in the displayed range.</p></section><section class="breakeven-table-scroll" role="region" aria-label="Exact breakeven values" tabindex="0"><table aria-label="Breakeven cost samples"><caption>Breakeven cost samples</caption><thead><tr><th>Monthly tokens</th><th>Metered API cost</th><th>Subscription fee</th><th>Lower cost</th></tr></thead><tbody><tr><th>0M</th><td>$0.00</td><td>Unavailable until a fee scenario is submitted</td><td>API</td></tr></tbody></table></section><section><h2>Subscription capacity evidence</h2><p><strong>Unavailable</strong> unless a separately verified entitlement source publishes it. No included tokens are inferred from a fee crossover.</p></section>`);
    case 'methodologyBenchAlign':
      // No canonical active-summary artifact is present in this build, so no
      // source version can be proven here. The hydrated page reads the active
      // same-origin summary and replaces this truthful fallback when available.
      return pageIntro(metadata, `<p>${SITE_CONFIG.name} republishes BenchLM&#039;s BenchAlign results without recalculating them. <a href="https://benchlm.ai/methodology">Read BenchLM&#039;s methodology</a> for the source method.</p><section><h2>What each view represents</h2><p>Overall, Agentic, and Coding are validated BenchAlign views. Reasoning, Multimodal, and Knowledge are BenchLM-published category evidence lenses, not additional TokenBench rankings.</p><p>Supported rows are source-published results eligible for their exact view. Reviewed estimated rows stay visibly estimated and appear after supported evidence where a route allows them; they are never silently promoted into a validated ranking. Missing measurements remain Unavailable, never zero.</p></section><section><h2>Metrics and runtime</h2><p>Weighted metrics affect the relevant BenchAlign method only. Display-only metrics add context without changing the published order. Runtime is a separate signal, not a substitute for capability evidence or a hidden ranking weight.</p></section><section><h2>Method and refresh status</h2><p>Published method version: <strong>Unavailable</strong>.</p><p>BenchLM refreshes its source output on its own schedule. TokenBench checks that source once daily within its broader Worker, which runs twice daily; a successful TokenBench check does not claim that BenchLM published a new method or result.</p></section>`);
    case 'newsletterConfirmed':
      // Standalone transactional shell: no site navigation or footer actions.
      return `<main id="page-content" class="page-main newsletter-confirmed" tabindex="-1" aria-labelledby="newsletter-confirmed-heading"><div class="newsletter-confirmed-mark" aria-hidden="true">${SITE_CONFIG.name}</div><p class="eyebrow">Email confirmed</p><h1 id="newsletter-confirmed-heading">Your subscription is confirmed.</h1><p>The current TokenBench test cheatsheet will arrive by email.</p><a class="button" href="/">Start Exploring</a></main>`;
    case 'welcome':
      return pageIntro(metadata, `<figure class="welcome-cover"><img src="/brand/welcome-cover.jpg" alt="A desk workspace with a computer monitor and keyboard" width="1600" height="1095"><figcaption>Photo by <a href="https://unsplash.com/@nkachanovskyyy?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Nikita Kachanovsky</a> on <a href="https://unsplash.com/photos/a-desk-with-a-computer-monitor-and-keyboard-on-it-OVbeSXRk_9E?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Unsplash</a></figcaption></figure><p>Your email is confirmed and your subscription is active. Start with the tools that frame real AI cost decisions from observed usage and the provider evidence available for the exact route you are considering.</p><div class="static-page-links home-hero-actions" aria-label="Primary TokenBench decisions"><a class="button" href="/compare/">Compare models <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right" aria-hidden="true"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg></a><a class="button button-secondary" href="/tools/subscriptions-vs-apis/">Review Your Subscriptions</a><a class="button button-secondary" href="/leaderboards/">Browse leaderboards</a></div><section><h2>What happens next</h2><p>Your first monthly cheatsheet will arrive by email. Until then, compare direct API pricing against paid subscriptions, inspect source-backed model benchmarks, and keep unavailable measurements visibly unavailable.</p></section>`);
    case 'privacy':
      return `<main id="page-content" class="page-main" tabindex="-1"><article class="content-stack static-page-content static-policy"><span class="eyebrow">${SITE_CONFIG.name} · MonoMind AI Lab</span><h1>Privacy Policy for TokenBench</h1><p class="policy-effective-date"><strong>Effective Date:</strong> August 12, 2026 &middot; <strong>Last Updated:</strong> August 12, 2026</p><p>At <a href="${SITE_CONFIG.origin}/">${SITE_CONFIG.name}</a> (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;), operating under MonoMind AI Lab, we respect your privacy and are committed to protecting the personal data you share with us. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our site, use our LLM decision engines, or subscribe to our services.</p><section><h2>1. Information We Collect</h2><h3>A. Information You Provide Directly</h3><ul><li><strong>Account &amp; Subscription Data:</strong> When you sign up for newsletter updates, request the <em>Monthly LLM API Cost &amp; Benchmark Cheatsheet</em>, or schedule a consultation with MonoMind AI Lab, we may collect your name, job title, company name, website, and email address.</li><li><strong>Workload &amp; Calculator Inputs:</strong> Information you explicitly enter into our interactive tools (e.g., model selections, token volumes, monthly budget assumptions, and subscription inputs) to calculate API vs. subscription costs.</li></ul><h3>B. Information Collected Automatically</h3><ul><li><strong>Usage &amp; Analytics Data:</strong> Standard web analytics, including your IP address, browser type, operating system, referring URLs, pages viewed, and session duration.</li><li><strong>Cookies and Tracking Technologies:</strong> We use essential and functional cookies to maintain workspace settings, save session comparisons, and analyze site performance.</li></ul></section><section><h2>2. How We Use Your Information</h2><p>We use the collected information to:</p><ul><li>Provide, maintain, and optimize our cost calculation tools, benchmarks, and guides.</li><li>Deliver requested materials, such as cheatsheets, reports, or newsletter updates.</li><li>Process consultation inquiries for enterprise AI optimization with MonoMind AI Lab.</li><li>Analyze usage trends to enhance platform performance, UX design, and model database coverage.</li><li>Protect against unauthorized access, fraudulent usage, and security threats.</li></ul></section><section><h2>3. Data Sharing and Third-Party Services</h2><p>We <strong>do not sell or rent</strong> your personal information. We may share limited data with trusted third parties under the following circumstances:</p><ul><li><strong>Service Providers:</strong> Third-party analytics and email delivery services that help us run our operations (bound by strict confidentiality agreements).</li><li><strong>Aggregated/Anonymized Data:</strong> We may share non-identifying, aggregated usage statistics (e.g., aggregate model comparison trends) for industry research or platform promotion.</li><li><strong>Legal Compliance:</strong> When required by law, subpoena, or government order, or to protect the safety, rights, or property of MonoMind AI Lab and our users.</li></ul></section><section><h2>4. Data Security &amp; Retention</h2><p>We implement administrative, technical, and physical security measures to safeguard your information. Personal data collected for lead forms or email communications is retained only as long as necessary to fulfill the purposes outlined or until you request its deletion.</p></section><section><h2>5. Your Rights &amp; Choices</h2><p>Depending on your jurisdiction (e.g., GDPR, CCPA), you have the right to:</p><ul><li><strong>Access &amp; Correct:</strong> Request a copy of the personal data we hold about you or ask us to update inaccurate information.</li><li><strong>Opt-Out:</strong> Unsubscribe from promotional or marketing communications at any time using the link provided in the emails.</li><li><strong>Deletion:</strong> Request the permanent deletion of your personal contact data.</li></ul><p>To exercise any of these rights, contact us at <a href="mailto:privacy@monomind.one">privacy@monomind.one</a>.</p></section><section><h2>6. Updates to This Policy</h2><p>We may update this Privacy Policy periodically to reflect changes in our platform practices or relevant privacy laws. The updated version will be posted on this page with a revised &ldquo;Last Updated&rdquo; date.</p></section><section><h2>7. Contact Us</h2><p>If you have questions, comments, or concerns regarding this Privacy Policy, please contact us:</p><ul><li><strong>Entity:</strong> MonoMind AI Lab (<a href="${SITE_CONFIG.origin}/">${SITE_CONFIG.name}</a>)</li><li><strong>Email:</strong> <a href="mailto:privacy@monomind.one">privacy@monomind.one</a></li></ul></section></article></main>`;
    case 'models':
      return pageIntro(metadata, `<p>Browse the current BenchLM-derived weekly top 100 and search retained model profiles with source-linked benchmark, pricing, and evidence facts.</p><section><h2>Decision facts stay visible</h2><p>Each model keeps its weekly rank, overall score, strongest category, representative direct API price, and evidence status in one responsive directory. Search results include models that have left the current weekly list.</p></section>`);
    case 'modelLifecycle':
      return pageIntro(metadata, `<p>Review retained current and archived model lifecycle records. Missing lifecycle facts remain unavailable rather than inferred.</p><section><h2>Lifecycle evidence</h2><p>No validated lifecycle records are embedded in this static shell. The interactive ledger loads separately sourced lifecycle evidence when available.</p><dl><div><dt>Announcement date</dt><dd>Unavailable</dd></div><div><dt>Deprecation date</dt><dd>Unavailable</dd></div><div><dt>Retirement date</dt><dd>Unavailable</dd></div><div><dt>Migration target</dt><dd>Unavailable</dd></div><div><dt>Cost delta</dt><dd>Unavailable</dd></div><div><dt>Speed delta</dt><dd>Unavailable</dd></div></dl><p><a href="${ROUTE_PATHS.models}">Browse model directory</a></p></section>`);
    case 'compareHub':
      return pageIntro(metadata, `<p>${SITE_CONFIG.name} comparison pages help teams examine model capability context and cost information side by side. A searchable comparison experience will load in the browser when current benchmark evidence is available.</p><section><h2>Compare evidence, not a fabricated universal score</h2><p>Use source timestamps, category measurements, route-level pricing, and explicit unavailable states to decide which models deserve a deeper workload-specific evaluation.</p></section>`, 'Compare models<br/> side by side');
    case 'leaderboards':
      return pageIntro(metadata, `<p>Explore current model leaders by capability, workload, cost, and human preference.</p><section><h2>Leaderboard categories</h2><p>Each leaderboard shows its source, methodology, timestamp, and unavailable-data treatment with the published revision.</p><ul>${Object.values(LEADERBOARD_ROUTES).map((route) => `<li><a href="${route.pathname}">${escapeHtml(route.seo.h1)}</a></li>`).join('')}</ul></section>`);
    case 'leaderboardCategory':
    case 'leaderboardSla':
    case 'leaderboardCustom':
      return pageIntro(metadata, `<section class="empty-state"><strong>Awaiting a published benchmark revision</strong><p>Live ranking data is not embedded in this static shell. When a supported revision is available, ${SITE_CONFIG.name} will show the source metric, publication timestamp, methodology, and unavailable measurements without inventing a ranking.</p></section>`);
    case 'articles':
      return staticArticlesHub();
    case 'insights':
      return insightIndexContent();
    case 'insightDetail': {
      const insight = INSIGHTS.find((record) => record.slug === route.slug);
      return insight ? insightDetailContent(insight) : pageIntro(metadata, '<p>The requested insight is not published. Browse the available evidence records.</p>');
    }
    case 'leaderboard': {
      const definition = LEADERBOARD_ROUTES[route.key];
      return pageIntro(metadata, `<p>${escapeHtml(definition.seo.summary)}</p><section class="empty-state"><strong>Awaiting a published benchmark revision</strong><p>Live ranking data is not embedded in this static shell. When a supported revision is available, ${SITE_CONFIG.name} will show the source metric, publication timestamp, methodology, and any unavailable measurements instead of inventing a ranking.</p></section><section><h2>Evidence and methodology</h2><p>This page will attribute its displayed data to the applicable source, including BenchLM, LMArena, OpenRouter, or ${SITE_CONFIG.name}-derived calculations. Source availability and methodology remain visible with the results.</p></section>`);
    }
    default:
      return pageIntro(metadata, '');
  }
}

function structuredDataFor(route: AppRoute, metadata: PageMetadata): unknown[] {
  if (route.kind === 'insightDetail') {
    const insight = INSIGHTS.find((record) => record.slug === route.slug);
    return insight ? insightStructuredData(insight) : [];
  }
  const type = route.kind === 'home' || route.kind === 'calculator' || route.kind === 'breakeven'
    ? 'WebApplication'
    : route.kind === 'tools' || route.kind === 'cost' || route.kind === 'articles' || route.kind === 'compareHub' || route.kind === 'leaderboards' || route.kind === 'models' || route.kind === 'modelLifecycle'
      ? 'CollectionPage'
      : 'WebPage';
  return [{
    '@context': 'https://schema.org',
    '@type': type,
    name: metadata.h1,
    description: metadata.description,
    url: metadata.canonical,
    publisher: {
      '@type': 'Organization',
      name: SITE_CONFIG.parentName,
      url: SITE_CONFIG.parentUrl,
    },
  }];
}

function staticSitemap(): string {
  // Indexable canonical pages only; noindex,follow transactional routes such
  // as the confirmation page are generated but never advertised in the sitemap.
  const urls = FIXED_ROUTES
    .map(({ route }) => metadataForRoute(route))
    .filter((metadata) => metadata.robots !== 'noindex,follow')
    .map((metadata) => metadata.canonical);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`).join('\n')}
</urlset>
`;
}

export async function generateStaticPages(rootDir: string): Promise<void> {
  const inputs = staticHtmlEntries(rootDir);

  await Promise.all(FIXED_ROUTES.map(async ({ id, route }) => {
      if (route.kind === 'guides') return;
      const metadata = metadataForRoute(route);
      const content = fixedPageContent(route, metadata);
      const outputPath = inputs[id];
      const isTransactional = route.kind === 'newsletterConfirmed';
      const chrome = isTransactional
        ? transactionalChrome(content)
        : staticChrome(content, activeNavigation(route));
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, documentHtml(
        headMarkup(metadata, structuredDataFor(route, metadata), { includeTranslation: !isTransactional }),
        chrome,
        {
          includeTranslation: !isTransactional,
          bodyPrefix: route.kind === 'modelLifecycle'
            ? '    <!-- THESIS: Evidence before prediction. OWN-WORLD: TokenBench model lifecycle ledger. STORY: Current and archived records with explicit unknowns. FIRST VIEWPORT: Status, evidence dates, and catalog path. FORM: lifecycle-ledger-extension; semantic table with equivalent mobile cards. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md. -->\n'
            : undefined,
        },
      ));
    }));

  await generateGuidePages(resolve(rootDir, 'articles', 'guides'));

  const notFoundMetadata = metadataForRoute({ kind: 'notFound' });
  const notFoundContent = `<main id="page-content" class="page-main" tabindex="-1"><section class="content-stack static-page-content not-found-page" aria-labelledby="not-found-heading"><header><p class="eyebrow">404</p><h1 id="not-found-heading">Page not found</h1><p>The requested identity is unavailable or unpublished. Try a close, safe decision page instead.</p></header><nav class="static-page-links" aria-label="Primary recovery links"><a class="button button-secondary" href="${ROUTE_PATHS.home}">Home</a><a class="button button-secondary" href="${ROUTE_PATHS.models}">Models</a><a class="button button-secondary" href="${ROUTE_PATHS.leaderboards}">Leaderboards</a><a class="button button-secondary" href="${ROUTE_PATHS.compareHub}">Compare</a><a class="button button-secondary" href="${ROUTE_PATHS.cost}">Cost</a><a class="button button-secondary" href="${ROUTE_PATHS.articles}">Articles</a></nav></section></main>`;
  await writeFile(resolve(rootDir, '404.html'), documentHtml(headMarkup(notFoundMetadata, structuredDataFor({ kind: 'notFound' }, notFoundMetadata)), staticChrome(notFoundContent, undefined)));

  const sitemapPath = resolve(rootDir, 'public', 'sitemaps', 'static.xml');
  await mkdir(dirname(sitemapPath), { recursive: true });
  await writeFile(sitemapPath, staticSitemap());
}

async function runStaticGenerator(): Promise<void> {
  await generateStaticPages(process.cwd());
  console.log(`Generated ${FIXED_ROUTES.length} crawlable fixed pages and public/sitemaps/static.xml.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runStaticGenerator();
}
