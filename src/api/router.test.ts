import { describe, expect, it } from 'vitest';

import type { BlueprintStatus } from '../blueprintStatus.js';
import type { IdeaSummary } from '../ideaSummary.js';
import { toRunList } from '../runList.js';
import type { RunSummary } from '../runSummary.js';
import { toRunTrace } from '../runTrace.js';
import type { PlanRevision } from '../state/planningDatabase.js';
import type { QueueEntry } from '../state/queueDatabase.js';
import { renderDashboard } from '../ui/dashboard.js';
import { renderIdeaList, type IdeaListEntry } from '../ui/ideaList.js';
import { renderIdeaPage, type IdeaPageInput } from '../ui/ideaPage.js';
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

const ideaOne: IdeaSummary = {
  idea_id: 'idea-1',
  operator_id: 'operator-1',
  classification: 'public',
  content_sha256: 'sha-idea-1',
  created_at: '2026-05-01T00:00:00.000Z',
  origin: 'local-manual',
  content_length: 123,
  excerpt: 'First idea excerpt',
};

const ideaTwo: IdeaSummary = {
  idea_id: 'idea/two',
  operator_id: 'operator-2',
  classification: 'public',
  content_sha256: 'sha-idea-2',
  created_at: '2026-05-02T00:00:00.000Z',
  origin: 'local-manual',
  content_length: 456,
  excerpt: 'Second idea excerpt',
};

const planRevision: PlanRevision = {
  idea_id: 'idea-1',
  revision: 3,
  created_at: '2026-05-03T00:00:00.000Z',
  content_sha256: 'plan-sha',
  markdown: '# Plan for idea-1',
};

const blueprintStatus: BlueprintStatus = {
  idea_id: 'idea-1',
  project_id: 'project-1',
  title: 'Build the widget',
  phases: [],
  totals: {
    NOT_STARTED: 2,
    QUEUED: 1,
    RUNNING: 0,
    AWAITING_REVIEW: 0,
    MERGED: 0,
    FAILED: 0,
  },
};

const ideaListEntries: IdeaListEntry[] = [
  {
    idea: ideaOne,
    plan_revision: planRevision.revision,
    blueprint: { revision: 1, totals: blueprintStatus.totals },
  },
  { idea: ideaTwo },
];

function getIdeaPage(
  ideaId: string,
): Omit<IdeaPageInput, 'generatedAt'> | undefined {
  if (ideaId === ideaOne.idea_id) {
    return {
      idea: ideaOne,
      plan: planRevision,
      blueprint: { revision: 1, status: blueprintStatus },
    };
  }
  if (ideaId === ideaTwo.idea_id) {
    return { idea: ideaTwo };
  }
  return undefined;
}

interface SourceOverrides {
  summaries?: RunSummary[];
  entries?: QueueEntry[];
  throwOnSummaries?: boolean;
  throwOnQueue?: boolean;
  summaryError?: string;
  queueError?: string;
  now?: () => Date;
  listIdeas?: () => IdeaListEntry[];
  getIdea?: (ideaId: string) => Omit<IdeaPageInput, 'generatedAt'> | undefined;
}

