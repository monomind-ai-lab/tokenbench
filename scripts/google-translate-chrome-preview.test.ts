import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const commonScript = readFileSync(resolve('prototypes/ui-revamp-3/common.js'), 'utf8');

type PrototypeWindow = Window & {
  watchGoogleTranslateChrome?: () => void;
};

describe('Google Translate chrome in the static preview shell', () => {
  it('hides a late-injected translation bar and restores the document offset', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      runScripts: 'dangerously',
      url: 'https://preview.tokenbench.test/',
    });
    const { document } = dom.window;
    dom.window.eval(commonScript);

    const watch = (dom.window as unknown as PrototypeWindow).watchGoogleTranslateChrome;
    expect(watch).toBeTypeOf('function');
    watch?.();

    const banner = document.createElement('iframe');
    banner.className = 'goog-te-banner-frame';
    banner.dataset.translateChrome = 'banner-frame';
    const translatedPageFrame = document.createElement('iframe');
    translatedPageFrame.id = ':1.container';
    translatedPageFrame.dataset.translateChrome = 'translated-page-frame';
    const injectedBanner = document.createElement('div');
    injectedBanner.className = 'VIpgJd-ZVi9od-ORHb-OEVmcd';
    injectedBanner.dataset.translateChrome = 'injected-banner';
    document.body.style.top = '40px';
    document.documentElement.style.marginTop = '40px';
    document.body.prepend(banner, translatedPageFrame, injectedBanner);

    await new Promise((resolvePromise) => dom.window.setTimeout(resolvePromise, 0));

    for (const element of document.querySelectorAll<HTMLElement>('[data-translate-chrome]')) {
      const style = dom.window.getComputedStyle(element);
      expect(element).toHaveAttribute('aria-hidden', 'true');
      expect(style.display).toBe('none');
      expect(style.height).toBe('0px');
      expect(style.visibility).toBe('hidden');
    }
    expect(document.body.style.getPropertyValue('top')).toBe('0px');
    expect(document.body.style.getPropertyPriority('top')).toBe('important');
    expect(document.documentElement.style.getPropertyValue('margin-top')).toBe('0px');
    expect(document.documentElement.style.getPropertyPriority('margin-top')).toBe('important');
  });
});
