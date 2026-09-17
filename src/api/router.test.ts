import { describe, expect, it } from 'vitest';

import { toRunList } from '../runList.js';
import type { RunSummary } from '../runSummary.js';
import { toRunTrace } from '../runTrace.js';
import type { QueueEntry } from '../state/queueDatabase.js';
import { routeRequest, type ReadSources } from './router.js';

const summaries: RunSummary[] = [
  {
    run_id: 'run-abc',
    feature_id: 'feature-1',
    target_repository: 'acme/one',
    state: 'FAILED',
    attempt_count: 1,
    started_at: '2026-01-01T00:00:00.000Z',
  },
  {
    run_id: 'run-b',
    feature_id: 'feature-2',
    target_repository: 'acme/two',
    state: 'DONE',
    attempt_count: 2,
    started_at: '2026-01-02T00:00:00.000Z',
  },
  {
    run_id: 'run/c',
    feature_id: 'feature-3',
    target_repository: 'acme/three',
    state: 'FAILED',
    attempt_count: 1,
    started_at: '2026-01-03T00:00:00.000Z',
  },
];

const queueEntries: QueueEntry[] = [
  {
    entry_id: 'entry-1',
    feature_id: 'feature-1',
    target_repository: 'acme/one',
    status: 'QUEUED',
    queued_at: '2026-01-01T00:00:00.000Z',
  },
  {
    entry_id: 'entry-2',
    feature_id: 'feature-2',
    target_repository: 'acme/two',
    status: 'FAILED',
    queued_at: '2026-01-02T00:00:00.000Z',
    claimed_at: '2026-01-02T01:00:00.000Z',
  },
  {
    entry_id: 'entry-3',
    feature_id: 'feature-3',
    target_repository: 'acme/three',
    status: 'QUEUED',
    queued_at: '2026-01-03T00:00:00.000Z',
  },
];

interface SourceOverrides {
  summaries?: RunSummary[];
  entries?: QueueEntry[];
  throwOnSummaries?: boolean;
  throwOnQueue?: boolean;
  summaryError?: string;
  queueError?: string;
}

function makeSources(overrides: SourceOverrides = {}): ReadSources {
  const availableSummaries = overrides.summaries ?? summaries;
  const availableEntries = overrides.entries ?? queueEntries;
  return {
    listRunSummaries() {
      if (overrides.throwOnSummaries === true) {
        throw new Error(overrides.summaryError ?? 'secret summary path');
      }
      return availableSummaries;
    },
    listQueueEntries() {
      if (overrides.throwOnQueue === true) {
        throw new Error(overrides.queueError ?? 'secret queue path');
      }
      return availableEntries;
    },
  };
}

describe('routeRequest', () => {
  it('GET /runs returns the RunList toRunList produces for all summaries', () => {
    const response = routeRequest({ method: 'GET', url: '/runs' }, makeSources());

    expect(response.status).toBe(200);
    expect(response.body).toEqual(toRunList(summaries, {}));
  });

  it('GET /runs passes state and limit through to toRunList', () => {
    const response = routeRequest(
      { method: 'GET', url: '/runs?state=FAILED&limit=2' },
      makeSources(),
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      toRunList(summaries, { state: 'FAILED', limit: 2 }),
    );
  });

  for (const url of ['/runs?limit=0', '/runs?limit=abc']) {
    it(`GET ${url} returns 400 for an invalid limit`, () => {
      const response = routeRequest({ method: 'GET', url }, makeSources());

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'invalid limit' });
    });
  }

  it('GET /runs/run-abc returns the matching summary and trace', () => {
    const summary = summaries[0] as RunSummary;
    const response = routeRequest(
      { method: 'GET', url: '/runs/run-abc' },
      makeSources(),
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ summary, trace: toRunTrace(summary, {}) });
  });

  it('GET /runs decodes URL-encoded run ids before matching', () => {
    const summary = summaries[2] as RunSummary;
    const response = routeRequest(
      { method: 'GET', url: '/runs/run%2Fc' },
      makeSources(),
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ summary, trace: toRunTrace(summary, {}) });
  });

  it('GET /runs/%zz returns 400 for an invalid run id', () => {
    const response = routeRequest({ method: 'GET', url: '/runs/%zz' }, makeSources());

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid run id' });
  });

  it('GET /runs/%zz does not call listRunSummaries or listQueueEntries', () => {
    let listRunSummariesCalls = 0;
    let listQueueEntriesCalls = 0;
    const sources: ReadSources = {
      listRunSummaries() {
        listRunSummariesCalls += 1;
        return [];
      },
      listQueueEntries() {
        listQueueEntriesCalls += 1;
        return [];
      },
    };

    const response = routeRequest({ method: 'GET', url: '/runs/%zz' }, sources);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid run id' });
    expect(listRunSummariesCalls).toBe(0);
    expect(listQueueEntriesCalls).toBe(0);
  });

  it('GET /runs/run-missing returns 404', () => {
    const response = routeRequest(
      { method: 'GET', url: '/runs/run-missing' },
      makeSources(),
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'run not found' });
  });

  it('GET /queue returns total, by_status and entries in source order', () => {
    const response = routeRequest({ method: 'GET', url: '/queue' }, makeSources());

    const byStatus: Record<string, number> = {};
    for (const entry of queueEntries) {
      byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1;
    }

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      total: queueEntries.length,
      by_status: byStatus,
      entries: queueEntries,
    });
  });

  for (const url of ['/unknown', '/runs/a/b']) {
    it(`GET ${url} returns 404`, () => {
      const response = routeRequest({ method: 'GET', url }, makeSources());

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'not found' });
    });
  }

  const methodCases: Array<[string, string]> = [
    ['POST', '/runs'],
    ['DELETE', '/runs/run-abc'],
    ['PUT', '/queue'],
  ];

  for (const [method, url] of methodCases) {
    it(`${method} ${url} returns 405`, () => {
      const response = routeRequest({ method, url }, makeSources());

      expect(response.status).toBe(405);
      expect(response.body).toEqual({ error: 'method not allowed' });
    });
  }

  it('returns 500 without the thrown message when listRunSummaries throws', () => {
    const sources = makeSources({
      throwOnSummaries: true,
      summaryError: 'secret summary /tmp/control-plane/run',
    });
    const response = routeRequest({ method: 'GET', url: '/runs' }, sources);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'read failed' });
    expect(JSON.stringify(response)).not.toContain('secret');
  });

  it('returns 500 without the thrown message when listQueueEntries throws', () => {
    const sources = makeSources({
      throwOnQueue: true,
      queueError: 'secret queue /var/lib/control-plane/queue',
    });
    const response = routeRequest({ method: 'GET', url: '/queue' }, sources);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'read failed' });
    expect(JSON.stringify(response)).not.toContain('secret');
  });

  it('does not mutate the arrays returned by sources', () => {
    const originalSummaries = summaries.map((summary) => ({ ...summary }));
    const originalEntries = queueEntries.map((entry) => ({ ...entry }));
    const sources = makeSources();

    routeRequest({ method: 'GET', url: '/runs?state=FAILED&limit=2' }, sources);
    routeRequest({ method: 'GET', url: '/runs/run-abc' }, sources);
    routeRequest({ method: 'GET', url: '/queue' }, sources);

    expect(summaries).toEqual(originalSummaries);
    expect(queueEntries).toEqual(originalEntries);
  });
});
