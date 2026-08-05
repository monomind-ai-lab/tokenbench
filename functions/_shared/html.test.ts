import { describe, expect, it } from 'vitest';
import { escapeHtmlAttribute, escapeHtmlText, escapeXmlText, isHttpsUrl, serializeJsonForScript } from './html';

describe('HTML response escaping', () => {
  it('uses context-appropriate text, attribute, and XML escaping', () => {
    const attack = `&<>'\"`;

    expect(escapeHtmlText(attack)).toBe('&amp;&lt;&gt;\'\"');
    expect(escapeHtmlAttribute(attack)).toBe('&amp;&lt;&gt;&#39;&quot;');
    expect(escapeXmlText(attack)).toBe('&amp;&lt;&gt;&apos;&quot;');
  });

  it('accepts only absolute HTTPS attribution URLs', () => {
    expect(isHttpsUrl('https://benchlm.example/data?source=TokenBench')).toBe(true);
    expect(isHttpsUrl('HTTPS://benchlm.example/data')).toBe(true);
    expect(isHttpsUrl('http://benchlm.example/data')).toBe(false);
    expect(isHttpsUrl('//benchlm.example/data')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpsUrl('https://')).toBe(false);
  });

  it('serializes JSON for an application/json script without allowing a script breakout or separators', () => {
    const serialized = serializeJsonForScript({
      title: '</script><img src=x onerror=alert(1)>',
      separator: 'before\u2028after\u2029done',
      markup: '<svg>&</svg>',
    });

    expect(serialized).toContain('\\u003c/script\\u003e');
    expect(serialized).toContain('\\u003e');
    expect(serialized).toContain('\\u0026');
    expect(serialized).toContain('\\u2028');
    expect(serialized).toContain('\\u2029');
    expect(serialized).not.toContain('</script>');
    expect(JSON.parse(serialized)).toEqual({
      title: '</script><img src=x onerror=alert(1)>',
      separator: 'before\u2028after\u2029done',
      markup: '<svg>&</svg>',
    });
  });
});
