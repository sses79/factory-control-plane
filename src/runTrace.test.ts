import { describe, expect, it } from 'vitest';

import type { RunSummary } from './runSummary.js';
import { RunTraceSchema, toRunTrace } from './runTrace.js';

const baseSummary: RunSummary = {
  run_id: 'run_123',
  feature_id: 'feature_abc',
  target_repository: 'acme/control',
  state: 'BUILDING',
  attempt_count: 0,
};

describe('toRunTrace', () => {
  it('projects the full idea-to-pull-request chain in order', () => {
    const summary: RunSummary = {
      ...baseSummary,
      branch: 'feat/read-model',
      pull_request_url: 'https://github.com/acme/control/pull/42',
    };

    const trace = toRunTrace(summary, {
      idea_id: 'idea_1',
      project_id: 'project_1',
    });

    expect(trace.nodes.map((node) => node.kind)).toEqual([
      'idea',
      'project',
      'repository',
      'feature',
      'run',
      'branch',
      'pull_request',
    ]);
    expect(trace.run_id).toBe('run_123');
    expect(RunTraceSchema.parse(trace)).toEqual(trace);
  });

  it('keeps the chain in order when only idea and branch are present beyond the core', () => {
    const summary: RunSummary = {
      ...baseSummary,
      branch: 'feat/read-model',
    };

    const trace = toRunTrace(summary, { idea_id: 'idea_1' });

    expect(trace.nodes.map((node) => node.kind)).toEqual([
      'idea',
      'repository',
      'feature',
      'run',
      'branch',
    ]);
    expect(RunTraceSchema.parse(trace)).toEqual(trace);
  });

  it('emits only repository, feature and run when the optional links are absent', () => {
    const trace = toRunTrace(baseSummary, {});

    expect(trace.nodes.map((node) => node.kind)).toEqual([
      'repository',
      'feature',
      'run',
    ]);
    expect(trace.nodes.map((node) => node.id)).toEqual([
      'acme/control',
      'feature_abc',
      'run_123',
    ]);
    expect(trace.run_id).toBe('run_123');
    expect(RunTraceSchema.parse(trace)).toEqual(trace);
  });

  it('gives each node a short label and ids from their source fields', () => {
    const summary: RunSummary = {
      ...baseSummary,
      branch: 'feat/read-model',
      pull_request_url: 'https://github.com/acme/control/pull/42',
    };

    const trace = toRunTrace(summary, {
      idea_id: 'idea_1',
      project_id: 'project_1',
    });

    expect(trace.nodes).toEqual([
      { kind: 'idea', id: 'idea_1', label: 'Idea' },
      { kind: 'project', id: 'project_1', label: 'Project' },
      { kind: 'repository', id: 'acme/control', label: 'Repository' },
      { kind: 'feature', id: 'feature_abc', label: 'Feature' },
      { kind: 'run', id: 'run_123', label: 'Run' },
      { kind: 'branch', id: 'feat/read-model', label: 'Branch' },
      {
        kind: 'pull_request',
        id: 'https://github.com/acme/control/pull/42',
        label: 'Pull request',
      },
    ]);
    expect(RunTraceSchema.parse(trace)).toEqual(trace);
  });

  it('is pure and deterministic for the same inputs', () => {
    const summary: RunSummary = {
      ...baseSummary,
      branch: 'feat/read-model',
    };
    const options = { idea_id: 'idea_1', project_id: 'project_1' };

    expect(toRunTrace(summary, options)).toEqual(toRunTrace(summary, options));
    expect(RunTraceSchema.parse(toRunTrace(summary, options))).toEqual(
      toRunTrace(summary, options),
    );
  });
});
