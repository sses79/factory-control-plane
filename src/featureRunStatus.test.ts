import { describe, expect, it } from 'vitest';

import type { RunSummary } from './runSummary.js';
import {
  FeatureRunStatusSchema,
  toFeatureRunStatus,
} from './featureRunStatus.js';

type RunState = RunSummary['state'];

interface RunOptions {
  run_id: string;
  feature_id: string;
  target_repository: string;
  state: RunState;
  started_at?: string;
  pull_request_url?: string;
}

function makeRun(options: RunOptions): RunSummary {
  const summary: RunSummary = {
    run_id: options.run_id,
    feature_id: options.feature_id,
    target_repository: options.target_repository,
    state: options.state,
    attempt_count: 1,
  };
  if (options.started_at !== undefined) {
    summary.started_at = options.started_at;
  }
  if (options.pull_request_url !== undefined) {
    summary.pull_request_url = options.pull_request_url;
  }
  return summary;
}

const feature = { feature_id: 'f1', target_repository: 'repo-a' };

describe('toFeatureRunStatus', () => {
  it('counts runs whose feature_id and target_repository both match', () => {
    const runs: RunSummary[] = [
      makeRun({
        run_id: 'r1',
        feature_id: 'f1',
        target_repository: 'repo-a',
        state: 'DONE',
        started_at: '2026-09-16T09:00:00Z',
      }),
      makeRun({
        run_id: 'r2',
        feature_id: 'f1',
        target_repository: 'repo-b',
        state: 'FAILED',
        started_at: '2026-09-16T10:00:00Z',
      }),
      makeRun({
        run_id: 'r3',
        feature_id: 'f2',
        target_repository: 'repo-a',
        state: 'DONE',
        started_at: '2026-09-16T11:00:00Z',
      }),
    ];

    const status = toFeatureRunStatus(feature, { runs });

    expect(status.run_count).toBe(1);
    expect(status.latest_run_state).toBe('DONE');
    expect(status).not.toHaveProperty('latest_pull_request_url');
    expect(FeatureRunStatusSchema.parse(status)).toEqual(status);
  });

  it('excludes runs that match only on feature_id', () => {
    const runs: RunSummary[] = [
      makeRun({
        run_id: 'r1',
        feature_id: 'f1',
        target_repository: 'repo-b',
        state: 'FAILED',
        started_at: '2026-09-16T09:00:00Z',
      }),
    ];

    const status = toFeatureRunStatus(feature, { runs });

    expect(status.run_count).toBe(0);
    expect(status).not.toHaveProperty('latest_run_state');
    expect(status).not.toHaveProperty('latest_pull_request_url');
    expect(FeatureRunStatusSchema.parse(status)).toEqual(status);
  });

  it('reports the state and pull_request_url of the most recent matching run', () => {
    const runs: RunSummary[] = [
      makeRun({
        run_id: 'r1',
        feature_id: 'f1',
        target_repository: 'repo-a',
        state: 'FAILED',
        started_at: '2026-09-16T09:00:00Z',
        pull_request_url: 'https://example.com/pr/1',
      }),
      makeRun({
        run_id: 'r2',
        feature_id: 'f1',
        target_repository: 'repo-a',
        state: 'DONE',
        started_at: '2026-09-16T10:00:00Z',
        pull_request_url: 'https://example.com/pr/2',
      }),
    ];

    const status = toFeatureRunStatus(feature, { runs });

    expect(status.run_count).toBe(2);
    expect(status.latest_run_state).toBe('DONE');
    expect(status.latest_pull_request_url).toBe('https://example.com/pr/2');
    expect(FeatureRunStatusSchema.parse(status)).toEqual(status);
  });

  it('omits latest_pull_request_url when the most recent run has none', () => {
    const runs: RunSummary[] = [
      makeRun({
        run_id: 'r1',
        feature_id: 'f1',
        target_repository: 'repo-a',
        state: 'FAILED',
        started_at: '2026-09-16T09:00:00Z',
        pull_request_url: 'https://example.com/pr/1',
      }),
      makeRun({
        run_id: 'r2',
        feature_id: 'f1',
        target_repository: 'repo-a',
        state: 'BLOCKED',
        started_at: '2026-09-16T10:00:00Z',
      }),
    ];

    const status = toFeatureRunStatus(feature, { runs });

    expect(status.latest_run_state).toBe('BLOCKED');
    expect(status).not.toHaveProperty('latest_pull_request_url');
    expect(FeatureRunStatusSchema.parse(status)).toEqual(status);
  });

  it('returns run_count 0 with no optional properties when nothing matches', () => {
    const runs: RunSummary[] = [
      makeRun({
        run_id: 'r1',
        feature_id: 'f2',
        target_repository: 'repo-a',
        state: 'DONE',
        started_at: '2026-09-16T09:00:00Z',
      }),
    ];

    const status = toFeatureRunStatus(feature, { runs });

    expect(status).toEqual({
      feature_id: 'f1',
      target_repository: 'repo-a',
      run_count: 0,
    });
    expect(status).not.toHaveProperty('latest_run_state');
    expect(status).not.toHaveProperty('latest_pull_request_url');
    expect(FeatureRunStatusSchema.parse(status)).toEqual(status);
  });

  it('treats a matching run without started_at as less recent than any run with one', () => {
    const runs: RunSummary[] = [
      makeRun({
        run_id: 'a1',
        feature_id: 'f1',
        target_repository: 'repo-a',
        state: 'CANCELLED',
      }),
      makeRun({
        run_id: 'z9',
        feature_id: 'f1',
        target_repository: 'repo-a',
        state: 'DONE',
        started_at: '2026-09-16T08:00:00Z',
      }),
    ];

    const status = toFeatureRunStatus(feature, { runs });

    expect(status.latest_run_state).toBe('DONE');
    expect(status).not.toHaveProperty('latest_pull_request_url');
    expect(FeatureRunStatusSchema.parse(status)).toEqual(status);
  });

  it('breaks ties on started_at by run_id ascending', () => {
    const runs: RunSummary[] = [
      makeRun({
        run_id: 'b2',
        feature_id: 'f1',
        target_repository: 'repo-a',
        state: 'DRAFT_PR',
        started_at: '2026-09-16T09:00:00Z',
        pull_request_url: 'https://example.com/pr/b2',
      }),
      makeRun({
        run_id: 'a1',
        feature_id: 'f1',
        target_repository: 'repo-a',
        state: 'AGENT_REVIEW',
        started_at: '2026-09-16T09:00:00Z',
        pull_request_url: 'https://example.com/pr/a1',
      }),
    ];

    const status = toFeatureRunStatus(feature, { runs });

    expect(status.latest_run_state).toBe('AGENT_REVIEW');
    expect(status.latest_pull_request_url).toBe('https://example.com/pr/a1');
    expect(FeatureRunStatusSchema.parse(status)).toEqual(status);
  });

  it('does not mutate the runs array', () => {
    const runs: RunSummary[] = [
      makeRun({
        run_id: 'r1',
        feature_id: 'f1',
        target_repository: 'repo-a',
        state: 'DONE',
        started_at: '2026-09-16T09:00:00Z',
        pull_request_url: 'https://example.com/pr/1',
      }),
      makeRun({
        run_id: 'r2',
        feature_id: 'f1',
        target_repository: 'repo-b',
        state: 'FAILED',
        started_at: '2026-09-16T10:00:00Z',
      }),
    ];
    const before = runs.map((run) => ({ ...run }));

    toFeatureRunStatus(feature, { runs });

    expect(runs).toEqual(before);
  });
});

describe('FeatureRunStatusSchema', () => {
  it('rejects a negative run_count', () => {
    const result = FeatureRunStatusSchema.safeParse({
      feature_id: 'f1',
      target_repository: 'repo-a',
      run_count: -1,
    });

    expect(result.success).toBe(false);
  });
});
