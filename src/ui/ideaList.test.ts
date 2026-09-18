import { describe, expect, it } from 'vitest';

import { PACKET_STATUSES } from '../blueprintStatus.js';
import type { BlueprintStatus } from '../blueprintStatus.js';
import type { IdeaSummary } from '../ideaSummary.js';

import { renderIdeaList, type IdeaListEntry } from './ideaList.js';

const GENERATED_AT = '2026-09-18T12:00:00+00:00';
const CREATED_AT = '2026-09-18T10:00:00+00:00';

const TOTALS: BlueprintStatus['totals'] = {
  NOT_STARTED: 1,
  QUEUED: 2,
  RUNNING: 3,
  AWAITING_REVIEW: 4,
  MERGED: 0,
  FAILED: 5,
};

function idea(id: string, excerpt = 'Example idea excerpt.'): IdeaSummary {
  return {
    idea_id: id,
    operator_id: 'operator-1',
    classification: 'public',
    content_sha256: 'a'.repeat(64),
    created_at: CREATED_AT,
    origin: 'local-manual',
    content_length: 351,
    excerpt,
  };
}

function fullEntry(id = 'idea-1'): IdeaListEntry {
  return {
    idea: idea(id),
    plan_revision: 3,
    blueprint: { revision: 2, totals: TOTALS },
  };
}

function fullEntries(): IdeaListEntry[] {
  return [fullEntry('idea-1'), { idea: idea('idea-2') }];
}

function tagAttributeNames(html: string): string[] {
  const names: string[] = [];
  const tagPattern =
    /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[a-zA-Z][a-zA-Z0-9-]*\s*=\s*"[^"]*")*)\s*\/?>/g;
  let tag: RegExpExecArray | null;
  while ((tag = tagPattern.exec(html)) !== null) {
    const attributes = tag[2] ?? '';
    const attributePattern = /\s+([a-zA-Z][a-zA-Z0-9-]*)\s*=/g;
    let attribute: RegExpExecArray | null;
    while ((attribute = attributePattern.exec(attributes)) !== null) {
      names.push(attribute[1]!);
    }
  }
  return names;
}

describe('renderIdeaList', () => {
  it('returns an HTML5 document titled Ideas with a link back to /', () => {
    const html = renderIdeaList({
      ideas: fullEntries(),
      generatedAt: GENERATED_AT,
    });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Ideas</title>');
    expect(html).toContain('<h1>Ideas</h1>');
    expect(html).toContain('<a href="/">');
    expect(html).toContain(`Generated at: ${GENERATED_AT}`);
  });

  it('renders one row per entry in the order given with the idea id linked to its encoded id', () => {
    const html = renderIdeaList({
      ideas: fullEntries(),
      generatedAt: GENERATED_AT,
    });
    expect(html).toContain(
      '<thead><tr><th>Idea</th><th>Excerpt</th><th>Created</th><th>Plan</th><th>Blueprint</th></tr></thead>',
    );
    expect(html).toContain('<a href="/ideas/idea-1">idea-1</a>');
    expect(html).toContain('<a href="/ideas/idea-2">idea-2</a>');
    const firstRow = html.indexOf('idea-1');
    const secondRow = html.indexOf('idea-2');
    expect(firstRow).toBeGreaterThan(-1);
    expect(secondRow).toBeGreaterThan(firstRow);
  });

  it('shows the excerpt and created_at in each row', () => {
    const html = renderIdeaList({
      ideas: fullEntries(),
      generatedAt: GENERATED_AT,
    });
    expect(html).toContain('<td>Example idea excerpt.</td>');
    expect(html).toContain(`<td>${CREATED_AT}</td>`);
  });

  it('shows the plan revision when present and No plan otherwise', () => {
    const html = renderIdeaList({
      ideas: fullEntries(),
      generatedAt: GENERATED_AT,
    });
    expect(html).toContain('<td>rev 3</td>');
    expect(html).toContain('<td>No plan</td>');
  });

  it('shows the blueprint revision and totals in PACKET_STATUSES order when present and No blueprint otherwise', () => {
    const html = renderIdeaList({
      ideas: fullEntries(),
      generatedAt: GENERATED_AT,
    });
    const totals = PACKET_STATUSES.map(
      (status) => `${status}: ${TOTALS[status]}`,
    ).join(', ');
    expect(html).toContain(`<td>rev 2 ${totals}</td>`);
    expect(html).toContain('<td>No blueprint</td>');
    expect(totals).toBe(
      'NOT_STARTED: 1, QUEUED: 2, RUNNING: 3, AWAITING_REVIEW: 4, MERGED: 0, FAILED: 5',
    );
  });

  it('renders No ideas recorded. and no table for an empty list', () => {
    const html = renderIdeaList({ ideas: [], generatedAt: GENERATED_AT });
    expect(html).toContain('<p>No ideas recorded.</p>');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('<tr>');
  });

  it('escapes an idea_id or excerpt containing markup', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const html = renderIdeaList({
      ideas: [{ idea: idea(payload, payload) }],
      generatedAt: GENERATED_AT,
    });
    const escaped = '&lt;img src=x onerror=alert(1)&gt;';
    expect(html).toContain(
      `<a href="/ideas/%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E">${escaped}</a>`,
    );
    expect(html).toContain(`<td>${escaped}</td>`);
    expect(html).not.toContain(payload);
  });

  it('encodes an idea_id containing a slash or quote in its link', () => {
    const html = renderIdeaList({
      ideas: [{ idea: idea('idea/with"quote') }],
      generatedAt: GENERATED_AT,
    });
    expect(html).toContain(
      '<a href="/ideas/idea%2Fwith%22quote">idea/with&quot;quote</a>',
    );
    expect(html).not.toContain('href="/ideas/idea/with"');
  });

  it('escapes the generated timestamp', () => {
    const html = renderIdeaList({
      ideas: [],
      generatedAt: '2026-09-18T12:00:00 & <now>',
    });
    expect(html).toContain(
      'Generated at: 2026-09-18T12:00:00 &amp; &lt;now&gt;',
    );
  });

  it('contains no script element, on-prefixed attribute or external resource', () => {
    const html = renderIdeaList({
      ideas: fullEntries(),
      generatedAt: GENERATED_AT,
    });
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/<\/script\b/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/<img\b/i);

    const attributes = tagAttributeNames(html);
    expect(
      attributes.some((name) => name.toLowerCase().startsWith('on')),
    ).toBe(false);
    expect(attributes).not.toContain('src');

    const styleElements = html.match(/<style[\s>][\s\S]*?<\/style>/g) ?? [];
    expect(styleElements).toHaveLength(1);
    expect(styleElements[0]).toMatch(/^<style>/);
  });

  it('does not mutate its input and produces deterministic output', () => {
    const entries = fullEntries();
    const snapshot = structuredClone(entries);
    const first = renderIdeaList({ ideas: entries, generatedAt: GENERATED_AT });
    const second = renderIdeaList({ ideas: entries, generatedAt: GENERATED_AT });
    expect(entries).toEqual(snapshot);
    expect(second).toEqual(first);
  });
});
