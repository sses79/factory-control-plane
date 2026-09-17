import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DatabaseSync } from 'node:sqlite';

import { readIdeas } from './ideaDatabase.js';

describe('readIdeas', () => {
  let database: DatabaseSync;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec(`
      CREATE TABLE idea_inbox (
        idea_id TEXT PRIMARY KEY,
        operator_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        document TEXT NOT NULL
      )
    `);
  });

  afterEach(() => {
    database.close();
  });

  function makeDocument(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      schema_version: 1,
      idea_id: 'idea-1',
      operator_id: 'operator-1',
      classification: 'public',
      content: 'A concise idea to project into the idea read model.',
      content_sha256: '0123456789abcdef',
      created_at: '2026-01-15T10:30:00Z',
      provenance: { origin: 'local-manual' },
      ...overrides,
    });
  }

  function insertIdea(ideaId: string, createdAt: string, document: string): void {
    database
      .prepare(
        'INSERT INTO idea_inbox (idea_id, operator_id, created_at, document) VALUES (?, ?, ?, ?)',
      )
      .run(ideaId, 'operator-1', createdAt, document);
  }

  function expectedSummary(): Record<string, unknown> {
    return {
      idea_id: 'idea-1',
      operator_id: 'operator-1',
      classification: 'public',
      content_sha256: '0123456789abcdef',
      created_at: '2026-01-15T10:30:00Z',
      origin: 'local-manual',
      content_length: 51,
      excerpt: 'A concise idea to project into the idea read model.',
    };
  }

  it('returns one summary per idea row', () => {
    insertIdea('idea-1', '2026-01-15T10:30:00Z', makeDocument());

    expect(readIdeas(database)).toEqual([expectedSummary()]);
  });

  it('orders by created_at descending then idea_id ascending', () => {
    insertIdea(
      'idea-b',
      '2026-01-15T00:00:00Z',
      makeDocument({ idea_id: 'idea-b', created_at: '2026-01-15T00:00:00Z' }),
    );
    insertIdea(
      'idea-c',
      '2026-01-17T00:00:00Z',
      makeDocument({ idea_id: 'idea-c', created_at: '2026-01-17T00:00:00Z' }),
    );
    insertIdea(
      'idea-a',
      '2026-01-15T00:00:00Z',
      makeDocument({ idea_id: 'idea-a', created_at: '2026-01-15T00:00:00Z' }),
    );

    const ideaIds = readIdeas(database).map((summary) => summary.idea_id);

    expect(ideaIds).toEqual(['idea-c', 'idea-a', 'idea-b']);
  });

  it('returns an empty array for an empty idea_inbox table', () => {
    expect(readIdeas(database)).toEqual([]);
  });

  it('ignores extra fields in the document', () => {
    insertIdea(
      'idea-1',
      '2026-01-15T10:30:00Z',
      makeDocument({
        extra_field: 'ignored',
        nested: { anything: true },
      }),
    );

    expect(readIdeas(database)).toEqual([expectedSummary()]);
  });

  it('throws an Error naming the idea_id when the document is not valid JSON', () => {
    insertIdea('idea-invalid-json', '2026-01-15T10:30:00Z', '{not valid json');

    expect(() => readIdeas(database)).toThrowError('idea-invalid-json');
  });

  it('throws an Error naming the idea_id when content is missing', () => {
    insertIdea(
      'idea-missing-content',
      '2026-01-15T10:30:00Z',
      makeDocument({ content: undefined }),
    );

    expect(() => readIdeas(database)).toThrowError('idea-missing-content');
  });

  it('throws an Error naming the idea_id when created_at is not ISO-8601', () => {
    insertIdea(
      'idea-invalid-date',
      '2026-01-15T10:30:00Z',
      makeDocument({ created_at: '2026' }),
    );

    expect(() => readIdeas(database)).toThrowError('idea-invalid-date');
  });

  it('performs no writes to the database', () => {
    insertIdea('idea-1', '2026-01-15T10:30:00Z', makeDocument());
    const before = database
      .prepare(
        'SELECT idea_id, operator_id, created_at, document FROM idea_inbox',
      )
      .all();

    readIdeas(database);

    const after = database
      .prepare(
        'SELECT idea_id, operator_id, created_at, document FROM idea_inbox',
      )
      .all();

    expect(after).toEqual(before);
  });
});
