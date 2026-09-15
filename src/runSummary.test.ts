import { describe, expect, it } from 'vitest';

import { RunSummarySchema, toRunSummary } from './runSummary.js';

describe('toRunSummary', () => {
  const baseRun = {
    run_id: 'run_123',
    feature_id: 'feature_abc',
    target_repository: 'acme/control',
    state: 'BUILDING',
    created_at: '2026-09-13T09:00:00.000Z',
    updated_at: '2026-09-13T09:05:00.000Z',
  } as const;

  it('summarizes an in-flight run with one ACTIVE attempt and no finished_at', () => {
    const summary = toRunSummary(
      { ...baseRun, state: 'BUILDING' },
      {
        attempts: [
          {
            attempt_id: 'attempt_1',
            ordinal: 1,
            status: 'ACTIVE',
            started_at: '2026-09-13T09:01:00.000Z',
          },
        ],
      },
    );

    expect(summary.attempt_count).toBe(1);
    expect(summary.started_at).toBe('2026-09-13T09:01:00.000Z');
    expect(summary).not.toHaveProperty('finished_at');
    expect(RunSummarySchema.parse(summary)).toEqual(summary);
  });

  it('uses the latest attempt finished_at for a terminal DONE run', () => {
    const summary = toRunSummary(
      { ...baseRun, state: 'DONE' },
      {
        attempts: [
          {
            attempt_id: 'attempt_1',
            ordinal: 1,
            status: 'COMPLETED',
            started_at: '2026-09-13T09:01:00.000Z',
            finished_at: '2026-09-13T09:10:00.000Z',
          },
          {
            attempt_id: 'attempt_2',
            ordinal: 2,
            status: 'COMPLETED',
            started_at: '2026-09-13T09:11:00.000Z',
            finished_at: '2026-09-13T09:15:00.000Z',
          },
        ],
      },
    );

    expect(summary.attempt_count).toBe(2);
    expect(summary.started_at).toBe('2026-09-13T09:01:00.000Z');
    expect(summary.finished_at).toBe('2026-09-13T09:15:00.000Z');
    expect(RunSummarySchema.parse(summary)).toEqual(summary);
  });

  it('carries terminal_reason through for a BLOCKED run', () => {
    const summary = toRunSummary(
      { ...baseRun, state: 'BLOCKED' },
      {
        attempts: [
          {
            attempt_id: 'attempt_1',
            ordinal: 1,
            status: 'FAILED',
            started_at: '2026-09-13T09:01:00.000Z',
            finished_at: '2026-09-13T09:02:00.000Z',
          },
        ],
        terminal_reason: 'waiting on a maintainer review',
      },
    );

    expect(summary.terminal_reason).toBe('waiting on a maintainer review');
    expect(summary).not.toHaveProperty('finished_at');
    expect(RunSummarySchema.parse(summary)).toEqual(summary);
  });

  it('omits started_at and finished_at when no attempt timing exists', () => {
    const summary = toRunSummary({ ...baseRun, state: 'FAILED' }, { attempts: [] });

    expect(summary.attempt_count).toBe(0);
    expect(summary).not.toHaveProperty('started_at');
    expect(summary).not.toHaveProperty('finished_at');
    expect(RunSummarySchema.parse(summary)).toEqual(summary);
  });

  it('takes the earliest attempt started_at and includes branch metadata', () => {
    const summary = toRunSummary(
      { ...baseRun, state: 'AGENT_REVIEW' },
      {
        attempts: [
          {
            attempt_id: 'attempt_1',
            ordinal: 1,
            status: 'COMPLETED',
            started_at: '2026-09-13T09:05:00.000Z',
          },
          {
            attempt_id: 'attempt_2',
            ordinal: 2,
            status: 'ACTIVE',
            started_at: '2026-09-13T09:03:00.000Z',
          },
        ],
        branch: 'feat/read-model',
        pull_request_url: 'https://github.com/acme/control/pull/42',
      },
    );

    expect(summary.started_at).toBe('2026-09-13T09:03:00.000Z');
    expect(summary.branch).toBe('feat/read-model');
    expect(summary.pull_request_url).toBe('https://github.com/acme/control/pull/42');
    expect(summary).not.toHaveProperty('finished_at');
    expect(RunSummarySchema.parse(summary)).toEqual(summary);
  });

  it('rejects a non-timestamp started_at', () => {
    expect(() =>
      RunSummarySchema.parse({
        run_id: 'run_123',
        feature_id: 'feature_abc',
        target_repository: 'acme/control',
        state: 'BUILDING',
        attempt_count: 1,
        started_at: 'not-a-timestamp',
      }),
    ).toThrow();
  });

  it('accepts an offset started_at', () => {
    expect(
      RunSummarySchema.parse({
        run_id: 'run_123',
        feature_id: 'feature_abc',
        target_repository: 'acme/control',
        state: 'BUILDING',
        attempt_count: 1,
        started_at: '2026-09-13T09:00:00+02:00',
      }),
    ).toMatchObject({
      started_at: '2026-09-13T09:00:00+02:00',
    });
  });

  it('returns the earlier instant for started_at regardless of offset', () => {
    const summary = toRunSummary(
      { ...baseRun, state: 'BUILDING' },
      {
        attempts: [
          {
            attempt_id: 'attempt_1',
            ordinal: 1,
            status: 'ACTIVE',
            started_at: '2026-09-13T09:00:00+02:00',
          },
          {
            attempt_id: 'attempt_2',
            ordinal: 2,
            status: 'ACTIVE',
            started_at: '2026-09-13T08:00:00Z',
          },
        ],
      },
    );

    expect(summary.started_at).toBe('2026-09-13T09:00:00+02:00');
    expect(summary).not.toHaveProperty('finished_at');
    expect(RunSummarySchema.parse(summary)).toEqual(summary);
  });

  it('returns the later instant for finished_at regardless of offset', () => {
    const summary = toRunSummary(
      { ...baseRun, state: 'DONE' },
      {
        attempts: [
          {
            attempt_id: 'attempt_1',
            ordinal: 1,
            status: 'COMPLETED',
            started_at: '2026-09-13T09:01:00.000Z',
            finished_at: '2026-09-13T08:00:00Z',
          },
          {
            attempt_id: 'attempt_2',
            ordinal: 2,
            status: 'COMPLETED',
            started_at: '2026-09-13T09:02:00.000Z',
            finished_at: '2026-09-13T09:00:00+02:00',
          },
        ],
      },
    );

    expect(summary.started_at).toBe('2026-09-13T09:01:00.000Z');
    expect(summary.finished_at).toBe('2026-09-13T08:00:00Z');
    expect(RunSummarySchema.parse(summary)).toEqual(summary);
  });

  it('throws for an invalid started_at and names the attempt and value', () => {
    const build = () =>
      toRunSummary(
        { ...baseRun, state: 'BUILDING' },
        {
          attempts: [
            {
              attempt_id: 'attempt_invalid_start',
              ordinal: 1,
              status: 'ACTIVE',
              started_at: 'not-a-timestamp',
            },
          ],
        },
      );

    expect(build).toThrow(/attempt_invalid_start/);
    expect(build).toThrow(/started_at/);
    expect(build).toThrow(/not-a-timestamp/);
  });

  it('throws for a started_at that Date.parse accepts but is not an ISO datetime', () => {
    const build = () =>
      toRunSummary(
        { ...baseRun, state: 'BUILDING' },
        {
          attempts: [
            {
              attempt_id: 'attempt_short_year',
              ordinal: 1,
              status: 'ACTIVE',
              started_at: '2026',
            },
          ],
        },
      );

    expect(build).toThrow(/attempt_short_year/);
    expect(build).toThrow(/started_at/);
    expect(build).toThrow(/2026/);
  });

  it('throws for an invalid finished_at on a DONE run and names the attempt and value', () => {
    const build = () =>
      toRunSummary(
        { ...baseRun, state: 'DONE' },
        {
          attempts: [
            {
              attempt_id: 'attempt_invalid_finish',
              ordinal: 1,
              status: 'COMPLETED',
              started_at: '2026-09-13T09:01:00.000Z',
              finished_at: 'not-a-timestamp',
            },
          ],
        },
      );

    expect(build).toThrow(/attempt_invalid_finish/);
    expect(build).toThrow(/finished_at/);
    expect(build).toThrow(/not-a-timestamp/);
  });

  it('throws for an invalid finished_at on a BUILDING run and names the attempt and value', () => {
    const build = () =>
      toRunSummary(
        { ...baseRun, state: 'BUILDING' },
        {
          attempts: [
            {
              attempt_id: 'attempt_invalid_finish_building',
              ordinal: 1,
              status: 'ACTIVE',
              started_at: '2026-09-13T09:01:00.000Z',
              finished_at: 'not-a-timestamp',
            },
          ],
        },
      );

    expect(build).toThrow(/attempt_invalid_finish_building/);
    expect(build).toThrow(/finished_at/);
    expect(build).toThrow(/not-a-timestamp/);
  });

  it('throws for an invalid started_at on a CANCELLED run and names the attempt and value', () => {
    const build = () =>
      toRunSummary(
        { ...baseRun, state: 'CANCELLED' },
        {
          attempts: [
            {
              attempt_id: 'attempt_invalid_cancelled',
              ordinal: 1,
              status: 'CANCELLED',
              started_at: '2026',
            },
          ],
        },
      );

    expect(build).toThrow(/attempt_invalid_cancelled/);
    expect(build).toThrow(/started_at/);
    expect(build).toThrow(/2026/);
  });

  it('accepts an attempt carrying neither started_at nor finished_at', () => {
    const summary = toRunSummary(
      { ...baseRun, state: 'BUILDING' },
      {
        attempts: [
          {
            attempt_id: 'attempt_pending',
            ordinal: 1,
            status: 'PENDING',
          },
        ],
      },
    );

    expect(summary.attempt_count).toBe(1);
    expect(summary).not.toHaveProperty('started_at');
    expect(summary).not.toHaveProperty('finished_at');
    expect(RunSummarySchema.parse(summary)).toEqual(summary);
  });
});
