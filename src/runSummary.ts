import { z } from 'zod';

export const RunSummarySchema = z.object({
  run_id: z.string(),
  feature_id: z.string(),
  target_repository: z.string(),
  state: z.enum([
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
  ]),
  attempt_count: z.number().int().nonnegative(),
  terminal_reason: z.string().optional(),
  branch: z.string().optional(),
  pull_request_url: z.string().optional(),
  started_at: z.string().optional(),
  finished_at: z.string().optional(),
});

export type RunSummary = z.infer<typeof RunSummarySchema>;

type AttemptStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

interface Attempt {
  attempt_id: string;
  ordinal: number;
  status: AttemptStatus;
  started_at?: string;
  finished_at?: string;
}

interface Run {
  run_id: string;
  feature_id: string;
  target_repository: string;
  state: RunSummary['state'];
  created_at: string;
  updated_at: string;
}

interface RunOptions {
  attempts: Attempt[];
  terminal_reason?: string;
  branch?: string;
  pull_request_url?: string;
}

export function toRunSummary(run: Run, options: RunOptions): RunSummary {
  const startedTimes = options.attempts
    .map((attempt) => attempt.started_at)
    .filter((startedAt): startedAt is string => startedAt !== undefined)
    .sort();
  const startedAt = startedTimes[0];

  const finishedTimes = options.attempts
    .map((attempt) => attempt.finished_at)
    .filter((finishedAt): finishedAt is string => finishedAt !== undefined)
    .sort();

  const isTerminal = run.state === 'DONE' || run.state === 'FAILED' || run.state === 'CANCELLED';
  const finishedAt = isTerminal ? finishedTimes.at(-1) : undefined;

  return {
    run_id: run.run_id,
    feature_id: run.feature_id,
    target_repository: run.target_repository,
    state: run.state,
    attempt_count: options.attempts.length,
    ...(startedAt !== undefined ? { started_at: startedAt } : {}),
    ...(finishedAt !== undefined ? { finished_at: finishedAt } : {}),
    ...(options.terminal_reason !== undefined ? { terminal_reason: options.terminal_reason } : {}),
    ...(options.branch !== undefined ? { branch: options.branch } : {}),
    ...(options.pull_request_url !== undefined ? { pull_request_url: options.pull_request_url } : {}),
  };
}
