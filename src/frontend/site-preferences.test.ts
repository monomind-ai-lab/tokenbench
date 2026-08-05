import { describe, expect, it } from 'vitest';
import { suppressGoogleTranslateChrome } from './site-preferences';

describe('Google Translate chrome suppression', () => {
  it('hides injected configuration UI and resets its page offset', () => {
    const banner = document.createElement('div');
    banner.className = 'VIpgJd-ZVi9od-ORHb-OEVmcd';
    document.body.prepend(banner);
    document.body.style.top = '40px';
    document.documentElement.style.marginTop = '40px';

    suppressGoogleTranslateChrome();

    expect(banner).toHaveAttribute('aria-hidden', 'true');
    expect(banner.style.getPropertyValue('display')).toBe('none');
    expect(banner.style.getPropertyPriority('display')).toBe('important');
    expect(document.body.style.getPropertyValue('top')).toBe('0px');
    expect(document.body.style.getPropertyPriority('top')).toBe('important');
    expect(document.documentElement.style.getPropertyValue('margin-top')).toBe('0px');
  });
});
