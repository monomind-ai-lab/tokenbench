import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_CONFIG } from '../src/brand/site-config';
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
  return `<main id="page-content" class="page-main" tabindex="-1"><section class="content-stack static-page-content"><span class="eyebrow">${SITE_CONFIG.name}</span><h1>${h1}</h1>${body}</section></main>`;
}

function fixedPageContent(
  route: Exclude<AppRoute, { kind: 'guides' } | { kind: 'comparison' } | { kind: 'redirect' } | { kind: 'notFound' }>,
  metadata: PageMetadata,
): string {
  switch (route.kind) {
    case 'home':
      return pageIntro(metadata, `<p>${escapeHtml(metadata.description)}</p><div class="static-page-links"><a class="button" href="/compare/">Compare models</a><a class="button" href="${ROUTE_PATHS.calculator}">Review Your Subscriptions</a><a class="button" href="/leaderboards/">Browse leaderboards</a></div><section><h2>Make an evidence-aware decision</h2><p>Compare direct API pricing, paid subscriptions, workload context, and benchmark categories without treating missing measurements as zero or presenting estimates as facts.</p></section>`);
    case 'cost':
      return pageIntro(metadata, `<p>Choose a workload-aware cost decision tool, with source-backed provider evidence and explicit treatment of variable limits.</p><section><h2>Available tools</h2><ul><li><a href="${ROUTE_PATHS.calculator}">Cost simulator</a></li><li><a href="${ROUTE_PATHS.breakeven}">Subscription breakeven calculator</a></li></ul></section>`);
    case 'tools':
      return pageIntro(metadata, `<p>Use ${SITE_CONFIG.name} tools to frame AI cost decisions from your observed usage and the provider evidence that is available for the exact route you are considering.</p><section><h2>Available tool</h2><article><h3><a href="${ROUTE_PATHS.calculator}">Subscription vs API cost calculator</a></h3><p>Estimate an API-equivalent cost from monthly tokens and model mix, then compare it with a paid individual subscription while keeping variable limits explicit.</p></article></section>`);
    case 'calculator':
      return pageIntro(metadata, `<p>Estimate how a paid individual AI subscription compares with direct API pricing. The interactive calculator mounts here in the browser; this crawlable summary explains its inputs and evidence boundaries.</p><section><h2>Use observed workload inputs</h2><p>Choose a provider, plan, model mix, input/output share, and expected monthly token volume. Treat unpublished or guardrail-limited capacity as variable rather than inventing a token cap.</p></section><section><h2>Review the source before purchasing</h2><p>${SITE_CONFIG.name} calculations are decision aids. Follow the provider evidence for current terms, included models, billing conditions, and availability before acting on an estimate.</p></section>`);
    case 'breakeven':
      return pageIntro(metadata, `<p>Use the calculator&#039;s verified subscription and direct API inputs to identify when workload changes may alter the cost comparison. The interactive calculator mounts here in the browser.</p><section><h2>Keep the assumptions visible</h2><p>Choose a provider, plan, model mix, and monthly workload. Variable or unavailable plan limits remain explicit rather than being converted into unsupported capacity claims.</p></section>`);
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
      return pageIntro(metadata, `<p>Review retained current and archived model lifecycle records. Missing lifecycle facts remain unavailable rather than inferred.</p><section><h2>Current vs archived</h2><p>No validated lifecycle records are embedded in this static shell. The interactive ledger loads validated directory evidence when available.</p><dl><div><dt>Retirement date</dt><dd>Unavailable</dd></div><div><dt>Migration target</dt><dd>Unavailable</dd></div><div><dt>Cost delta</dt><dd>Unavailable</dd></div><div><dt>Speed delta</dt><dd>Unavailable</dd></div></dl><p><a href="${ROUTE_PATHS.models}">Browse model directory</a></p></section>`);
    case 'compareHub':
      return pageIntro(metadata, `<p>${SITE_CONFIG.name} comparison pages help teams examine model capability context and cost information side by side. A searchable comparison experience will load in the browser when current benchmark evidence is available.</p><section><h2>Compare evidence, not a fabricated universal score</h2><p>Use source timestamps, category measurements, route-level pricing, and explicit unavailable states to decide which models deserve a deeper workload-specific evaluation.</p></section>`, 'Compare models<br/> side by side');
    case 'leaderboards':
      return pageIntro(metadata, `<p>Explore current model leaders by capability, workload, cost, and human preference.</p><section><h2>Leaderboard categories</h2><p>Each leaderboard shows its source, methodology, timestamp, and unavailable-data treatment with the published revision.</p><ul>${Object.values(LEADERBOARD_ROUTES).map((route) => `<li><a href="${route.pathname}">${escapeHtml(route.seo.h1)}</a></li>`).join('')}</ul></section>`);
    case 'articles':
      return pageIntro(metadata, `<p>Browse technical AI cost guides and evidence-aware articles for practical model and workload decisions.</p><section><h2>Article channels</h2><ul><li><a href="${ROUTE_PATHS.guides}">Guides</a></li><li><a href="${ROUTE_PATHS.insights}">LLM insights</a></li></ul></section>`);
    case 'insights':
      return pageIntro(metadata, `<p>This channel is not separately populated yet. Follow the current technical guides while TokenBench publishes evidence-aware AI ecosystem updates and benchmark analysis.</p>`);
    case 'leaderboard': {
      const definition = LEADERBOARD_ROUTES[route.key];
      return pageIntro(metadata, `<p>${escapeHtml(definition.seo.summary)}</p><section class="empty-state"><strong>Awaiting a published benchmark revision</strong><p>Live ranking data is not embedded in this static shell. When a supported revision is available, ${SITE_CONFIG.name} will show the source metric, publication timestamp, methodology, and any unavailable measurements instead of inventing a ranking.</p></section><section><h2>Evidence and methodology</h2><p>This page will attribute its displayed data to the applicable source, including BenchLM, LMArena, OpenRouter, or ${SITE_CONFIG.name}-derived calculations. Source availability and methodology remain visible with the results.</p></section>`);
    }
    default:
      return pageIntro(metadata, '');
  }
}

function structuredDataFor(route: AppRoute, metadata: PageMetadata): unknown[] {
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
