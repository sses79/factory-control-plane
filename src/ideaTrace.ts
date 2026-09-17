import { z } from 'zod';

export const IdeaTraceSchema = z.object({
  idea_id: z.string(),
  feature_count: z.number().int().nonnegative(),
  run_count: z.number().int().nonnegative(),
  features: z.array(
    z.object({
      feature_id: z.string(),
      title: z.string(),
      runs: z.array(
        z.object({
          run_id: z.string(),
          state: z.string(),
          pull_request_url: z.string().optional(),
        }),
      ),
    }),
  ),
});

export type IdeaTrace = z.infer<typeof IdeaTraceSchema>;

interface TracedFeature {
  feature_id: string;
  idea_id: string;
  title: string;
}

interface TracedRun {
  run_id: string;
  feature_id: string;
  state: string;
  pull_request_url?: string;
}

interface IdeaTraceInput {
  idea_id: string;
  features: TracedFeature[];
  runs: TracedRun[];
}

interface TraceRun {
  run_id: string;
  state: string;
  pull_request_url?: string;
}

function compareIds(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function toTraceRun(run: TracedRun): TraceRun {
  const traceRun: TraceRun = {
    run_id: run.run_id,
    state: run.state,
  };
  if (run.pull_request_url !== undefined) {
    traceRun.pull_request_url = run.pull_request_url;
  }
  return traceRun;
}

export function toIdeaTrace(input: IdeaTraceInput): IdeaTrace {
  const seenFeatureIds = new Set<string>();
  for (const feature of input.features) {
    if (seenFeatureIds.has(feature.feature_id)) {
      throw new Error(`Duplicate feature_id: ${feature.feature_id}`);
    }
    seenFeatureIds.add(feature.feature_id);
  }

  const features = input.features
    .filter((feature) => feature.idea_id === input.idea_id)
    .sort((a, b) => compareIds(a.feature_id, b.feature_id))
    .map((feature) => ({
      feature_id: feature.feature_id,
      title: feature.title,
      runs: input.runs
        .filter((run) => run.feature_id === feature.feature_id)
        .sort((a, b) => compareIds(a.run_id, b.run_id))
        .map(toTraceRun),
    }));

  const runCount = features.reduce(
    (total, feature) => total + feature.runs.length,
    0,
  );

  return {
    idea_id: input.idea_id,
    feature_count: features.length,
    run_count: runCount,
    features,
  };
}
