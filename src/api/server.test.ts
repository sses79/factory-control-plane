import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi, type Mock } from 'vitest';

import { toRunList } from '../runList.js';
import { renderDashboard } from '../ui/dashboard.js';
import { routeRequest, type ReadSources } from './router.js';
import {
  createReadSources,
  createRequestHandler,
  startReadServer,
} from './server.js';

vi.mock('node:http', () => ({
  createServer: vi.fn(() => ({
    listen: vi.fn(),
  })),
}));

interface FakeResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  writeHead(status: number, headers: Record<string, string>): void;
  end(body: string): void;
}

function makeResponse(): FakeResponse {
  const response: FakeResponse = {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(status, headers) {
      response.statusCode = status;
      response.headers = headers;
    },
    end(body) {
      response.body = body;
    },
  };
  return response;
}

function createRunDatabase(runId: string): DatabaseSync {
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
  database
    .prepare('INSERT INTO runs (run_id, version, document) VALUES (?, 1, ?)')
    .run(
      runId,
      JSON.stringify({
        run_id: runId,
        feature_id: 'feature_abc',
        target_repository: 'acme/control',
        state: 'BUILDING',
        created_at: '2026-09-13T09:00:00.000Z',
        updated_at: '2026-09-13T09:05:00.000Z',
      }),
    );
  return database;
}

function createQueueDatabase(entryIds: string[]): DatabaseSync {
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
  for (const entryId of entryIds) {
    insert.run(
      entryId,
      `packet-${entryId}`,
      'QUEUED',
      '2026-01-15T10:30:00Z',
      JSON.stringify({
        entry_id: entryId,
        feature_id: 'feature-1',
        target_repository: 'acme/widgets',
        status: 'QUEUED',
        queued_at: '2026-01-15T10:30:00Z',
      }),
    );
  }
  return database;
}

interface RunSourcesOptions {
  directories?: string[];
  fileExists?: (path: string) => boolean;
  openDatabase?: (path: string) => DatabaseSync;
}

function makeRunSources(
  options: RunSourcesOptions = {},
): { sources: ReadSources; opened: DatabaseSync[] } {
  const opened: DatabaseSync[] = [];
  const sources = createReadSources({
    runsRoot: '/state/runs',
    queuePath: '/state/queue.sqlite',
    listDirectories: () => options.directories ?? ['run-1'],
    fileExists:
      options.fileExists ?? ((path: string) => path.endsWith('factory.sqlite')),
    openDatabase:
      options.openDatabase ??
      ((path: string) => {
        const database = createRunDatabase(path.split('/').at(-2) ?? 'run');
        opened.push(database);
        return database;
      }),
  });
  return { sources, opened };
}

interface QueueSourcesOptions {
  exists?: boolean;
  openDatabase?: (path: string) => DatabaseSync;
}

function makeQueueSources(
  options: QueueSourcesOptions = {},
): { sources: ReadSources; opened: DatabaseSync[] } {
  const opened: DatabaseSync[] = [];
  const sources = createReadSources({
    runsRoot: '/state/runs',
    queuePath: '/state/queue.sqlite',
    listDirectories: () => [],
    fileExists: (path: string) =>
      path.endsWith('queue.sqlite') && (options.exists ?? true),
    openDatabase:
      options.openDatabase ??
      ((path: string) => {
        const database = createQueueDatabase(['entry-1', 'entry-2']);
        opened.push(database);
        return database;
      }),
  });
  return { sources, opened };
}

