import { z } from 'zod';

import type { RunSummary } from './runSummary.js';
import { RunSummarySchema } from './runSummary.js';

export const RunListSchema = z.object({
  total: z.number().int().nonnegative(),
  by_state: z.record(z.string(), z.number().int().nonnegative()),
  runs: z.array(RunSummarySchema),
});

export type RunList = z.infer<typeof RunListSchema>;

export interface RunListOptions {
  state?: string;
  limit?: number;
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

export function toRunList(
  summaries: readonly RunSummary[],
  options: RunListOptions,
): RunList {
  const total = summaries.length;

  const byState: Record<string, number> = {};
  for (const summary of summaries) {
    const state = summary.state;
    byState[state] = (byState[state] ?? 0) + 1;
  }

  const filtered = summaries.filter(
    (summary) => options.state === undefined || summary.state === options.state,
  );
  const sorted = [...filtered].sort(compareRuns);
  const runs =
    options.limit === undefined ? sorted : sorted.slice(0, options.limit);

  return { total, by_state: byState, runs };
}
