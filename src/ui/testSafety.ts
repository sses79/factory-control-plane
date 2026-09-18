import { expect } from 'vitest';

/**
 * What every rendered page must satisfy, whatever its layout: a complete document, one inline style
 * element, no script, no event-handler attribute, no external resource, and links that are either
 * this server's own routes or https pull-request URLs. The server sends
 * `default-src 'none'; style-src 'unsafe-inline'`, and this is the markup side of that policy.
 */
export function expectSafeDocument(html: string): void {
  expect(html.startsWith('<!doctype html>')).toBe(true);
  expect(html).not.toMatch(/<script\b/i);
  expect(html).not.toMatch(/<link\b/i);
  expect(html).not.toMatch(/<img\b/i);
  expect(html).not.toMatch(/<iframe\b/i);
  expect(html).not.toMatch(/<[a-zA-Z][a-zA-Z0-9-]*[^>]*\s+on[a-zA-Z-]+\s*=/);
  expect(html).not.toContain('http://');
  expect(html).not.toMatch(/url\(/i);
  expect(html).not.toMatch(/@import/i);
  expect(html.match(/<style>/g) ?? []).toHaveLength(1);
  for (const match of html.matchAll(/href="([^"]*)"/g)) {
    const href = match[1] ?? '';
    const internal = href === '/' || href === '/ideas' || /^\/(ideas|runs)\/[^"<>\s]+$/.test(href);
    expect(internal || href.startsWith('https://')).toBe(true);
  }
}
