import { describe, expect, it } from 'vitest';

import {
  IdeaSummarySchema,
  toIdeaSummary,
} from './ideaSummary.js';

interface Idea {
  schema_version: 1;
  idea_id: string;
  operator_id: string;
  classification: 'public';
  content: string;
  content_sha256: string;
  created_at: string;
  provenance: {
    origin: 'local-manual';
  };
}

function makeIdea(overrides: Partial<Idea> = {}): Idea {
  return {
    schema_version: 1,
    idea_id: 'idea-1',
    operator_id: 'operator-1',
    classification: 'public',
    content: 'A concise idea to project into the idea read model.',
    content_sha256: '0123456789abcdef',
    created_at: '2026-01-15T10:30:00Z',
    provenance: { origin: 'local-manual' },
    ...overrides,
  };
}

describe('toIdeaSummary', () => {
  it('carries fields through unchanged and computes origin and content_length', () => {
    const idea = makeIdea();
    const summary = toIdeaSummary(idea);

    expect(summary).toEqual({
      idea_id: idea.idea_id,
      operator_id: idea.operator_id,
      classification: idea.classification,
      content_sha256: idea.content_sha256,
      created_at: idea.created_at,
      origin: idea.provenance.origin,
      content_length: idea.content.length,
      excerpt: idea.content,
    });
  });

  it('returns content of 120 characters or fewer whole with no ellipsis', () => {
    const atLimit = 'a'.repeat(120);
    const short = 'a'.repeat(10);

    expect(toIdeaSummary(makeIdea({ content: atLimit })).excerpt).toBe(atLimit);
    expect(toIdeaSummary(makeIdea({ content: short })).excerpt).toBe(short);
  });

  it('truncates content longer than 120 characters to exactly 120 ending in U+2026', () => {
    const content = 'a'.repeat(130);
    const summary = toIdeaSummary(makeIdea({ content }));

    expect(summary.excerpt).toHaveLength(120);
    expect(summary.excerpt.endsWith('\u2026')).toBe(true);
    expect(summary.excerpt).toBe('a'.repeat(119) + '\u2026');
  });

  it('collapses newlines, tabs and repeated spaces to single spaces and trims', () => {
    const content = '  lead\ttrail  \n\n  middle   spaces\t\tend  ';
    const summary = toIdeaSummary(makeIdea({ content }));

    expect(summary.excerpt).toBe('lead trail middle spaces end');
  });

  it('throws for an invalid created_at naming the idea_id and the value', () => {
    const idea = makeIdea({ created_at: '2026' });

    expect(() => toIdeaSummary(idea)).toThrowError('idea-1');
    expect(() => toIdeaSummary(idea)).toThrowError('2026');
  });

  it('does not mutate its input', () => {
    const idea = makeIdea({ content: '  alpha\n  beta\t gamma  ' });
    const snapshot = JSON.parse(JSON.stringify(idea));

    toIdeaSummary(idea);

    expect(idea).toEqual(snapshot);
  });

  it('is pure: the same input produces the same summary', () => {
    const idea = makeIdea();

    expect(toIdeaSummary(idea)).toEqual(toIdeaSummary(idea));
  });
});

describe('IdeaSummarySchema', () => {
  it('accepts every summary toIdeaSummary builds', () => {
    const ideas: Idea[] = [
      makeIdea(),
      makeIdea({ content: 'short' }),
      makeIdea({ content: 'a'.repeat(200) }),
      makeIdea({
        content: '  multi\nline\tcontent   with whitespace  ',
        created_at: '2026-02-03T04:05:06+01:00',
      }),
    ];

    for (const idea of ideas) {
      const summary = toIdeaSummary(idea);
      expect(IdeaSummarySchema.parse(summary)).toEqual(summary);
    }
  });

  it('rejects a negative content_length', () => {
    const result = IdeaSummarySchema.safeParse({
      idea_id: 'idea-1',
      operator_id: 'operator-1',
      classification: 'public',
      content_sha256: '0123456789abcdef',
      created_at: '2026-01-15T10:30:00Z',
      origin: 'local-manual',
      content_length: -1,
      excerpt: 'hello',
    });

    expect(result.success).toBe(false);
  });
});
