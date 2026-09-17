import { describe, expect, it } from 'vitest';

import type { RunList } from '../runList.js';
import type { QueueEntry } from '../state/queueDatabase.js';
import { renderDashboard, type DashboardInput } from './dashboard.js';

const GENERATED_AT = '2026-09-17T12:00:00Z';

interface RunOptions {
  runId?: string;
  featureId?: string;
  state?: RunList['runs'][number]['state'];
  attemptCount?: number;
  startedAt?: string;
  pullRequestUrl?: string;
}

function makeRun(options: RunOptions = {}): RunList['runs'][number] {
  const summary: RunList['runs'][number] = {
    run_id: options.runId ?? 'run-1',
    feature_id: options.featureId ?? 'feature-1',
    target_repository: 'org/repo',
    state: options.state ?? 'BUILDING',
    attempt_count: options.attemptCount ?? 1,
  };
  if (options.startedAt !== undefined) {
    summary.started_at = options.startedAt;
  }
  if (options.pullRequestUrl !== undefined) {
    summary.pull_request_url = options.pullRequestUrl;
  }
  return summary;
}

interface QueueOptions {
  entryId?: string;
  featureId?: string;
  status?: QueueEntry['status'];
  queuedAt?: string;
  runDir?: string;
  pullRequestUrl?: string;
  terminalReason?: string;
}

function makeQueueEntry(options: QueueOptions = {}): QueueEntry {
  const entry: QueueEntry = {
    entry_id: options.entryId ?? 'entry-1',
    feature_id: options.featureId ?? 'feature-1',
    target_repository: 'org/repo',
    status: options.status ?? 'QUEUED',
    queued_at: options.queuedAt ?? '2026-01-01T00:00:00Z',
  };
  if (options.runDir !== undefined) {
    entry.run_dir = options.runDir;
  }
  if (options.pullRequestUrl !== undefined) {
    entry.pull_request_url = options.pullRequestUrl;
  }
  if (options.terminalReason !== undefined) {
    entry.terminal_reason = options.terminalReason;
  }
  return entry;
}

function runList(runs: RunList['runs'][number][]): RunList {
  return { total: runs.length, by_state: {}, runs };
}

function baseInput(): DashboardInput {
  return {
    runs: runList([]),
    queue: [],
    generatedAt: GENERATED_AT,
  };
}

