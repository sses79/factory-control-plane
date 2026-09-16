import { z } from 'zod';

import type { RunSummary } from './runSummary.js';

export const FeatureRunStatusSchema = z.object({
  feature_id: z.string(),
  target_repository: z.string(),
  run_count: z.number().int().nonnegative(),
  latest_run_state: z.string().optional(),
  latest_pull_request_url: z.string().optional(),
});

export type FeatureRunStatus = z.infer<typeof FeatureRunStatusSchema>;

interface Feature {
  feature_id: string;
  target_repository: string;
}

interface FeatureRunStatusOptions {
  runs: readonly RunSummary[];
}

function compareRuns(a: RunSummary, b: RunSummary): number {
  const aStartedAt = a.started_at;
  const bStartedAt = b.started_at;
  if (aStartedAt !== undefined && bStartedAt !== undefined) {
    if (aStartedAt !== bStartedAt) {
      const aInstant = Date.parse(aStartedAt);
      const bInstant = Date.parse(bStartedAt);
      if (aInstant !== bInstant) {
        return aInstant < bInstant ? 1 : -1;
      }
    }
  } else if (aStartedAt !== undefined) {
    return -1;
  } else if (bStartedAt !== undefined) {
    return 1;
  }
  if (a.run_id === b.run_id) {
    return 0;
  }
  return a.run_id < b.run_id ? -1 : 1;
}

function assertValidStartedAt(run: RunSummary): void {
  const startedAt = run.started_at;
  if (startedAt !== undefined) {
    const result = z.iso.datetime({ offset: true }).safeParse(startedAt);
    if (!result.success) {
      throw new Error(
        `Run ${run.run_id} has invalid started_at: ${startedAt}`,
      );
    }
  }
}

export function toFeatureRunStatus(
  feature: Feature,
  options: FeatureRunStatusOptions,
): FeatureRunStatus {
  for (const run of options.runs) {
    assertValidStartedAt(run);
  }

  const matchingRuns = options.runs.filter(
    (run) =>
      run.feature_id === feature.feature_id &&
      run.target_repository === feature.target_repository,
  );

  const sorted = [...matchingRuns].sort(compareRuns);
  const latest = sorted[0];

  const status: FeatureRunStatus = {
    feature_id: feature.feature_id,
    target_repository: feature.target_repository,
    run_count: matchingRuns.length,
  };

  if (latest !== undefined) {
    status.latest_run_state = latest.state;
    if (latest.pull_request_url !== undefined) {
      status.latest_pull_request_url = latest.pull_request_url;
    }
  }

  return status;
}