describe('createReadSources', () => {
  it('returns the summaries of every run directory holding factory.sqlite in ascending directory order', () => {
    const { sources, opened } = makeRunSources({
      directories: ['run-b', 'run-a'],
    });

    expect(sources.listRunSummaries().map((summary) => summary.run_id)).toEqual([
      'run-a',
      'run-b',
    ]);
    expect(opened.map((database) => database.isOpen)).toEqual([false, false]);
  });

  it('skips a directory without factory.sqlite', () => {
    const { sources, opened } = makeRunSources({
      directories: ['run-a', 'run-b', 'run-c'],
      fileExists: (path: string) =>
        path !== join('/state/runs', 'run-b', 'factory.sqlite'),
    });

    expect(sources.listRunSummaries().map((summary) => summary.run_id)).toEqual([
      'run-a',
      'run-c',
    ]);
    expect(opened.map((database) => database.isOpen)).toEqual([false, false]);
  });

  it('closes every run database it opens, even when reading throws', () => {
    const { sources, opened } = makeRunSources({
      directories: ['run-bad'],
      openDatabase: () => {
        const database = new DatabaseSync(':memory:');
        database.exec(
          'CREATE TABLE runs (run_id TEXT PRIMARY KEY, version INTEGER NOT NULL, document TEXT NOT NULL)',
        );
        database
          .prepare('INSERT INTO runs (run_id, version, document) VALUES (?, 1, ?)')
          .run('run-bad', '{not valid json');
        opened.push(database);
        return database;
      },
    });

    expect(() => sources.listRunSummaries()).toThrow(/run-bad/);
    expect(opened.map((database) => database.isOpen)).toEqual([false]);
  });

  it('returns [] when the queue database does not exist', () => {
    const { sources } = makeQueueSources({ exists: false });

    expect(sources.listQueueEntries()).toEqual([]);
  });

  it('returns the entries of an existing queue database', () => {
    const { sources, opened } = makeQueueSources();

    expect(sources.listQueueEntries().map((entry) => entry.entry_id)).toEqual([
      'entry-1',
      'entry-2',
    ]);
    expect(opened.map((database) => database.isOpen)).toEqual([false]);
  });

  it('closes the queue database even when reading throws', () => {
    const { sources, opened } = makeQueueSources({
      openDatabase: () => {
        const database = new DatabaseSync(':memory:');
        database.exec(
          'CREATE TABLE packet_queue (entry_id TEXT PRIMARY KEY, packet_sha256 TEXT NOT NULL UNIQUE, status TEXT NOT NULL, queued_at TEXT NOT NULL, document TEXT NOT NULL)',
        );
        database
          .prepare(
            `INSERT INTO packet_queue (entry_id, packet_sha256, status, queued_at, document)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(
            'entry-bad',
            'packet-entry-bad',
            'QUEUED',
            '2026-01-15T10:30:00Z',
            '{not valid json',
          );
        opened.push(database);
        return database;
      },
    });

    expect(() => sources.listQueueEntries()).toThrow(/entry-bad/);
    expect(opened.map((database) => database.isOpen)).toEqual([false]);
  });
});

describe('createRequestHandler', () => {
  it('responds with the routed status, content-type and JSON body', () => {
    const { sources } = makeRunSources({ directories: ['run-1'] });
    const handler = createRequestHandler(sources);
    const response = makeResponse();

    handler(
      { method: 'GET', url: '/runs' } as unknown as IncomingMessage,
      response as unknown as ServerResponse,
    );

    const expected = routeRequest({ method: 'GET', url: '/runs' }, sources);
    expect(response.statusCode).toBe(expected.status);
    expect(response.headers).toEqual({
      'content-type': 'application/json; charset=utf-8',
    });
    expect(JSON.parse(response.body)).toEqual(expected.body);
  });

  it('writes HTML with its content-type, CSP and the raw dashboard body for GET /', () => {
    const generatedAt = '2026-01-01T00:00:00.000Z';
    const sources: ReadSources = {
      listRunSummaries: () => [],
      listQueueEntries: () => [],
      now: () => new Date(generatedAt),
    };
    const handler = createRequestHandler(sources);
    const response = makeResponse();

    handler(
      { method: 'GET', url: '/' } as unknown as IncomingMessage,
      response as unknown as ServerResponse,
    );

    const expected = renderDashboard({
      runs: toRunList([], {}),
      queue: [],
      generatedAt,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers).toEqual({
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'",
    });
    expect(response.body).toBe(expected);
  });

  it('still writes JSON bodies with JSON.stringify for routes without a contentType', () => {
    const { sources } = makeRunSources({ directories: ['run-1'] });
    const handler = createRequestHandler(sources);
    const response = makeResponse();

    handler(
      { method: 'GET', url: '/queue' } as unknown as IncomingMessage,
      response as unknown as ServerResponse,
    );

    const expected = routeRequest({ method: 'GET', url: '/queue' }, sources);
    expect(response.statusCode).toBe(expected.status);
    expect(response.headers).toEqual({
      'content-type': 'application/json; charset=utf-8',
    });
    expect(response.body).toBe(JSON.stringify(expected.body));
  });

  it('routes a request without a method as GET', () => {
    const { sources } = makeRunSources({ directories: ['run-1'] });
    const handler = createRequestHandler(sources);
    const withoutMethod = makeResponse();
    const withMethod = makeResponse();

    handler(
      { url: '/runs' } as unknown as IncomingMessage,
      withoutMethod as unknown as ServerResponse,
    );
    handler(
      { method: 'GET', url: '/runs' } as unknown as IncomingMessage,
      withMethod as unknown as ServerResponse,
    );

    expect(withoutMethod.statusCode).toBe(200);
    expect(withoutMethod.body).toBe(withMethod.body);
  });

  it('routes a request without a url as /', () => {
    const { sources } = makeRunSources();
    const handler = createRequestHandler(sources);
    const response = makeResponse();

    handler(
      { method: 'GET' } as unknown as IncomingMessage,
      response as unknown as ServerResponse,
    );

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({ error: 'not found' });
  });
});

describe('startReadServer', () => {
  it('listens on host 127.0.0.1 only', () => {
    startReadServer({
      runsRoot: '/state/runs',
      queuePath: '/state/queue.sqlite',
      port: 8123,
    });

    const createServerMock = vi.mocked(createServer);
    expect(createServerMock).toHaveBeenCalledTimes(1);
    const listened = createServerMock.mock.results[0]!.value as unknown as {
      listen: Mock;
    };
    expect(listened.listen).toHaveBeenCalledWith(8123, '127.0.0.1');
  });

  it('states in its source that it never listens on all interfaces', () => {
    const source = readFileSync(new URL('./server.ts', import.meta.url), 'utf8');

    expect(source).toContain("'127.0.0.1'");
    expect(source).toMatch(/listen\([^)]*'127\.0\.0\.1'/);
  });
});
