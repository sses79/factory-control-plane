import { describe, expect, it } from 'vitest';

import { PACKET_STATUSES } from '../blueprintStatus.js';
import type { BlueprintStatus } from '../blueprintStatus.js';
import type { IdeaSummary } from '../ideaSummary.js';

import { renderIdeaList, type IdeaListEntry } from './ideaList.js';
import { expectSafeDocument } from './testSafety.js';

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

describe('renderIdeaList', () => {
  it('returns a safe document titled Ideas with the ideas section active', () => {
    const html = renderIdeaList({ ideas: fullEntries(), generatedAt: GENERATED_AT });
    expect(html).toContain('<title>Ideas</title>');
    expect(html).toContain('<h1>Ideas</h1>');
    expect(html).toContain('<a href="/ideas" class="active" aria-current="page">Ideas</a>');
    expect(html).toContain('<a href="/">Dashboard</a>');
    expect(html).toContain(`Generated at: ${GENERATED_AT}`);
    expect(html).toContain('2 recorded');
    expectSafeDocument(html);
  });

  it('renders one row per entry in order, with the idea id linked to its encoded id', () => {
    const html = renderIdeaList({ ideas: fullEntries(), generatedAt: GENERATED_AT });
    expect(html).toContain('<a href="/ideas/idea-1">idea-1</a>');
    expect(html).toContain('<a href="/ideas/idea-2">idea-2</a>');
    expect(html.indexOf('idea-1')).toBeLessThan(html.indexOf('idea-2'));
  });

  it('shows the excerpt and the recorded time', () => {
    const html = renderIdeaList({ ideas: fullEntries(), generatedAt: GENERATED_AT });
    expect(html).toContain('<td class="wide">Example idea excerpt.</td>');
    expect(html).toContain(`<time datetime="${CREATED_AT}">2026-09-18 10:00:00</time>`);
  });

  it('shows the plan revision, or No plan', () => {
    const html = renderIdeaList({ ideas: fullEntries(), generatedAt: GENERATED_AT });
    expect(html).toContain('<td class="nowrap">rev 3</td>');
    expect(html).toContain('<td class="nowrap"><span class="muted">No plan</span></td>');
  });

  it('shows blueprint progress with every status count in PACKET_STATUSES order, or No blueprint', () => {
    const html = renderIdeaList({ ideas: fullEntries(), generatedAt: GENERATED_AT });
    const breakdown = PACKET_STATUSES.map((status) => `${status}: ${String(TOTALS[status])}`).join(', ');
    expect(breakdown).toBe('NOT_STARTED: 1, QUEUED: 2, RUNNING: 3, AWAITING_REVIEW: 4, MERGED: 0, FAILED: 5');
    expect(html).toContain(`<td title="${breakdown}"><span class="muted">rev 2</span>`);
    expect(html).toContain('0 of 15 merged');
    expect(html).toContain('<td><span class="muted">No blueprint</span></td>');
  });

  it('states an empty list instead of drawing an empty table', () => {
    const html = renderIdeaList({ ideas: [], generatedAt: GENERATED_AT });
    expect(html).toContain('<p class="empty">No ideas recorded.</p>');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('<tr>');
  });

  it('escapes an idea id or excerpt containing markup, and encodes the id in its link', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const html = renderIdeaList({
      ideas: [{ idea: idea('idea/with"quote', payload) }],
      generatedAt: GENERATED_AT,
    });
    expect(html).not.toContain(payload);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('href="/ideas/idea%2Fwith%22quote"');
    expectSafeDocument(html);
  });

  it('does not mutate its input and renders the same output twice', () => {
    const entries = fullEntries();
    const snapshot = structuredClone(entries);
    const first = renderIdeaList({ ideas: entries, generatedAt: GENERATED_AT });
    const second = renderIdeaList({ ideas: entries, generatedAt: GENERATED_AT });
    expect(entries).toEqual(snapshot);
    expect(second).toEqual(first);
  });
});
