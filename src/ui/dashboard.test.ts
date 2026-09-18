import { describe, expect, it } from 'vitest';

import type { RunList } from '../runList.js';
import type { QueueEntry } from '../state/queueDatabase.js';
import { renderDashboard, type DashboardInput } from './dashboard.js';
import { expectSafeDocument } from './testSafety.js';

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
  it('returns a safe document titled Factory Control Plane with the dashboard active', () => {
    const html = renderDashboard(baseInput());
    expect(html).toContain('<title>Factory Control Plane</title>');
    expect(html).toContain('<h1>Dashboard</h1>');
    expect(html).toContain(`Generated at: ${GENERATED_AT}`);
    expect(html).toContain('<a href="/" class="active" aria-current="page">Dashboard</a>');
    expect(html).toContain('<a href="/ideas">Ideas</a>');
    expectSafeDocument(html);
  });

  it('renders one row per run in the given order with a badge, short id and compact start', () => {
    const input = baseInput();
    input.runs = runList([
      makeRun({ runId: 'run-0749023246ec48b7a62ce53a', featureId: 'feature-1', state: 'HUMAN_CHANGE_REVIEW', attemptCount: 2, startedAt: '2026-01-01T00:00:00Z', pullRequestUrl: 'https://github.com/org/repo/pull/12' }),
      makeRun({ runId: 'run-2', featureId: 'feature-2', state: 'FAILED', attemptCount: 3 }),
    ]);
    const html = renderDashboard(input);
    const first = html.indexOf('feature-1');
    const second = html.indexOf('feature-2');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(html).toContain('<span class="badge badge-success" title="HUMAN_CHANGE_REVIEW">Human change review</span>');
    expect(html).toContain('<span title="run-0749023246ec48b7a62ce53a">run-0749023246ec</span>');
    expect(html).toContain('<td class="num">2</td>');
    expect(html).toContain('<time datetime="2026-01-01T00:00:00Z">2026-01-01 00:00:00</time>');
    expect(html).toContain('<a class="pr" href="https://github.com/org/repo/pull/12">#12</a>');
    expect(html).toContain('<span class="badge badge-danger" title="FAILED">Failed</span>');
  });

  it('shows run counts by state and queue counts by status as tiles, with totals', () => {
    const input = baseInput();
    input.runs = { total: 2, by_state: { BUILDING: 1, DONE: 1 }, runs: [makeRun(), makeRun({ runId: 'run-2', state: 'DONE' })] };
    input.queue = [makeQueueEntry(), makeQueueEntry({ entryId: 'entry-2' }), makeQueueEntry({ entryId: 'entry-3', status: 'FAILED' })];
    const html = renderDashboard(input);
    expect(html).toContain('<span class="tile-count">1</span><span class="tile-label">Building</span>');
    expect(html).toContain('<span class="tile-count">1</span><span class="tile-label">Done</span>');
    expect(html).toContain('<span class="tile-count">2</span><span class="tile-label">Queued</span>');
    expect(html).toContain('<span class="tile-count">1</span><span class="tile-label">Failed</span>');
    expect(html).toContain('2 total');
    expect(html).toContain('3 entries');
  });

  it('renders queue outcomes as a pull request link, a terminal reason, or an empty mark', () => {
    const input = baseInput();
    input.queue = [
      makeQueueEntry({ entryId: 'e1', featureId: 'with-pr', status: 'SUCCEEDED', runDir: 'cp-a', pullRequestUrl: 'https://github.com/org/repo/pull/3' }),
      makeQueueEntry({ entryId: 'e2', featureId: 'with-reason', status: 'FAILED', terminalReason: 'QUEUE_BASE_STALE' }),
      makeQueueEntry({ entryId: 'e3', featureId: 'waiting' }),
    ];
    const html = renderDashboard(input);
    expect(html).toContain('<a class="pr" href="https://github.com/org/repo/pull/3">#3</a>');
    expect(html).toContain('<span class="id">QUEUE_BASE_STALE</span>');
    expect(html).toContain('<td class="id">cp-a</td>');
    expect(html.match(/<span class="muted">—<\/span>/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('escapes markup from every data value', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const input = baseInput();
    input.runs = runList([makeRun({ featureId: payload })]);
    input.queue = [makeQueueEntry({ featureId: payload, terminalReason: payload, status: 'FAILED' })];
    const html = renderDashboard(input);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain(payload);
    expectSafeDocument(html);
  });

  it('never turns a non-https pull request value into a link', () => {
    const input = baseInput();
    input.runs = runList([makeRun({ pullRequestUrl: 'javascript:alert(1)<img>' })]);
    const html = renderDashboard(input);
    expect(html).toContain('javascript:alert(1)&lt;img&gt;');
    expect(html).not.toContain('href="javascript:');
    expectSafeDocument(html);
  });

  it('keeps a quote in a pull request URL inside its attribute', () => {
    const input = baseInput();
    input.runs = runList([makeRun({ pullRequestUrl: 'https://github.com/org/repo/pull/1" onclick="x' })]);
    const html = renderDashboard(input);
    // The escaped quotes keep the text inside the href value; no attribute can start.
    expect(html).toContain('href="https://github.com/org/repo/pull/1&quot; onclick=&quot;x"');
    expect(html).not.toContain('" onclick="');
  });

  it('states an empty run list and an empty queue instead of drawing empty tables', () => {
    const html = renderDashboard(baseInput());
    expect(html).toContain('<p class="empty">No runs.</p>');
    expect(html).toContain('<p class="empty">Queue is empty.</p>');
    expect(html).not.toContain('<table>');
  });

  it('does not mutate its input', () => {
    const input = baseInput();
    input.runs = runList([makeRun()]);
    input.queue = [makeQueueEntry()];
    const snapshot = structuredClone(input);
    renderDashboard(input);
    expect(input).toEqual(snapshot);
  });
});
