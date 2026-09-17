import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';

import { toRunSummary } from '../runSummary.js';
import type { RunSummary } from '../runSummary.js';

const RUN_STATES = [
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
] as const;

const ATTEMPT_STATUSES = [
  'PENDING',
  'ACTIVE',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;

const runDocumentSchema = z.object({
  run_id: z.string(),
  feature_id: z.string(),
  target_repository: z.string(),
  state: z.enum(RUN_STATES),
  created_at: z.string(),
  updated_at: z.string(),
});

const attemptDocumentSchema = z.object({
  attempt_id: z.string(),
  ordinal: z.number(),
  status: z.enum(ATTEMPT_STATUSES),
  started_at: z.string().optional(),
  finished_at: z.string().optional(),
});

const sideEffectResultSchema = z.record(z.string(), z.unknown()).optional();

const sideEffectDocumentSchema = z.object({
  kind: z.string(),
  certainty: z.enum(['NOT_STARTED', 'OUTCOME_UNKNOWN', 'COMPLETED']),
  result: sideEffectResultSchema,
});

type RunDocument = z.infer<typeof runDocumentSchema>;
type AttemptDocument = z.infer<typeof attemptDocumentSchema>;
type SideEffectDocument = z.infer<typeof sideEffectDocumentSchema>;

function parseDocument<T>(
  table: string,
  primaryKey: string,
  document: string,
  schema: z.ZodType<T>,
): T {
  let value: unknown;
  try {
    value = JSON.parse(document);
  } catch {
    throw new Error(`Invalid JSON in ${table} row ${primaryKey}`);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid ${table} row ${primaryKey}: ${parsed.error.message}`);
  }
  return parsed.data;
}

function maybeString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readAttempts(database: DatabaseSync, runId: string): AttemptDocument[] {
  const rows = database
    .prepare(
      'SELECT attempt_id, document FROM attempts WHERE run_id = ? ORDER BY ordinal ASC',
    )
    .all(runId) as Array<Record<string, unknown>>;

  const attempts: AttemptDocument[] = [];
  for (const row of rows) {
    const attemptId = row.attempt_id;
    const attemptDocument = row.document;
    if (typeof attemptId !== 'string' || typeof attemptDocument !== 'string') {
      throw new Error('Invalid attempts table row: missing attempt_id or document');
    }
    attempts.push(
      parseDocument('attempts', attemptId, attemptDocument, attemptDocumentSchema),
    );
  }
  return attempts;
}

function readSideEffectValues(
  database: DatabaseSync,
  runId: string,
): { pullRequestUrl: string | undefined; branch: string | undefined } {
  const rows = database
    .prepare(
      'SELECT operation_id, document FROM side_effects WHERE run_id = ? ORDER BY rowid ASC',
    )
    .all(runId) as Array<Record<string, unknown>>;

  let lastCompletedDraftPr: SideEffectDocument | undefined;
  let lastCompletedPublishBranch: SideEffectDocument | undefined;
  for (const row of rows) {
    const operationId = row.operation_id;
    const sideEffectDocument = row.document;
    if (typeof operationId !== 'string' || typeof sideEffectDocument !== 'string') {
      throw new Error('Invalid side_effects table row: missing operation_id or document');
    }
    const sideEffect = parseDocument(
      'side_effects',
      operationId,
      sideEffectDocument,
      sideEffectDocumentSchema,
    );
    if (sideEffect.certainty !== 'COMPLETED') {
      continue;
    }
    if (sideEffect.kind === 'draft-pr') {
      lastCompletedDraftPr = sideEffect;
    } else if (sideEffect.kind === 'publish-branch') {
      lastCompletedPublishBranch = sideEffect;
    }
  }

  return {
    pullRequestUrl: maybeString(lastCompletedDraftPr?.result?.url),
    branch: maybeString(lastCompletedPublishBranch?.result?.branch),
  };
}

export function readRunSummaries(database: DatabaseSync): RunSummary[] {
  const runRows = database
    .prepare('SELECT run_id, document FROM runs ORDER BY run_id ASC')
    .all() as Array<Record<string, unknown>>;

  const summaries: RunSummary[] = [];
  for (const runRow of runRows) {
    const runId = runRow.run_id;
    const runDocument = runRow.document;
    if (typeof runId !== 'string' || typeof runDocument !== 'string') {
      throw new Error('Invalid runs table row: missing run_id or document');
    }
    const run = parseDocument('runs', runId, runDocument, runDocumentSchema);

    const attempts = readAttempts(database, runId).map((attempt) => ({
      attempt_id: attempt.attempt_id,
      ordinal: attempt.ordinal,
      status: attempt.status,
      ...(attempt.started_at !== undefined
        ? { started_at: attempt.started_at }
        : {}),
      ...(attempt.finished_at !== undefined
        ? { finished_at: attempt.finished_at }
        : {}),
    }));
    const { pullRequestUrl, branch } = readSideEffectValues(database, runId);

    const options: {
      attempts: typeof attempts;
      branch?: string;
      pull_request_url?: string;
    } = { attempts };
    if (branch !== undefined) {
      options.branch = branch;
    }
    if (pullRequestUrl !== undefined) {
      options.pull_request_url = pullRequestUrl;
    }

    summaries.push(toRunSummary(run, options));
  }
  return summaries;
}
