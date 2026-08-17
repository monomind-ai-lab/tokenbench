import { GuideArticlePage, GuidesHub } from './frontend/guides-page';
import { PageFrame } from './frontend/page-frame';
import { GUIDE_BY_SLUG } from './guides/content';
import { matchRoute } from './routing/routes';

function currentGuideSlug(): string | undefined {
  const route = matchRoute(window.location.pathname);
  return route.kind === 'guides' ? route.slug : undefined;
}

export default function GuidesApp() {
  const slug = currentGuideSlug();
  const guide = slug ? GUIDE_BY_SLUG.get(slug) : undefined;

  return <PageFrame
    shell={{ activePage: 'guides', skipLinkTarget: 'guide-content', skipLinkLabel: 'Skip to guide content' }}
    contentWrapper="none"
  >
    {guide ? <GuideArticlePage guide={guide} /> : <GuidesHub />}
  </PageFrame>;
}
