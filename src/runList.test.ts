import { describe, expect, it } from 'vitest';

import type { RunSummary } from './runSummary.js';
import { RunListSchema, toRunList } from './runList.js';

interface SummaryFields {
  run_id?: string;
  feature_id?: string;
  target_repository?: string;
  state?: RunSummary['state'];
  attempt_count?: number;
  terminal_reason?: string;
  branch?: string;
  pull_request_url?: string;
  started_at?: string;
  finished_at?: string;
}

function summary(fields: SummaryFields = {}): RunSummary {
  const result: RunSummary = {
    run_id: 'run_1',
    feature_id: 'feature_1',
    target_repository: 'acme/control',
    state: 'BUILDING',
    attempt_count: 0,
  };
  if (fields.run_id !== undefined) {
    result.run_id = fields.run_id;
  }
  if (fields.feature_id !== undefined) {
    result.feature_id = fields.feature_id;
  }
  if (fields.target_repository !== undefined) {
    result.target_repository = fields.target_repository;
  }
  if (fields.state !== undefined) {
    result.state = fields.state;
  }
  if (fields.attempt_count !== undefined) {
    result.attempt_count = fields.attempt_count;
  }
  if (fields.terminal_reason !== undefined) {
    result.terminal_reason = fields.terminal_reason;
  }
  if (fields.branch !== undefined) {
    result.branch = fields.branch;
  }
  if (fields.pull_request_url !== undefined) {
    result.pull_request_url = fields.pull_request_url;
  }
  if (fields.started_at !== undefined) {
    result.started_at = fields.started_at;
  }
  if (fields.finished_at !== undefined) {
    result.finished_at = fields.finished_at;
  }
  return result;
}

describe('toRunList', () => {
  it('counts every summary in total and by_state, ignoring state and limit', () => {
    const summaries = [
      summary({ run_id: 'run_1', state: 'BUILDING', started_at: '2026-09-16T10:00:00Z' }),
      summary({ run_id: 'run_2', state: 'DONE', started_at: '2026-09-16T12:00:00Z' }),
      summary({ run_id: 'run_3', state: 'DONE', started_at: '2026-09-16T11:00:00Z' }),
      summary({ run_id: 'run_4', state: 'BUILDING' }),
    ];

    const result = toRunList(summaries, { state: 'BUILDING', limit: 1 });

    expect(result.total).toBe(4);
    expect(result.by_state).toEqual({ BUILDING: 2, DONE: 2 });
    expect(result.runs).toHaveLength(1);
    expect(RunListSchema.parse(result)).toEqual(result);
  });

  it('omits states that no supplied summary is in', () => {
    const result = toRunList(
      [summary({ state: 'BUILDING' }), summary({ state: 'BUILDING' })],
      {},
    );

    expect(result.by_state).toEqual({ BUILDING: 2 });
    expect(RunListSchema.parse(result)).toEqual(result);
  });

  it('sorts by started_at descending with missing started_at last', () => {
    const result = toRunList(
      [
        summary({ run_id: 'run_old', started_at: '2026-09-01T00:00:00Z' }),
        summary({ run_id: 'run_none' }),
        summary({ run_id: 'run_new', started_at: '2026-09-16T00:00:00Z' }),
        summary({ run_id: 'run_mid', started_at: '2026-09-10T00:00:00Z' }),
      ],
      {},
    );

    expect(result.runs.map((run) => run.run_id)).toEqual([
      'run_new',
      'run_mid',
      'run_old',
      'run_none',
    ]);
    expect(RunListSchema.parse(result)).toEqual(result);
  });

  it('orders summaries with the same started_at by run_id ascending', () => {
    const startedAt = '2026-09-16T10:00:00Z';
    const result = toRunList(
      [
        summary({ run_id: 'run_2', started_at: startedAt }),
        summary({ run_id: 'run_3', started_at: startedAt }),
        summary({ run_id: 'run_1', started_at: startedAt }),
      ],
      {},
    );

    expect(result.runs.map((run) => run.run_id)).toEqual(['run_1', 'run_2', 'run_3']);
    expect(RunListSchema.parse(result)).toEqual(result);
  });

  it('orders summaries without started_at after dated ones and by run_id', () => {
    const result = toRunList(
      [
        summary({ run_id: 'run_b' }),
        summary({ run_id: 'run_a', started_at: '2026-09-16T10:00:00Z' }),
      ],
      {},
    );

    expect(result.runs.map((run) => run.run_id)).toEqual(['run_a', 'run_b']);
    expect(RunListSchema.parse(result)).toEqual(result);
  });

  it('orders two summaries without started_at by run_id ascending', () => {
    const result = toRunList(
      [summary({ run_id: 'run_b' }), summary({ run_id: 'run_a' })],
      {},
    );

    expect(result.runs.map((run) => run.run_id)).toEqual(['run_a', 'run_b']);
    expect(RunListSchema.parse(result)).toEqual(result);
  });

  it('keeps only summaries in options.state in runs', () => {
    const result = toRunList(
      [
        summary({ run_id: 'run_1', state: 'BUILDING' }),
        summary({ run_id: 'run_2', state: 'DONE' }),
        summary({ run_id: 'run_3', state: 'BUILDING' }),
      ],
      { state: 'BUILDING' },
    );

    expect(result.runs.map((run) => run.run_id)).toEqual(['run_1', 'run_3']);
    expect(result.total).toBe(3);
    expect(result.by_state).toEqual({ BUILDING: 2, DONE: 1 });
    expect(RunListSchema.parse(result)).toEqual(result);
  });

  it('takes at most options.limit runs after sorting', () => {
    const result = toRunList(
      [
        summary({ run_id: 'run_old', started_at: '2026-09-01T00:00:00Z' }),
        summary({ run_id: 'run_new', started_at: '2026-09-16T00:00:00Z' }),
        summary({ run_id: 'run_mid', started_at: '2026-09-10T00:00:00Z' }),
      ],
      { limit: 2 },
    );

    expect(result.runs.map((run) => run.run_id)).toEqual(['run_new', 'run_mid']);
    expect(result.total).toBe(3);
    expect(result.by_state).toEqual({ BUILDING: 3 });
    expect(RunListSchema.parse(result)).toEqual(result);
  });

  it('does not mutate the summaries it is given', () => {
    const summaries = [
      summary({ run_id: 'run_1', state: 'BUILDING', started_at: '2026-09-16T10:00:00Z' }),
      summary({ run_id: 'run_2', state: 'DONE' }),
    ];
    const snapshot = summaries.map((run) => ({ ...run }));

    toRunList(summaries, { state: 'BUILDING', limit: 1 });

    expect(summaries).toEqual(snapshot);
    expect(RunListSchema.parse(toRunList(summaries, {}))).toEqual(
      toRunList(summaries, {}),
    );
  });

  it('is pure and deterministic for the same inputs', () => {
    const summaries = [
      summary({ run_id: 'run_b', state: 'DONE' }),
      summary({ run_id: 'run_a', state: 'BUILDING', started_at: '2026-09-16T10:00:00Z' }),
    ];
    const options = { state: 'DONE', limit: 1 };

    const first = toRunList(summaries, options);
    const second = toRunList(summaries, options);

    expect(first).toEqual(second);
    expect(RunListSchema.parse(first)).toEqual(first);
    expect(RunListSchema.parse(second)).toEqual(second);
  });
});
