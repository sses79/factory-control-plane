import { z } from 'zod';

import type { RunSummary } from './runSummary.js';
import type { QueueEntry } from './state/queueDatabase.js';
import type { Blueprint } from './state/planningDatabase.js';

export const PACKET_STATUSES = [
  'NOT_STARTED',
  'QUEUED',
  'RUNNING',
  'AWAITING_REVIEW',
  'MERGED',
  'FAILED',
] as const;

type PacketStatus = (typeof PACKET_STATUSES)[number];

const CountsSchema = z.object({
  NOT_STARTED: z.number().int().nonnegative(),
  QUEUED: z.number().int().nonnegative(),
  RUNNING: z.number().int().nonnegative(),
  AWAITING_REVIEW: z.number().int().nonnegative(),
  MERGED: z.number().int().nonnegative(),
  FAILED: z.number().int().nonnegative(),
});

type Counts = z.infer<typeof CountsSchema>;

const PacketStatusSchema = z.object({
  feature_id: z.string(),
  title: z.string(),
  repository: z.string(),
  depends_on: z.array(z.string()),
  status: z.enum(PACKET_STATUSES),
  attempts: z.number().int().nonnegative(),
  run_id: z.string().optional(),
  pull_request_url: z.string().optional(),
  terminal_reason: z.string().optional(),
  run_state: z.string().optional(),
  merged_at: z.iso.datetime({ offset: true }).optional(),
  merge_commit: z.string().regex(/^[0-9a-f]{40}$/).optional(),
});

type PacketStatusEntry = z.infer<typeof PacketStatusSchema>;

const PhaseStatusSchema = z.object({
  phase_id: z.string(),
  title: z.string(),
  goal: z.string(),
  exit: z.string(),
  packets: z.array(PacketStatusSchema),
  counts: CountsSchema,
});

export const BlueprintStatusSchema = z.object({
  idea_id: z.string(),
  project_id: z.string(),
  title: z.string(),
  phases: z.array(PhaseStatusSchema),
  totals: CountsSchema,
});

export type BlueprintStatus = z.infer<typeof BlueprintStatusSchema>;

const QUEUE_STATUS_TO_PACKET_STATUS: Record<
  QueueEntry['status'],
  PacketStatus
> = {
  QUEUED: 'QUEUED',
  CLAIMED: 'RUNNING',
  SUCCEEDED: 'AWAITING_REVIEW',
  FAILED: 'FAILED',
};

function emptyCounts(): Counts {
  return {
    NOT_STARTED: 0,
    QUEUED: 0,
    RUNNING: 0,
    AWAITING_REVIEW: 0,
    MERGED: 0,
    FAILED: 0,
  };
}

function compareLatestEntry(a: QueueEntry, b: QueueEntry): number {
  const aQueuedAt = Date.parse(a.queued_at);
  const bQueuedAt = Date.parse(b.queued_at);
  if (aQueuedAt !== bQueuedAt) {
    return aQueuedAt < bQueuedAt ? -1 : 1;
  }
  if (a.entry_id === b.entry_id) {
    return 0;
  }
  return a.entry_id < b.entry_id ? -1 : 1;
}

function latestQueueEntry(
  entries: readonly QueueEntry[],
): QueueEntry | undefined {
  let latest: QueueEntry | undefined;
  for (const entry of entries) {
    if (latest === undefined || compareLatestEntry(entry, latest) > 0) {
      latest = entry;
    }
  }
  return latest;
}

function latestMergedEntry(
  entries: readonly QueueEntry[],
): QueueEntry | undefined {
  let latest: QueueEntry | undefined;
  for (const entry of entries) {
    if (entry.status !== 'SUCCEEDED' || entry.merged_at === undefined) {
      continue;
    }
    if (latest === undefined || compareLatestEntry(entry, latest) > 0) {
      latest = entry;
    }
  }
  return latest;
}

export function toBlueprintStatus(input: {
  blueprint: Blueprint;
  queue: QueueEntry[];
  runs: RunSummary[];
}): BlueprintStatus {
  const entriesByFeature = new Map<string, QueueEntry[]>();
  for (const entry of input.queue) {
    const entries = entriesByFeature.get(entry.feature_id);
    if (entries === undefined) {
      entriesByFeature.set(entry.feature_id, [entry]);
    } else {
      entries.push(entry);
    }
  }

  const runsByRunId = new Map<string, RunSummary>();
  for (const run of input.runs) {
    runsByRunId.set(run.run_id, run);
  }

  const totals = emptyCounts();

  const phases = input.blueprint.phases.map((phase) => {
    const packets = phase.packets.map((packet) => {
      const entries = entriesByFeature.get(packet.feature_id) ?? [];
      const latest = latestMergedEntry(entries) ?? latestQueueEntry(entries);

      const result: PacketStatusEntry = {
        feature_id: packet.feature_id,
        title: packet.title,
        repository: packet.repository,
        depends_on: packet.depends_on,
        status:
          latest === undefined
            ? 'NOT_STARTED'
            : latest.status === 'SUCCEEDED' && latest.merged_at !== undefined
              ? 'MERGED'
              : QUEUE_STATUS_TO_PACKET_STATUS[latest.status],
        attempts: entries.length,
      };

      if (latest !== undefined) {
        if (latest.run_id !== undefined) {
          result.run_id = latest.run_id;
          const run = runsByRunId.get(latest.run_id);
          if (run !== undefined) {
            result.run_state = run.state;
          }
        }
        if (latest.pull_request_url !== undefined) {
          result.pull_request_url = latest.pull_request_url;
        }
        if (latest.terminal_reason !== undefined) {
          result.terminal_reason = latest.terminal_reason;
        }
        if (latest.merged_at !== undefined) {
          result.merged_at = latest.merged_at;
        }
        if (latest.merge_commit !== undefined) {
          result.merge_commit = latest.merge_commit;
        }
      }

      return result;
    });

    const counts = emptyCounts();
    for (const packet of packets) {
      counts[packet.status] += 1;
      totals[packet.status] += 1;
    }

    return {
      phase_id: phase.phase_id,
      title: phase.title,
      goal: phase.goal,
      exit: phase.exit,
      packets,
      counts,
    };
  });

  return {
    idea_id: input.blueprint.idea_id,
    project_id: input.blueprint.project_id,
    title: input.blueprint.title,
    phases,
    totals,
  };
}
