import { describe, expect, it } from 'vitest';

import { IdeaTraceSchema, toIdeaTrace } from './ideaTrace.js';

interface FeatureInput {
  feature_id: string;
  idea_id: string;
  title: string;
}

interface RunInput {
  run_id: string;
  feature_id: string;
  state: string;
  pull_request_url?: string;
}

interface TraceInput {
  idea_id: string;
  features: FeatureInput[];
  runs: RunInput[];
}

function feature(
  featureId: string,
  ideaId: string,
  title = `Title for ${featureId}`,
): FeatureInput {
  return { feature_id: featureId, idea_id: ideaId, title };
}

function run(
  runId: string,
  featureId: string,
  state = 'DONE',
  pullRequestUrl?: string,
): RunInput {
  const input: RunInput = { run_id: runId, feature_id: featureId, state };
  if (pullRequestUrl !== undefined) {
    input.pull_request_url = pullRequestUrl;
  }
  return input;
}

describe('toIdeaTrace', () => {
  it('excludes features belonging to a different idea and their runs', () => {
    const input: TraceInput = {
      idea_id: 'idea-a',
      features: [feature('f1', 'idea-a'), feature('f2', 'idea-b')],
      runs: [run('r1', 'f1'), run('r2', 'f2')],
    };

    const trace = toIdeaTrace(input);

    expect(trace).toEqual({
      idea_id: 'idea-a',
      feature_count: 1,
      run_count: 1,
      features: [
        {
          feature_id: 'f1',
          title: 'Title for f1',
          runs: [{ run_id: 'r1', state: 'DONE' }],
        },
      ],
    });
    expect(IdeaTraceSchema.parse(trace)).toEqual(trace);
  });

  it('excludes runs whose feature_id matches no kept feature', () => {
    const input: TraceInput = {
      idea_id: 'idea-a',
      features: [feature('f1', 'idea-a')],
      runs: [run('r1', 'f1'), run('r2', 'f2')],
    };

    const trace = toIdeaTrace(input);

    expect(trace.run_count).toBe(1);
    expect(trace.features[0]?.runs).toEqual([{ run_id: 'r1', state: 'DONE' }]);
    expect(IdeaTraceSchema.parse(trace)).toEqual(trace);
  });

  it('sorts features by feature_id and runs by run_id ascending', () => {
    const input: TraceInput = {
      idea_id: 'idea-a',
      features: [
        feature('f2', 'idea-a', 'Beta'),
        feature('f1', 'idea-a', 'Alpha'),
        feature('f3', 'idea-a', 'Gamma'),
      ],
      runs: [
        run('r2', 'f2'),
        run('r3', 'f1', 'FAILED'),
        run('r1', 'f1'),
        run('r1', 'f3'),
      ],
    };

    const trace = toIdeaTrace(input);

    expect(trace.features.map((f) => f.feature_id)).toEqual(['f1', 'f2', 'f3']);
    expect(trace.features[0]?.runs.map((r) => r.run_id)).toEqual(['r1', 'r3']);
    expect(trace.features[2]?.runs.map((r) => r.run_id)).toEqual(['r1']);
    expect(IdeaTraceSchema.parse(trace)).toEqual(trace);
  });

  it('counts only the kept features and runs', () => {
    const input: TraceInput = {
      idea_id: 'idea-a',
      features: [
        feature('f1', 'idea-a'),
        feature('f2', 'idea-b'),
        feature('f3', 'idea-a'),
      ],
      runs: [
        run('r1', 'f1'),
        run('r2', 'f2'),
        run('r3', 'f3'),
        run('r4', 'f4'),
      ],
    };

    const trace = toIdeaTrace(input);

    expect(trace.feature_count).toBe(2);
    expect(trace.run_count).toBe(2);
    expect(IdeaTraceSchema.parse(trace)).toEqual(trace);
  });

  it('keeps features with no matching runs as empty runs arrays', () => {
    const input: TraceInput = {
      idea_id: 'idea-a',
      features: [feature('f1', 'idea-a')],
      runs: [run('r1', 'f2')],
    };

    const trace = toIdeaTrace(input);

    expect(trace.features[0]?.runs).toEqual([]);
    expect(trace.run_count).toBe(0);
    expect(IdeaTraceSchema.parse(trace)).toEqual(trace);
  });

  it('omits pull_request_url when a run has none', () => {
    const input: TraceInput = {
      idea_id: 'idea-a',
      features: [feature('f1', 'idea-a')],
      runs: [
        run('r1', 'f1', 'FAILED'),
        run('r2', 'f1', 'DONE', 'https://example.com/pr/2'),
      ],
    };

    const trace = toIdeaTrace(input);

    expect(trace.features[0]?.runs).toEqual([
      { run_id: 'r1', state: 'FAILED' },
      {
        run_id: 'r2',
        state: 'DONE',
        pull_request_url: 'https://example.com/pr/2',
      },
    ]);
    expect(trace.features[0]?.runs[0]).not.toHaveProperty('pull_request_url');
    expect(IdeaTraceSchema.parse(trace)).toEqual(trace);
  });

  it('throws an Error naming the feature_id when features are duplicated', () => {
    const input: TraceInput = {
      idea_id: 'idea-a',
      features: [
        feature('f1', 'idea-a'),
        feature('f1', 'idea-a', 'Duplicate title'),
      ],
      runs: [],
    };

    expect(() => toIdeaTrace(input)).toThrow('Duplicate feature_id: f1');
  });

  it('returns zero counts and an empty features array when nothing matches', () => {
    const input: TraceInput = {
      idea_id: 'idea-a',
      features: [feature('f1', 'idea-b')],
      runs: [run('r1', 'f1')],
    };

    const trace = toIdeaTrace(input);

    expect(trace).toEqual({
      idea_id: 'idea-a',
      feature_count: 0,
      run_count: 0,
      features: [],
    });
    expect(IdeaTraceSchema.parse(trace)).toEqual(trace);
  });

  it('does not mutate its input arrays', () => {
    const input: TraceInput = {
      idea_id: 'idea-a',
      features: [
        feature('f2', 'idea-a'),
        feature('f1', 'idea-a'),
        feature('f3', 'idea-b'),
      ],
      runs: [run('r3', 'f3'), run('r2', 'f1'), run('r1', 'f1')],
    };
    const featuresBefore = input.features.map((item) => ({ ...item }));
    const runsBefore = input.runs.map((item) => ({ ...item }));

    toIdeaTrace(input);

    expect(input.features).toEqual(featuresBefore);
    expect(input.runs).toEqual(runsBefore);
  });
});

describe('IdeaTraceSchema', () => {
  it('accepts every value toIdeaTrace returns', () => {
    const inputs: TraceInput[] = [
      { idea_id: 'idea-a', features: [], runs: [] },
      { idea_id: 'idea-a', features: [feature('f1', 'idea-a')], runs: [] },
      {
        idea_id: 'idea-a',
        features: [feature('f1', 'idea-a'), feature('f2', 'idea-a')],
        runs: [
          run('r2', 'f1'),
          run('r1', 'f2', 'FAILED', 'https://example.com/pr/1'),
        ],
      },
    ];

    for (const input of inputs) {
      const trace = toIdeaTrace(input);
      expect(IdeaTraceSchema.parse(trace)).toEqual(trace);
    }
  });
});
