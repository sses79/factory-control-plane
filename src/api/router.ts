import { toRunList, type RunListOptions } from '../runList.js';
import type { RunSummary } from '../runSummary.js';
import { toRunTrace } from '../runTrace.js';
import type { QueueEntry } from '../state/queueDatabase.js';

export interface ReadSources {
  listRunSummaries(): RunSummary[];
  listQueueEntries(): QueueEntry[];
}

export interface ReadResponse {
  status: number;
  body: unknown;
}

function ok(body: unknown): ReadResponse {
  return { status: 200, body };
}

function notFound(): ReadResponse {
  return { status: 404, body: { error: 'not found' } };
}

function methodNotAllowed(): ReadResponse {
  return { status: 405, body: { error: 'method not allowed' } };
}

function readFailed(): ReadResponse {
  return { status: 500, body: { error: 'read failed' } };
}

function handleRuns(
  request: { method: string },
  parsedUrl: URL,
  sources: ReadSources,
): ReadResponse {
  if (request.method !== 'GET') {
    return methodNotAllowed();
  }

  const options: RunListOptions = {};

  const state = parsedUrl.searchParams.get('state');
  if (state !== null) {
    options.state = state;
  }

  const limit = parsedUrl.searchParams.get('limit');
  if (limit !== null) {
    if (!/^[1-9][0-9]*$/.test(limit)) {
      return { status: 400, body: { error: 'invalid limit' } };
    }
    options.limit = Number(limit);
  }

  return ok(toRunList(sources.listRunSummaries(), options));
}

function handleRunDetail(
  request: { method: string },
  runId: string,
  sources: ReadSources,
): ReadResponse {
  if (request.method !== 'GET') {
    return methodNotAllowed();
  }

  const summary = sources
    .listRunSummaries()
    .find((candidate) => candidate.run_id === runId);

  if (summary === undefined) {
    return { status: 404, body: { error: 'run not found' } };
  }

  return ok({
    summary,
    trace: toRunTrace(summary, {}),
  });
}

function handleQueue(
  request: { method: string },
  sources: ReadSources,
): ReadResponse {
  if (request.method !== 'GET') {
    return methodNotAllowed();
  }

  const entries = sources.listQueueEntries();
  const byStatus: Record<string, number> = {};
  for (const entry of entries) {
    byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1;
  }

  return ok({ total: entries.length, by_status: byStatus, entries });
}

export function routeRequest(
  request: { method: string; url: string },
  sources: ReadSources,
): ReadResponse {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(request.url, 'http://localhost');
  } catch {
    return readFailed();
  }

  try {
    const segments = parsedUrl.pathname
      .split('/')
      .filter((segment) => segment !== '');
    const [firstSegment, secondSegment] = segments;

    if (firstSegment === 'runs' && secondSegment === undefined) {
      return handleRuns(request, parsedUrl, sources);
    }

    if (
      firstSegment === 'runs' &&
      secondSegment !== undefined &&
      segments.length === 2
    ) {
      return handleRunDetail(request, decodeURIComponent(secondSegment), sources);
    }

    if (firstSegment === 'queue' && secondSegment === undefined) {
      return handleQueue(request, sources);
    }

    return notFound();
  } catch {
    return readFailed();
  }
}
