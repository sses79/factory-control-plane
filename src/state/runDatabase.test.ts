import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import { readRunSummaries } from './runDatabase.js';

function createDatabase(): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE runs (
      run_id TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      document TEXT NOT NULL
    );
    CREATE TABLE attempts (
      attempt_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      document TEXT NOT NULL
    );
    CREATE TABLE side_effects (
      operation_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      attempt_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      document TEXT NOT NULL
    );
  `);
  return database;
}

function insertRun(database: DatabaseSync, runId: string, document: unknown): void {
  database
    .prepare('INSERT INTO runs (run_id, version, document) VALUES (?, 1, ?)')
    .run(runId, JSON.stringify(document));
}

function insertAttempt(
  database: DatabaseSync,
  attemptId: string,
  runId: string,
  ordinal: number,
  document: unknown,
): void {
  database
    .prepare(
      'INSERT INTO attempts (attempt_id, run_id, ordinal, document) VALUES (?, ?, ?, ?)',
    )
    .run(attemptId, runId, ordinal, JSON.stringify(document));
}

function insertSideEffect(
  database: DatabaseSync,
  operationId: string,
  runId: string,
  attemptId: string,
  idempotencyKey: string,
  document: unknown,
): void {
  database
    .prepare(
      'INSERT INTO side_effects (operation_id, run_id, attempt_id, idempotency_key, document) VALUES (?, ?, ?, ?, ?)',
    )
    .run(operationId, runId, attemptId, idempotencyKey, JSON.stringify(document));
}

function runDocument(
  runId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    run_id: runId,
    feature_id: 'feature_abc',
    target_repository: 'acme/control',
    state: 'BUILDING',
    created_at: '2026-09-13T09:00:00.000Z',
    updated_at: '2026-09-13T09:05:00.000Z',
    ...overrides,
  };
}

function attemptDocument(
  attemptId: string,
  ordinal: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    attempt_id: attemptId,
    ordinal,
    status: 'ACTIVE',
    ...overrides,
  };
}

describe('readRunSummaries', () => {
  it('returns an empty array for an empty database', () => {
    const database = createDatabase();
    expect(readRunSummaries(database)).toEqual([]);
  });

  it('builds one summary per run with attempt_count and earliest started_at', () => {
    const database = createDatabase();
    insertRun(database, 'run_b', runDocument('run_b'));
    insertRun(database, 'run_a', runDocument('run_a'));
    insertAttempt(
      database,
      'attempt_1',
      'run_a',
      1,
      attemptDocument('attempt_1', 1, { started_at: '2026-09-13T09:02:00.000Z' }),
    );
    insertAttempt(
      database,
      'attempt_2',
      'run_a',
      2,
      attemptDocument('attempt_2', 2, { started_at: '2026-09-13T09:01:00.000Z' }),
    );
    insertAttempt(
      database,
      'attempt_3',
      'run_b',
      1,
      attemptDocument('attempt_3', 1, { started_at: '2026-09-13T09:03:00.000Z' }),
    );

    const summaries = readRunSummaries(database);
    expect(summaries).toEqual([
      expect.objectContaining({
        run_id: 'run_a',
        feature_id: 'feature_abc',
        target_repository: 'acme/control',
        state: 'BUILDING',
        attempt_count: 2,
        started_at: '2026-09-13T09:01:00.000Z',
      }),
      expect.objectContaining({
        run_id: 'run_b',
        attempt_count: 1,
        started_at: '2026-09-13T09:03:00.000Z',
      }),
    ]);
  });

  it('does not count attempts belonging to another run', () => {
    const database = createDatabase();
    insertRun(database, 'run_1', runDocument('run_1'));
    insertRun(database, 'run_2', runDocument('run_2'));
    insertAttempt(database, 'attempt_1', 'run_1', 1, attemptDocument('attempt_1', 1));
    insertAttempt(database, 'attempt_2', 'run_2', 1, attemptDocument('attempt_2', 1));
    insertAttempt(database, 'attempt_3', 'run_2', 2, attemptDocument('attempt_3', 2));

    const summaries = readRunSummaries(database);
    expect(summaries).toEqual([
      expect.objectContaining({ run_id: 'run_1', attempt_count: 1 }),
      expect.objectContaining({ run_id: 'run_2', attempt_count: 2 }),
    ]);
  });

  it('uses the url of the last COMPLETED draft-pr side effect', () => {
    const database = createDatabase();
    insertRun(database, 'run_1', runDocument('run_1'));
    insertAttempt(database, 'attempt_1', 'run_1', 1, attemptDocument('attempt_1', 1));
    insertSideEffect(database, 'op_1', 'run_1', 'attempt_1', 'key_1', {
      kind: 'draft-pr',
      certainty: 'OUTCOME_UNKNOWN',
      result: { url: 'https://github.com/acme/control/pull/99' },
    });
    insertSideEffect(database, 'op_2', 'run_1', 'attempt_1', 'key_2', {
      kind: 'draft-pr',
      certainty: 'COMPLETED',
      result: { url: 'https://github.com/acme/control/pull/1' },
    });
    insertSideEffect(database, 'op_3', 'run_1', 'attempt_1', 'key_3', {
      kind: 'draft-pr',
      certainty: 'COMPLETED',
      result: { url: 'https://github.com/acme/control/pull/2' },
    });

    const summaries = readRunSummaries(database);
    expect(summaries[0]!.pull_request_url).toBe('https://github.com/acme/control/pull/2');
  });

  it('omits pull_request_url when there is no COMPLETED draft-pr side effect', () => {
    const database = createDatabase();
    insertRun(database, 'run_1', runDocument('run_1'));
    insertAttempt(database, 'attempt_1', 'run_1', 1, attemptDocument('attempt_1', 1));
    insertSideEffect(database, 'op_1', 'run_1', 'attempt_1', 'key_1', {
      kind: 'draft-pr',
      certainty: 'NOT_STARTED',
      result: { url: 'https://github.com/acme/control/pull/1' },
    });

    const summaries = readRunSummaries(database);
    expect(summaries[0]!).not.toHaveProperty('pull_request_url');
  });

  it('does not set pull_request_url from a draft-pr with certainty OUTCOME_UNKNOWN', () => {
    const database = createDatabase();
    insertRun(database, 'run_1', runDocument('run_1'));
    insertAttempt(database, 'attempt_1', 'run_1', 1, attemptDocument('attempt_1', 1));
    insertSideEffect(database, 'op_1', 'run_1', 'attempt_1', 'key_1', {
      kind: 'draft-pr',
      certainty: 'OUTCOME_UNKNOWN',
      result: { url: 'https://github.com/acme/control/pull/1' },
    });

    const summaries = readRunSummaries(database);
    expect(summaries[0]!).not.toHaveProperty('pull_request_url');
  });

  it('uses the branch of the last COMPLETED publish-branch side effect', () => {
    const database = createDatabase();
    insertRun(database, 'run_1', runDocument('run_1'));
    insertAttempt(database, 'attempt_1', 'run_1', 1, attemptDocument('attempt_1', 1));
    insertSideEffect(database, 'op_1', 'run_1', 'attempt_1', 'key_1', {
      kind: 'publish-branch',
      certainty: 'COMPLETED',
      result: { branch: 'feat/old' },
    });
    insertSideEffect(database, 'op_2', 'run_1', 'attempt_1', 'key_2', {
      kind: 'publish-branch',
      certainty: 'COMPLETED',
      result: { branch: 'feat/new' },
    });

    const summaries = readRunSummaries(database);
    expect(summaries[0]!.branch).toBe('feat/new');
  });

  it('omits branch when there is no COMPLETED publish-branch side effect', () => {
    const database = createDatabase();
    insertRun(database, 'run_1', runDocument('run_1'));
    insertAttempt(database, 'attempt_1', 'run_1', 1, attemptDocument('attempt_1', 1));
    insertSideEffect(database, 'op_1', 'run_1', 'attempt_1', 'key_1', {
      kind: 'publish-branch',
      certainty: 'OUTCOME_UNKNOWN',
      result: { branch: 'feat/old' },
    });

    const summaries = readRunSummaries(database);
    expect(summaries[0]!).not.toHaveProperty('branch');
  });

  it('omits url and branch when the result value is not a string', () => {
    const database = createDatabase();
    insertRun(database, 'run_1', runDocument('run_1'));
    insertAttempt(database, 'attempt_1', 'run_1', 1, attemptDocument('attempt_1', 1));
    insertSideEffect(database, 'op_1', 'run_1', 'attempt_1', 'key_1', {
      kind: 'draft-pr',
      certainty: 'COMPLETED',
      result: { url: 42 },
    });
    insertSideEffect(database, 'op_2', 'run_1', 'attempt_1', 'key_2', {
      kind: 'publish-branch',
      certainty: 'COMPLETED',
      result: { branch: false },
    });

    const summaries = readRunSummaries(database);
    expect(summaries[0]!).not.toHaveProperty('pull_request_url');
    expect(summaries[0]!).not.toHaveProperty('branch');
  });

  it('ignores side effects belonging to another run', () => {
    const database = createDatabase();
    insertRun(database, 'run_1', runDocument('run_1'));
    insertRun(database, 'run_2', runDocument('run_2'));
    insertAttempt(database, 'attempt_1', 'run_1', 1, attemptDocument('attempt_1', 1));
    insertAttempt(database, 'attempt_2', 'run_2', 1, attemptDocument('attempt_2', 1));
    insertSideEffect(database, 'op_1', 'run_2', 'attempt_2', 'key_1', {
      kind: 'draft-pr',
      certainty: 'COMPLETED',
      result: { url: 'https://github.com/acme/control/pull/9' },
    });
    insertSideEffect(database, 'op_2', 'run_2', 'attempt_2', 'key_2', {
      kind: 'publish-branch',
      certainty: 'COMPLETED',
      result: { branch: 'feat/other' },
    });

    const summaries = readRunSummaries(database);
    expect(summaries[0]!).not.toHaveProperty('pull_request_url');
    expect(summaries[0]!).not.toHaveProperty('branch');
  });

  it('orders summaries by run_id ascending regardless of insertion order', () => {
    const database = createDatabase();
    insertRun(database, 'run_c', runDocument('run_c'));
    insertRun(database, 'run_a', runDocument('run_a'));
    insertRun(database, 'run_b', runDocument('run_b'));

    const summaries = readRunSummaries(database);
    expect(summaries.map((summary) => summary.run_id)).toEqual(['run_a', 'run_b', 'run_c']);
  });

  it('ignores extra fields in run, attempt and side-effect documents', () => {
    const database = createDatabase();
    insertRun(
      database,
      'run_1',
      runDocument('run_1', { extra: 'value', nested: { deep: true } }),
    );
    insertAttempt(
      database,
      'attempt_1',
      'run_1',
      1,
      attemptDocument('attempt_1', 1, {
        started_at: '2026-09-13T09:01:00.000Z',
        extra_attempt: 42,
      }),
    );
    insertSideEffect(database, 'op_1', 'run_1', 'attempt_1', 'key_1', {
      kind: 'draft-pr',
      certainty: 'COMPLETED',
      result: { url: 'https://github.com/acme/control/pull/7', extra: { anything: true } },
      other: 'field',
    });

    expect(readRunSummaries(database)).toEqual([
      expect.objectContaining({
        run_id: 'run_1',
        feature_id: 'feature_abc',
        target_repository: 'acme/control',
        state: 'BUILDING',
        attempt_count: 1,
        started_at: '2026-09-13T09:01:00.000Z',
        pull_request_url: 'https://github.com/acme/control/pull/7',
      }),
    ]);
  });

  it('throws for a run document that is not valid JSON, naming the runs table and run_id', () => {
    const database = createDatabase();
    database
      .prepare('INSERT INTO runs (run_id, version, document) VALUES (?, 1, ?)')
      .run('run_bad', '{not valid json');

    expect(() => readRunSummaries(database)).toThrow(/runs/);
    expect(() => readRunSummaries(database)).toThrow(/run_bad/);
  });

  it('throws for an attempt document missing status, naming the attempts table and attempt_id', () => {
    const database = createDatabase();
    insertRun(database, 'run_1', runDocument('run_1'));
    database
      .prepare('INSERT INTO attempts (attempt_id, run_id, ordinal, document) VALUES (?, ?, ?, ?)')
      .run(
        'attempt_bad',
        'run_1',
        1,
        JSON.stringify({ attempt_id: 'attempt_bad', ordinal: 1 }),
      );

    expect(() => readRunSummaries(database)).toThrow(/attempts/);
    expect(() => readRunSummaries(database)).toThrow(/attempt_bad/);
  });

  it('throws for a side-effect document that is not valid JSON, naming the side_effects table and operation_id', () => {
    const database = createDatabase();
    insertRun(database, 'run_1', runDocument('run_1'));
    insertAttempt(database, 'attempt_1', 'run_1', 1, attemptDocument('attempt_1', 1));
    database
      .prepare(
        'INSERT INTO side_effects (operation_id, run_id, attempt_id, idempotency_key, document) VALUES (?, ?, ?, ?, ?)',
      )
      .run('op_bad', 'run_1', 'attempt_1', 'key_bad', '{not valid json');

    expect(() => readRunSummaries(database)).toThrow(/side_effects/);
    expect(() => readRunSummaries(database)).toThrow(/op_bad/);
  });

  it('performs no writes to the database', () => {
    const database = createDatabase();
    insertRun(database, 'run_1', runDocument('run_1'));
    insertAttempt(
      database,
      'attempt_1',
      'run_1',
      1,
      attemptDocument('attempt_1', 1, { started_at: '2026-09-13T09:01:00.000Z' }),
    );
    insertSideEffect(database, 'op_1', 'run_1', 'attempt_1', 'key_1', {
      kind: 'publish-branch',
      certainty: 'COMPLETED',
      result: { branch: 'feat/read-model' },
    });
    database.exec(`
      CREATE TRIGGER no_run_inserts BEFORE INSERT ON runs BEGIN SELECT RAISE(ABORT, 'write'); END;
      CREATE TRIGGER no_run_updates BEFORE UPDATE ON runs BEGIN SELECT RAISE(ABORT, 'write'); END;
      CREATE TRIGGER no_run_deletes BEFORE DELETE ON runs BEGIN SELECT RAISE(ABORT, 'write'); END;
      CREATE TRIGGER no_attempt_inserts BEFORE INSERT ON attempts BEGIN SELECT RAISE(ABORT, 'write'); END;
      CREATE TRIGGER no_attempt_updates BEFORE UPDATE ON attempts BEGIN SELECT RAISE(ABORT, 'write'); END;
      CREATE TRIGGER no_attempt_deletes BEFORE DELETE ON attempts BEGIN SELECT RAISE(ABORT, 'write'); END;
      CREATE TRIGGER no_side_effect_inserts BEFORE INSERT ON side_effects BEGIN SELECT RAISE(ABORT, 'write'); END;
      CREATE TRIGGER no_side_effect_updates BEFORE UPDATE ON side_effects BEGIN SELECT RAISE(ABORT, 'write'); END;
      CREATE TRIGGER no_side_effect_deletes BEFORE DELETE ON side_effects BEGIN SELECT RAISE(ABORT, 'write'); END;
    `);

    expect(() => readRunSummaries(database)).not.toThrow();
  });
});
