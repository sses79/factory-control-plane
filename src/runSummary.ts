import { z } from 'zod';

const RunStateSchema = z.enum([
  'FEATURE_READY',
  'PREPARING_WORKSPACE',
  'BUILDING',
  'INNER_LOOP_VALIDATION',
  'REPAIR',
  'AGENT_REVIEW',
  'DRAFT_PR',
  'CI_OBSERVATION',
  'HUMAN_CHANGE_REVIEW',
  'BLOCKED',
  'FAILED',
  'CANCELLED',
  'DONE',
]);

type RunState = z.infer<typeof RunStateSchema>;

const AttemptStatusSchema = z.enum([
  'PENDING',
  'ACTIVE',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

type AttemptStatus = z.infer<typeof AttemptStatusSchema>;

export const RunSummarySchema = z.object({
  run_id: z.string(),
  feature_id: z.string(),
  target_repository: z.string(),
  state: RunStateSchema,
  attempt_count: z.number().int().nonnegative(),
  terminal_reason: z.string().optional(),
  branch: z.string().optional(),
  pull_request_url: z.string().optional(),
  started_at: z.string().optional(),
  finished_at: z.string().optional(),
});

export type RunSummary = z.infer<typeof RunSummarySchema>;

interface Run {
  run_id: string;
  feature_id: string;
  target_repository: string;
  state: RunState;
  created_at: string;
  updated_at: string;
}

interface Attempt {
  attempt_id: string;
  ordinal: number;
  status: AttemptStatus;
  started_at?: string;
  finished_at?: string;
}

interface RunOptions {
  attempts: Attempt[];
  terminal_reason?: string;
  branch?: string;
  pull_request_url?: string;
}

const FINISHED_STATES: ReadonlySet<RunState> = new Set([
  'DONE',
  'FAILED',
  'CANCELLED',
]);

function earliestStartedAt(attempts: Attempt[]): string | undefined {
  let earliest: string | undefined;
  for (const attempt of attempts) {
    const startedAt = attempt.started_at;
    if (startedAt !== undefined && (earliest === undefined || startedAt < earliest)) {
      earliest = startedAt;
    }
  }
  return earliest;
}

function latestFinishedAt(attempts: Attempt[]): string | undefined {
  let latest: string | undefined;
  for (const attempt of attempts) {
    const finishedAt = attempt.finished_at;
    if (finishedAt !== undefined && (latest === undefined || finishedAt > latest)) {
      latest = finishedAt;
    }
  }
  return latest;
}

export function toRunSummary(run: Run, options: RunOptions): RunSummary {
  const summary: RunSummary = {
    run_id: run.run_id,
    feature_id: run.feature_id,
    target_repository: run.target_repository,
    state: run.state,
    attempt_count: options.attempts.length,
  };

  if (options.terminal_reason !== undefined) {
    summary.terminal_reason = options.terminal_reason;
  }
  if (options.branch !== undefined) {
    summary.branch = options.branch;
  }
  if (options.pull_request_url !== undefined) {
    summary.pull_request_url = options.pull_request_url;
  }

  const startedAt = earliestStartedAt(options.attempts);
  if (startedAt !== undefined) {
    summary.started_at = startedAt;
  }

  if (FINISHED_STATES.has(run.state)) {
    const finishedAt = latestFinishedAt(options.attempts);
    if (finishedAt !== undefined) {
      summary.finished_at = finishedAt;
    }
  }

  return summary;
}
