import type { DatabaseSync } from 'node:sqlite';

import { z } from 'zod';

const QUEUE_STATUSES = ['QUEUED', 'CLAIMED', 'SUCCEEDED', 'FAILED'] as const;

export const QueueEntrySchema = z.object({
  entry_id: z.string(),
  feature_id: z.string(),
  target_repository: z.string(),
  status: z.enum(QUEUE_STATUSES),
  queued_at: z.iso.datetime({ offset: true }),
  claimed_at: z.iso.datetime({ offset: true }).optional(),
  finished_at: z.iso.datetime({ offset: true }).optional(),
  run_id: z.string().optional(),
  run_name: z.string().optional(),
  run_dir: z.string().optional(),
  pull_request_url: z.string().optional(),
  terminal_reason: z.string().optional(),
  requeued_from: z.string().optional(),
  merged_at: z.iso.datetime({ offset: true }).optional(),
  merge_commit: z.string().regex(/^[0-9a-f]{40}$/).optional(),
});

export type QueueEntry = z.infer<typeof QueueEntrySchema>;

const RawQueueDocument = z.object({
  entry_id: z.string(),
  feature_id: z.string(),
  target_repository: z.string(),
  status: z.enum(QUEUE_STATUSES),
  queued_at: z.iso.datetime({ offset: true }),
  claimed_at: z.iso.datetime({ offset: true }).optional(),
  finished_at: z.iso.datetime({ offset: true }).optional(),
  run_id: z.string().optional(),
  run_name: z.string().optional(),
  state_dir: z.string().optional(),
  pull_request_url: z.string().optional(),
  terminal_reason: z.string().optional(),
  requeued_from: z.string().optional(),
  merged_at: z.iso.datetime({ offset: true }).optional(),
  merge_commit: z.string().regex(/^[0-9a-f]{40}$/).optional(),
});

function lastPathSegment(path: string): string {
  return (
    path
      .split(/[\\/]/)
      .filter((segment) => segment !== '')
      .at(-1) ?? path
  );
}

function toQueueEntry(row: { entry_id: string; document: string }): QueueEntry {
  let document: unknown;
  try {
    document = JSON.parse(row.document);
  } catch {
    throw new Error(
      `Packet queue entry ${row.entry_id} has an invalid document: not valid JSON`,
    );
  }

  const parsed = RawQueueDocument.safeParse(document);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'document'}: ${issue.message}`)
      .join('; ');
    throw new Error(
      `Packet queue entry ${row.entry_id} has an invalid document: ${details}`,
    );
  }

  const raw = parsed.data;
  const entry: QueueEntry = {
    entry_id: raw.entry_id,
    feature_id: raw.feature_id,
    target_repository: raw.target_repository,
    status: raw.status,
    queued_at: raw.queued_at,
  };
  if (raw.claimed_at !== undefined) {
    entry.claimed_at = raw.claimed_at;
  }
  if (raw.finished_at !== undefined) {
    entry.finished_at = raw.finished_at;
  }
  if (raw.run_id !== undefined) {
    entry.run_id = raw.run_id;
  }
  if (raw.run_name !== undefined) {
    entry.run_name = raw.run_name;
  }
  if (raw.state_dir !== undefined) {
    entry.run_dir = lastPathSegment(raw.state_dir);
  }
  if (raw.pull_request_url !== undefined) {
    entry.pull_request_url = raw.pull_request_url;
  }
  if (raw.terminal_reason !== undefined) {
    entry.terminal_reason = raw.terminal_reason;
  }
  if (raw.requeued_from !== undefined) {
    entry.requeued_from = raw.requeued_from;
  }
  if (raw.merged_at !== undefined) {
    entry.merged_at = raw.merged_at;
  }
  if (raw.merge_commit !== undefined) {
    entry.merge_commit = raw.merge_commit;
  }
  return entry;
}

export function readQueueEntries(database: DatabaseSync): QueueEntry[] {
  const rows = database
    .prepare(
      'SELECT entry_id, document FROM packet_queue ORDER BY queued_at ASC, entry_id ASC',
    )
    .all() as Array<{ entry_id: string; document: string }>;

  return rows.map((row) => toQueueEntry(row));
}
