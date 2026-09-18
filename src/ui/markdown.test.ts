import { describe, expect, it } from 'vitest';

import { renderMarkdown } from './markdown.js';

const ALLOWED_OPEN_TAGS = [
  '<a',
  '<code',
  '<em',
  '<h1',
  '<h2',
  '<h3',
  '<h4',
  '<h5',
  '<h6',
  '<li',
  '<ol',
  '<p',
  '<pre',
  '<strong',
  '<ul',
];

describe('renderMarkdown', () => {
  it('returns an empty string for an empty source', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('renders ATX headings one through six', () => {
    const html = renderMarkdown(
      '# one\n## two\n### three\n#### four\n##### five\n###### six',
    );
    expect(html).toContain('<h1>one</h1>');
    expect(html).toContain('<h2>two</h2>');
    expect(html).toContain('<h3>three</h3>');
    expect(html).toContain('<h4>four</h4>');
    expect(html).toContain('<h5>five</h5>');
    expect(html).toContain('<h6>six</h6>');
  });

  it('renders blank-line separated paragraphs as separate p elements', () => {
    expect(renderMarkdown('first\n\nsecond')).toBe(
      '<p>first</p>\n<p>second</p>',
    );
  });

  it('renders dash lists as ul and numbered lists as ol', () => {
    const html = renderMarkdown('- alpha\n- beta\n\n1. one\n2. two');
    expect(html).toContain('<ul><li>alpha</li><li>beta</li></ul>');
    expect(html).toContain('<ol><li>one</li><li>two</li></ol>');
  });

  it('renders a fenced block with markdown markers kept literal', () => {
    const html = renderMarkdown('```\n**bold** *em* `code` <tag>\n```');
    expect(html).toBe(
      '<pre><code>**bold** *em* `code` &lt;tag&gt;</code></pre>',
    );
  });

  it('renders an unterminated fence to the end of the source', () => {
    expect(renderMarkdown('```\n**bold**\n`code`')).toBe(
      '<pre><code>**bold**\n`code`</code></pre>',
    );
  });

  it('renders inline code, bold and italic', () => {
    expect(renderMarkdown('`code` **bold** *em*')).toBe(
      '<p><code>code</code> <strong>bold</strong> <em>em</em></p>',
    );
  });

  it('renders an https link as an anchor', () => {
    expect(renderMarkdown('[docs](https://example.com/a)')).toBe(
      '<p><a href="https://example.com/a">docs</a></p>',
    );
  });

  it('renders javascript and relative link targets as plain text', () => {
    expect(renderMarkdown('[js](javascript:alert(1)) [rel](/path/to)')).toBe(
      '<p>js rel</p>',
    );
  });

  it('escapes every HTML metacharacter from the source', () => {
    expect(renderMarkdown('a & b < c > d " e \' f')).toBe(
      '<p>a &amp; b &lt; c &gt; d &quot; e &#39; f</p>',
    );
  });

  it('renders raw HTML only as escaped text', () => {
    const html = renderMarkdown('before <img src=x onerror=alert(1)> after');
    expect(html).toContain(
      'before &lt;img src=x onerror=alert(1)&gt; after',
    );
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
  });

  it('emits no unescaped angle bracket from the source', () => {
    const html = renderMarkdown('x < y > z\n\n<img src=x onerror=alert(1)>');
    for (const match of html.matchAll(/<[a-zA-Z][a-zA-Z0-9-]*/g)) {
      expect(ALLOWED_OPEN_TAGS).toContain(match[0]);
    }
  });

  it('escapes quotation marks in a link target so they cannot break out', () => {
    const html = renderMarkdown('[click](https://example.com/" onclick="x)');
    expect(html).toContain(
      '<a href="https://example.com/&quot; onclick=&quot;x">click</a>',
    );
    expect(html).not.toContain(' onclick="');
  });

  it('escapes quotation marks in link text', () => {
    const html = renderMarkdown('[a"b\'](https://example.com)');
    expect(html).toContain('<a href="https://example.com">a&quot;b&#39;</a>');
    expect(html).not.toContain('a"b');
  });

  it('contains no script, no on-prefixed attribute and no external resource', () => {
    const html = renderMarkdown(
      '<script>alert(1)</script>\n\n[go](https://example.com/a)',
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<link');
    expect(html).not.toMatch(/<[a-zA-Z][a-zA-Z0-9-]*[^>]*\son[a-zA-Z-]+\s*=/);
    expect(html).not.toContain('http://');
    const hrefs: string[] = [];
    for (const match of html.matchAll(/href="([^"]*)"/g)) {
      const href = match[1];
      if (href !== undefined) {
        hrefs.push(href);
        expect(href.startsWith('https://')).toBe(true);
      }
    }
    expect(hrefs).toEqual(['https://example.com/a']);
  });

  it('is deterministic and independent of external state', () => {
    const source = '# plan\n\n- step\n\n[go](https://example.com/)';
    expect(renderMarkdown(source)).toBe(renderMarkdown(source));
  });
});
