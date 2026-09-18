import { describe, expect, it } from 'vitest';

import {
  countTiles,
  escapeHtml,
  progressBar,
  pullRequestLink,
  renderPage,
  shortId,
  statusBadge,
  statusLabel,
  timestamp,
} from './layout.js';
import { expectSafeDocument } from './testSafety.js';

describe('layout', () => {
  it('escapes the five HTML metacharacters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('labels a status readably and keeps acronyms', () => {
    expect(statusLabel('HUMAN_CHANGE_REVIEW')).toBe('Human change review');
    expect(statusLabel('CI_OBSERVATION')).toBe('CI observation');
    expect(statusLabel('DRAFT_PR')).toBe('Draft PR');
  });

  it('gives each status a tone, with an unknown status neutral and escaped', () => {
    expect(statusBadge('FAILED')).toContain('badge-danger');
    expect(statusBadge('MERGED')).toContain('badge-merged');
    expect(statusBadge('BUILDING')).toContain('badge-progress');
    const unknown = statusBadge('<b>NEW</b>');
    expect(unknown).toContain('badge-neutral');
    expect(unknown).not.toContain('<b>');
  });

  it('shortens a long id but keeps the full value in the title', () => {
    const id = 'run-0749023246ec48b7a62ce53a';
    expect(shortId(id)).toBe(`<span title="${id}">run-0749023246ec</span>`);
    expect(shortId('run-1')).toBe('<span title="run-1">run-1</span>');
    expect(shortId('run-"x"')).not.toContain('"x"');
  });

  it('links only an https pull request and shows anything else as escaped text', () => {
    expect(pullRequestLink('https://github.com/o/r/pull/9')).toBe(
      '<a class="pr" href="https://github.com/o/r/pull/9">#9</a>',
    );
    expect(pullRequestLink('javascript:alert(1)')).toBe('javascript:alert(1)');
    expect(pullRequestLink('javascript:alert(1)')).not.toContain('href');
    expect(pullRequestLink(undefined)).toContain('—');
  });

  it('shows a timestamp compactly and keeps the exact value', () => {
    expect(timestamp('2026-09-18T10:37:13.183Z')).toBe(
      '<time datetime="2026-09-18T10:37:13.183Z">2026-09-18 10:37:13</time>',
    );
    expect(timestamp('2026-09-18T10:00:00+00:00')).toContain('>2026-09-18 10:00:00<');
    expect(timestamp(undefined)).toContain('—');
  });

  it('renders count tiles, optionally without the zero counts', () => {
    const tiles = countTiles({ MERGED: 3, FAILED: 0 });
    expect(tiles).toContain('<span class="tile-count">3</span><span class="tile-label">Merged</span>');
    expect(tiles).toContain('tile-zero');
    expect(countTiles({ MERGED: 3, FAILED: 0 }, { hideZero: true })).not.toContain('Failed');
    expect(countTiles({})).toBe('');
  });

  it('draws progress as a bounded percentage', () => {
    expect(progressBar(2, 8, '2 of 8 merged')).toContain('width: 25%');
    expect(progressBar(0, 0, 'nothing yet')).toContain('width: 0%');
  });

  it('marks the active section and produces a safe document', () => {
    const html = renderPage({
      title: 'T',
      heading: 'H',
      section: 'ideas',
      generatedAt: '2026-09-18T12:00:00Z',
      body: '<p>body</p>',
    });
    expect(html).toContain('<a href="/ideas" class="active" aria-current="page">Ideas</a>');
    expect(html).toContain('<a href="/">Dashboard</a>');
    expect(html).toContain('Generated at: 2026-09-18T12:00:00Z');
    expectSafeDocument(html);
  });
});
