import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import {
  QueueEntrySchema,
  readQueueEntries,
} from './queueDatabase.js';

interface QueueRow {
  entry_id: string;
  packet_sha256: string;
  status: string;
  queued_at: string;
  document: string;
}

interface QueueDocument {
  entry_id: string;
  feature_id: string;
  target_repository: string;
  status: string;
  queued_at: string;
  claimed_at?: string;
  finished_at?: string;
  run_id?: string;
  run_name?: string;
  state_dir?: string;
  pull_request_url?: string;
  terminal_reason?: string;
  requeued_from?: string;
  packet_path?: string;
  packet_sha256?: string;
  repository_path?: string;
  original_packet_sha256?: string;
  schema_version?: number;
}

function makeDocument(overrides: Partial<QueueDocument> = {}): QueueDocument {
  return {
    entry_id: 'entry-1',
    feature_id: 'feature-1',
    target_repository: 'acme/widgets',
    status: 'QUEUED',
    queued_at: '2026-01-15T10:30:00Z',
    ...overrides,
  };
}

function makeRow(
  entryId: string,
  document: string,
  queuedAt: string,
  status = 'QUEUED',
): QueueRow {
  return {
    entry_id: entryId,
    packet_sha256: `packet-${entryId}`,
    status,
    queued_at: queuedAt,
    document,
  };
}

function createDatabase(rows: QueueRow[]): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE packet_queue (
      entry_id TEXT PRIMARY KEY,
      packet_sha256 TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      queued_at TEXT NOT NULL,
      document TEXT NOT NULL
    );
  `);
  const insert = database.prepare(
    `INSERT INTO packet_queue (entry_id, packet_sha256, status, queued_at, document)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const row of rows) {
    insert.run(
      row.entry_id,
      row.packet_sha256,
      row.status,
      row.queued_at,
      row.document,
    );
  }
  return database;
}