function makeSources(overrides: SourceOverrides = {}): ReadSources {
  const availableSummaries = overrides.summaries ?? summaries;
  const availableEntries = overrides.entries ?? queueEntries;
  const sources: ReadSources = {
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
  if (overrides.now !== undefined) {
    sources.now = overrides.now;
  }
  if (overrides.listIdeas !== undefined) {
    sources.listIdeas = overrides.listIdeas;
  }
  if (overrides.getIdea !== undefined) {
    sources.getIdea = overrides.getIdea;
  }
  return sources;
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

  it('GET / returns the dashboard renderDashboard produces with a fixed clock', () => {
    const generatedAt = '2026-01-01T00:00:00.000Z';
    const response = routeRequest(
      { method: 'GET', url: '/' },
      makeSources({ now: () => new Date(generatedAt) }),
    );

    expect(response.status).toBe(200);
    expect(response.contentType).toBe('text/html; charset=utf-8');
    expect(response.body).toBe(
      renderDashboard({
        runs: toRunList(summaries, {}),
        queue: queueEntries,
        generatedAt,
      }),
    );
  });

  it('GET / serves the dashboard when no now source is given', () => {
    const response = routeRequest({ method: 'GET', url: '/' }, makeSources());

    expect(response.status).toBe(200);
    expect(response.contentType).toBe('text/html; charset=utf-8');
    const body = String(response.body);
    expect(body).toContain('<!doctype html>');
    expect(body).toContain('Factory Control Plane');
  });

  it('POST / returns 405', () => {
    const response = routeRequest({ method: 'POST', url: '/' }, makeSources());

    expect(response.status).toBe(405);
    expect(response.body).toEqual({ error: 'method not allowed' });
  });

  it('returns 500 without the thrown message when serving / throws', () => {
    const sources = makeSources({
      throwOnSummaries: true,
      summaryError: 'secret summary /tmp/control-plane/run',
    });
    const response = routeRequest({ method: 'GET', url: '/' }, sources);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'read failed' });
    expect(JSON.stringify(response)).not.toContain('secret');
  });

  it('keeps every non-dashboard route free of a contentType', () => {
    expect(
      routeRequest({ method: 'GET', url: '/runs' }, makeSources()).contentType,
    ).toBeUndefined();
    expect(
      routeRequest({ method: 'GET', url: '/runs/run-abc' }, makeSources())
        .contentType,
    ).toBeUndefined();
    expect(
      routeRequest({ method: 'GET', url: '/queue' }, makeSources()).contentType,
    ).toBeUndefined();
  });

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

  it('GET /ideas returns the IdeaList renderIdeaList produces with a fixed clock', () => {
    const generatedAt = '2026-01-01T00:00:00.000Z';
    const response = routeRequest(
      { method: 'GET', url: '/ideas' },
      makeSources({
        now: () => new Date(generatedAt),
        listIdeas: () => ideaListEntries,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.contentType).toBe('text/html; charset=utf-8');
    expect(response.body).toBe(
      renderIdeaList({ ideas: ideaListEntries, generatedAt }),
    );
  });

  it('GET /ideas.json returns total and the ideas in source order', () => {
    const response = routeRequest(
      { method: 'GET', url: '/ideas.json' },
      makeSources({ listIdeas: () => ideaListEntries }),
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      total: ideaListEntries.length,
      ideas: ideaListEntries,
    });
  });

  it('GET /ideas/idea-1 returns the page renderIdeaPage produces with a fixed clock', () => {
    const generatedAt = '2026-01-01T00:00:00.000Z';
    const response = routeRequest(
      { method: 'GET', url: '/ideas/idea-1' },
      makeSources({
        now: () => new Date(generatedAt),
        getIdea: getIdeaPage,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.contentType).toBe('text/html; charset=utf-8');
    expect(response.body).toBe(
      renderIdeaPage({
        idea: ideaOne,
        plan: planRevision,
        blueprint: { revision: 1, status: blueprintStatus },
        generatedAt,
      }),
    );
  });

  it('GET /ideas decodes URL-encoded idea ids before matching', () => {
    const generatedAt = '2026-01-01T00:00:00.000Z';
    const response = routeRequest(
      { method: 'GET', url: '/ideas/idea%2Ftwo' },
      makeSources({
        now: () => new Date(generatedAt),
        getIdea: getIdeaPage,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.body).toBe(renderIdeaPage({ idea: ideaTwo, generatedAt }));
  });

  it('GET /ideas/idea-1.json returns the idea, its plan and its blueprint status', () => {
    const response = routeRequest(
      { method: 'GET', url: '/ideas/idea-1.json' },
      makeSources({ getIdea: getIdeaPage }),
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      idea: ideaOne,
      plan: planRevision,
      blueprint: { revision: 1, status: blueprintStatus },
    });
  });

  it('GET /ideas/idea%2Ftwo.json omits absent plan and blueprint parts', () => {
    const response = routeRequest(
      { method: 'GET', url: '/ideas/idea%2Ftwo.json' },
      makeSources({ getIdea: getIdeaPage }),
    );

    expect(response.status).toBe(200);
    const body = response.body as {
      idea: IdeaSummary;
      plan?: unknown;
      blueprint?: unknown;
    };
    expect(body.idea).toEqual(ideaTwo);
    expect(body.plan).toBeUndefined();
    expect(body.blueprint).toBeUndefined();
  });

  for (const url of ['/ideas/idea-missing', '/ideas/idea-missing.json']) {
    it(`GET ${url} returns 404 when the idea is unknown`, () => {
      const response = routeRequest(
        { method: 'GET', url },
        makeSources({ getIdea: getIdeaPage }),
      );

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'idea not found' });
    });
  }

  for (const url of ['/ideas/%zz', '/ideas/%zz.json']) {
    it(`GET ${url} returns 400 for an invalid idea id`, () => {
      const response = routeRequest({ method: 'GET', url }, makeSources());

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'invalid idea id' });
    });
  }

  it('GET /ideas serves an empty list when no listIdeas source is given', () => {
    const generatedAt = '2026-01-01T00:00:00.000Z';
    const response = routeRequest(
      { method: 'GET', url: '/ideas' },
      makeSources({ now: () => new Date(generatedAt) }),
    );

    expect(response.status).toBe(200);
    expect(response.body).toBe(renderIdeaList({ ideas: [], generatedAt }));
  });

  it('GET /ideas.json reports zero ideas when no listIdeas source is given', () => {
    const response = routeRequest(
      { method: 'GET', url: '/ideas.json' },
      makeSources(),
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ total: 0, ideas: [] });
  });

  for (const url of ['/ideas/idea-missing', '/ideas/idea-missing.json']) {
    it(`GET ${url} returns 404 when no getIdea source is given`, () => {
      const response = routeRequest({ method: 'GET', url }, makeSources());

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'idea not found' });
    });
  }

  const ideaMethodCases: Array<[string, string]> = [
    ['POST', '/ideas'],
    ['POST', '/ideas.json'],
    ['PUT', '/ideas/idea-1'],
    ['DELETE', '/ideas/idea-1.json'],
  ];

  for (const [method, url] of ideaMethodCases) {
    it(`${method} ${url} returns 405`, () => {
      const response = routeRequest({ method, url }, makeSources());

      expect(response.status).toBe(405);
      expect(response.body).toEqual({ error: 'method not allowed' });
    });
  }

  it('returns 500 without the thrown message when listIdeas throws', () => {
    const sources = makeSources({
      listIdeas: () => {
        throw new Error('secret idea list /var/lib/control-plane/ideas');
      },
    });
    const response = routeRequest({ method: 'GET', url: '/ideas' }, sources);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'read failed' });
    expect(JSON.stringify(response)).not.toContain('secret');
  });

  it('returns 500 without the thrown message when getIdea throws', () => {
    const sources = makeSources({
      getIdea: () => {
        throw new Error('secret idea page /var/lib/control-plane/ideas');
      },
    });
    const response = routeRequest(
      { method: 'GET', url: '/ideas/idea-1' },
      sources,
    );

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'read failed' });
    expect(JSON.stringify(response)).not.toContain('secret');
  });

  it('keeps every idea JSON route free of a contentType', () => {
    expect(
      routeRequest(
        { method: 'GET', url: '/ideas.json' },
        makeSources({ listIdeas: () => [] }),
      ).contentType,
    ).toBeUndefined();
    expect(
      routeRequest(
        { method: 'GET', url: '/ideas/idea-1.json' },
        makeSources({ getIdea: () => ({ idea: ideaOne }) }),
      ).contentType,
    ).toBeUndefined();
  });
});
