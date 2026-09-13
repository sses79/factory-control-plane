import { describe, expect, it } from 'vitest';

import { RunSummarySchema, toRunSummary } from './runSummary.js';
import type { RunSummary } from './runSummary.js';

const EARLY = '2026-09-13T09:00:00.000Z';
const LATER = '2026-09-13T10:30:00.000Z';
const LATEST = '2026-09-13T11:45:00.000Z';

function makeRun(state: RunSummary['state']) {
  return {
    run_id: 'run-1',
    feature_id: 'feat-42',
    target_repository: 'sses79/factory-control-plane',
    state,
    created_at: EARLY,
    updated_at: LATER,
  };
}

describe('toRunSummary', () => {
  it('summarizes an in-flight run with one ACTIVE attempt, leaving finished_at absent', () => {
    const summary = toRunSummary(makeRun('BUILDING'), {
      attempts: [
        { attempt_id: 'attempt-1', ordinal: 1, status: 'ACTIVE', started_at: EARLY },
      ],
    });

    expect(summary.run_id).toBe('run-1');
    expect(summary.feature_id).toBe('feat-42');
    expect(summary.target_repository).toBe('sses79/factory-control-plane');
    expect(summary.state).toBe('BUILDING');
    expect(summary.attempt_count).toBe(1);
    expect(summary.started_at).toBe(EARLY);
    expect('finished_at' in summary).toBe(false);
    expect(RunSummarySchema.parse(summary)).toEqual(summary);
  });

  it('derives started_at from the earliest attempt and omits finished_at before termination', () => {
    const summary = toRunSummary(makeRun('INNER_LOOP_VALIDATION'), {
      attempts: [
        { attempt_id: 'attempt-1', ordinal: 1, status: 'ACTIVE', started_at: LATER },
        { attempt_id: 'attempt-2', ordinal: 2, status: 'ACTIVE', started_at: EARLY },
      ],
    });

    expect(summary.started_at).toBe(EARLY);
    expect('finished_at' in summary).toBe(false);
    expect(RunSummarySchema.parse(summary)).toEqual(summary);
  });

  it('sets finished_at to the latest attempt finished_at once the run is DONE', () => {
    const summary = toRunSummary(makeRun('DONE'), {
      attempts: [
        { attempt_id: 'attempt-1', ordinal: 1, status: 'COMPLETED', started_at: EARLY, finished_at: LATER },
        { attempt_id: 'attempt-2', ordinal: 2, status: 'COMPLETED', started_at: LATER, finished_at: LATEST },
      ],
    });

    expect(summary.finished_at).toBe(LATEST);
    expect(RunSummarySchema.parse(summary)).toEqual(summary);
  });

  it('carries terminal_reason, branch and pull_request_url through for a BLOCKED run', () => {
    const summary = toRunSummary(makeRun('BLOCKED'), {
      attempts: [],
      terminal_reason: 'Awaiting human review',
      branch: 'feature/run-summary',
      pull_request_url: 'https://github.com/sses79/factory-control-plane/pull/1',
    });

    expect(summary.terminal_reason).toBe('Awaiting human review');
    expect(summary.branch).toBe('feature/run-summary');
    expect(summary.pull_request_url).toBe('https://github.com/sses79/factory-control-plane/pull/1');
    expect(RunSummarySchema.parse(summary)).toEqual(summary);
  });
});