describe('readQueueEntries', () => {
  it('returns an empty array for an empty packet_queue table', () => {
    const database = createDatabase([]);

    expect(readQueueEntries(database)).toEqual([]);
  });

  it('carries required fields and every present optional field through unchanged', () => {
    const document = makeDocument({
      entry_id: 'entry-1',
      status: 'CLAIMED',
      claimed_at: '2026-01-15T10:31:00Z',
      finished_at: '2026-01-15T10:32:00Z',
      run_id: 'run-1',
      run_name: 'factory-default',
      state_dir: '/var/lib/factory/runs/run-1',
      pull_request_url: 'https://github.com/acme/widgets/pull/42',
      terminal_reason: 'tests passed',
      requeued_from: 'entry-0',
      packet_path: '/tmp/packets/packet-1.json',
      packet_sha256: 'packet-sha-ignored',
      repository_path: '/repos/acme/widgets',
      original_packet_sha256: 'original-sha-ignored',
      schema_version: 1,
    });
    const database = createDatabase([
      makeRow('entry-1', JSON.stringify(document), '2026-01-15T10:30:00Z'),
    ]);

    const [entry] = readQueueEntries(database);

    expect(entry).toEqual({
      entry_id: 'entry-1',
      feature_id: 'feature-1',
      target_repository: 'acme/widgets',
      status: 'CLAIMED',
      queued_at: '2026-01-15T10:30:00Z',
      claimed_at: '2026-01-15T10:31:00Z',
      finished_at: '2026-01-15T10:32:00Z',
      run_id: 'run-1',
      run_name: 'factory-default',
      run_dir: 'run-1',
      pull_request_url: 'https://github.com/acme/widgets/pull/42',
      terminal_reason: 'tests passed',
      requeued_from: 'entry-0',
    });
    expect(entry).not.toHaveProperty('state_dir');
    expect(entry).not.toHaveProperty('packet_path');
    expect(entry).not.toHaveProperty('repository_path');
  });

  it('derives run_dir from the last path segment of state_dir', () => {
    const database = createDatabase([
      makeRow(
        'entry-1',
        JSON.stringify(
          makeDocument({ entry_id: 'entry-1', state_dir: '/var/lib/factory/runs/run-1/' }),
        ),
        '2026-01-15T10:30:00Z',
      ),
      makeRow(
        'entry-2',
        JSON.stringify(
          makeDocument({ entry_id: 'entry-2', state_dir: 'C:\\factory\\runs\\run-2' }),
        ),
        '2026-01-15T10:31:00Z',
      ),
    ]);

    const entries = readQueueEntries(database);

    expect(entries[0]?.run_dir).toBe('run-1');
    expect(entries[1]?.run_dir).toBe('run-2');
  });

  it('omits run_dir when state_dir is absent', () => {
    const database = createDatabase([
      makeRow(
        'entry-1',
        JSON.stringify(makeDocument({ entry_id: 'entry-1', run_id: 'run-1' })),
        '2026-01-15T10:30:00Z',
      ),
    ]);

    const [entry] = readQueueEntries(database);

    expect(entry).not.toHaveProperty('run_dir');
  });

  it('orders entries by queued_at ascending then entry_id ascending', () => {
    const database = createDatabase([
      makeRow(
        'entry-late-b',
        JSON.stringify(makeDocument({ entry_id: 'entry-late-b', queued_at: '2026-01-15T10:30:00Z' })),
        '2026-01-15T10:30:00Z',
      ),
      makeRow(
        'entry-early',
        JSON.stringify(makeDocument({ entry_id: 'entry-early', queued_at: '2026-01-14T09:00:00Z' })),
        '2026-01-14T09:00:00Z',
      ),
      makeRow(
        'entry-late-a',
        JSON.stringify(makeDocument({ entry_id: 'entry-late-a', queued_at: '2026-01-15T10:30:00Z' })),
        '2026-01-15T10:30:00Z',
      ),
    ]);

    const entries = readQueueEntries(database);

    expect(entries.map((entry) => entry.entry_id)).toEqual([
      'entry-early',
      'entry-late-a',
      'entry-late-b',
    ]);
  });

  it('throws for an unknown status naming the row entry_id', () => {
    const database = createDatabase([
      makeRow(
        'entry-bad-status',
        JSON.stringify(makeDocument({ entry_id: 'entry-bad-status', status: 'RUNNING' })),
        '2026-01-15T10:30:00Z',
        'RUNNING',
      ),
    ]);

    expect(() => readQueueEntries(database)).toThrowError('entry-bad-status');
  });

  it('throws for an invalid queued_at naming the row entry_id', () => {
    const database = createDatabase([
      makeRow(
        'entry-bad-time',
        JSON.stringify(makeDocument({ entry_id: 'entry-bad-time', queued_at: '2026' })),
        '2026',
      ),
    ]);

    expect(() => readQueueEntries(database)).toThrowError('entry-bad-time');
  });

  it('throws for a document that is not valid JSON naming the row entry_id', () => {
    const database = createDatabase([
      makeRow('entry-bad-json', '{not valid json', '2026-01-15T10:30:00Z'),
    ]);

    expect(() => readQueueEntries(database)).toThrowError('entry-bad-json');
  });

  it('throws for a document missing a required field naming the row entry_id', () => {
    const partial = makeDocument({ entry_id: 'entry-missing' }) as Partial<QueueDocument>;
    delete partial.feature_id;
    const database = createDatabase([
      makeRow('entry-missing', JSON.stringify(partial), '2026-01-15T10:30:00Z'),
    ]);

    expect(() => readQueueEntries(database)).toThrowError('entry-missing');
  });

  it('only reads from the packet_queue table', () => {
    const database = createDatabase([
      makeRow('entry-1', JSON.stringify(makeDocument()), '2026-01-15T10:30:00Z'),
      makeRow(
        'entry-2',
        JSON.stringify(makeDocument({ entry_id: 'entry-2', queued_at: '2026-01-16T10:30:00Z' })),
        '2026-01-16T10:30:00Z',
      ),
    ]);
    const rowsBefore = database
      .prepare('SELECT * FROM packet_queue ORDER BY entry_id')
      .all();
    const tablesBefore = database
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .all();

    readQueueEntries(database);

    expect(database.prepare('SELECT * FROM packet_queue ORDER BY entry_id').all()).toEqual(
      rowsBefore,
    );
    expect(
      database
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
        .all(),
    ).toEqual(tablesBefore);
  });
});

describe('QueueEntrySchema', () => {
  it('accepts every entry readQueueEntries returns', () => {
    const database = createDatabase([
      makeRow(
        'entry-full',
        JSON.stringify(
          makeDocument({
            entry_id: 'entry-full',
            status: 'FAILED',
            claimed_at: '2026-01-15T10:31:00Z',
            finished_at: '2026-01-15T10:32:00Z',
            run_id: 'run-9',
            run_name: 'factory-default',
            state_dir: '/var/lib/factory/runs/run-9',
            pull_request_url: 'https://github.com/acme/widgets/pull/9',
            terminal_reason: 'flaky',
            requeued_from: 'entry-0',
          }),
        ),
        '2026-01-15T10:30:00Z',
      ),
      makeRow(
        'entry-minimal',
        JSON.stringify(
          makeDocument({ entry_id: 'entry-minimal', queued_at: '2026-02-03T04:05:06+01:00' }),
        ),
        '2026-01-15T10:30:00Z',
      ),
    ]);

    for (const entry of readQueueEntries(database)) {
      expect(QueueEntrySchema.parse(entry)).toEqual(entry);
    }
  });
});