describe('renderDashboard', () => {
  it('returns a document starting with <!doctype html> and titled Factory Control Plane', () => {
    const html = renderDashboard(baseInput());
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Factory Control Plane</title>');
  });

  it('includes the generatedAt value', () => {
    const html = renderDashboard(baseInput());
    expect(html).toContain(`Generated at: ${GENERATED_AT}`);
  });

  it('renders one row per run with all fields in the given order', () => {
    const first = makeRun({
      runId: 'run-2',
      featureId: 'feature-2',
      state: 'FAILED',
      attemptCount: 3,
      startedAt: '2026-01-02T00:00:00Z',
    });
    const second = makeRun({
      runId: 'run-3',
      featureId: 'feature-3',
      state: 'DONE',
      attemptCount: 1,
      startedAt: '2026-01-03T00:00:00Z',
    });
    const third = makeRun({
      runId: 'run-4',
      featureId: 'feature-4',
      state: 'BLOCKED',
      attemptCount: 0,
    });
    const html = renderDashboard({
      ...baseInput(),
      runs: runList([first, second, third]),
    });
    expect(html).toContain(
      '<tr><td>FAILED</td><td>feature-2</td><td>run-2</td><td>3</td><td>2026-01-02T00:00:00Z</td><td></td></tr>',
    );
    expect(html).toContain(
      '<tr><td>DONE</td><td>feature-3</td><td>run-3</td><td>1</td><td>2026-01-03T00:00:00Z</td><td></td></tr>',
    );
    expect(html).toContain(
      '<tr><td>BLOCKED</td><td>feature-4</td><td>run-4</td><td>0</td><td></td><td></td></tr>',
    );
    expect(html.indexOf('feature-2')).toBeLessThan(html.indexOf('feature-3'));
    expect(html.indexOf('feature-3')).toBeLessThan(html.indexOf('feature-4'));
  });

  it('shows run counts by state and queue counts by status', () => {
    const html = renderDashboard({
      ...baseInput(),
      runs: {
        total: 2,
        by_state: { BUILDING: 1, DONE: 1 },
        runs: [
          makeRun({ runId: 'run-1', state: 'BUILDING' }),
          makeRun({ runId: 'run-2', state: 'DONE' }),
        ],
      },
      queue: [
        makeQueueEntry({ entryId: 'e-1', status: 'QUEUED' }),
        makeQueueEntry({ entryId: 'e-2', status: 'QUEUED' }),
        makeQueueEntry({ entryId: 'e-3', status: 'FAILED' }),
      ],
    });
    expect(html).toContain('BUILDING: 1');
    expect(html).toContain('DONE: 1');
    expect(html).toContain('QUEUED: 2');
    expect(html).toContain('FAILED: 1');
  });

  it('links a run pull request to its https URL with the trailing number prefixed by #', () => {
    const html = renderDashboard({
      ...baseInput(),
      runs: runList([
        makeRun({
          runId: 'run-1',
          pullRequestUrl: 'https://github.com/org/repo/pull/42',
        }),
      ]),
    });
    expect(html).toContain(
      '<td><a href="https://github.com/org/repo/pull/42">#42</a></td>',
    );
  });

  it('renders queue outcomes as link, terminal reason, or empty cell', () => {
    const html = renderDashboard({
      ...baseInput(),
      queue: [
        makeQueueEntry({
          entryId: 'e-1',
          pullRequestUrl: 'https://github.com/org/repo/pull/7',
        }),
        makeQueueEntry({ entryId: 'e-2', terminalReason: 'hung up' }),
        makeQueueEntry({ entryId: 'e-3', runDir: 'dir-9' }),
      ],
    });
    expect(html).toContain(
      '<tr><td>QUEUED</td><td>feature-1</td><td>2026-01-01T00:00:00Z</td><td></td><td><a href="https://github.com/org/repo/pull/7">#7</a></td></tr>',
    );
    expect(html).toContain(
      '<tr><td>QUEUED</td><td>feature-1</td><td>2026-01-01T00:00:00Z</td><td></td><td>hung up</td></tr>',
    );
    expect(html).toContain(
      '<tr><td>QUEUED</td><td>feature-1</td><td>2026-01-01T00:00:00Z</td><td>dir-9</td><td></td></tr>',
    );
  });

  it('escapes HTML metacharacters from input values', () => {
    const featureId = '<img src=x onerror=alert(1)>';
    const html = renderDashboard({
      ...baseInput(),
      runs: runList([makeRun({ runId: 'run-1', featureId })]),
      queue: [makeQueueEntry({ entryId: 'e-1', featureId })],
    });
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
  });

  it('escapes double quotes in link hrefs so they cannot break out of the attribute', () => {
    const url = 'https://example.com/pull/1" onclick="alert(1)';
    const html = renderDashboard({
      ...baseInput(),
      runs: runList([makeRun({ runId: 'run-1', pullRequestUrl: url })]),
    });
    expect(html).toContain(
      'href="https://example.com/pull/1&quot; onclick=&quot;alert(1)"',
    );
    expect(html).not.toContain(' onclick="');
  });

  it('renders a javascript: pull request URL as escaped text without a link', () => {
    const url = 'javascript:alert(1)<img>';
    const html = renderDashboard({
      ...baseInput(),
      queue: [makeQueueEntry({ entryId: 'e-1', pullRequestUrl: url })],
    });
    expect(html).toContain('<td>javascript:alert(1)&lt;img&gt;</td>');
    expect(html).not.toContain('href="javascript:');
  });

  it('shows No runs. and Queue is empty. when both sections have no rows', () => {
    const html = renderDashboard(baseInput());
    expect(html).toContain('No runs.');
    expect(html).toContain('Queue is empty.');
    expect(html).not.toContain('<table>');
  });

  it('contains no script, no on-prefixed attribute, and no external resource', () => {
    const html = renderDashboard({
      ...baseInput(),
      runs: runList([
        makeRun({
          runId: 'run-1',
          pullRequestUrl: 'https://github.com/org/repo/pull/1',
        }),
      ]),
      queue: [
        makeQueueEntry({
          entryId: 'e-1',
          pullRequestUrl: 'https://github.com/org/repo/pull/2',
        }),
      ],
    });
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<link');
    expect(html).not.toMatch(/<[a-zA-Z][a-zA-Z0-9-]*[^>]*\s+on[a-zA-Z-]+\s*=/);
    expect(html).not.toContain('http://');
    const hrefs: string[] = [];
    for (const match of html.matchAll(/href="([^"]*)"/g)) {
      const href = match[1];
      if (href !== undefined) {
        hrefs.push(href);
        expect(href.startsWith('https://')).toBe(true);
      }
    }
    expect(hrefs.length).toBeGreaterThan(0);
    expect((html.match(/https:\/\//g) ?? []).length).toBe(hrefs.length);
  });

  it('does not mutate its input', () => {
    const runs = runList([
      makeRun({
        runId: 'run-1',
        pullRequestUrl: 'https://github.com/org/repo/pull/1',
      }),
    ]);
    const queue = [makeQueueEntry({ entryId: 'e-1', runDir: 'dir-1' })];
    const input = { runs, queue, generatedAt: GENERATED_AT };
    const snapshot = structuredClone(input);
    renderDashboard(input);
    expect(input).toEqual(snapshot);
  });
});
