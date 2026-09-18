import { describe, expect, it } from 'vitest';

import {
  BlueprintStatusSchema,
  PACKET_STATUSES,
  toBlueprintStatus,
} from './blueprintStatus.js';
import type { RunSummary } from './runSummary.js';
import type { Blueprint } from './state/planningDatabase.js';
import type { QueueEntry } from './state/queueDatabase.js';

function makeBlueprint(): Blueprint {
  return {
    schema_version: 1,
    idea_id: 'idea-1',
    project_id: 'project-1',
    title: 'Example Blueprint',
    repositories: ['repo-a', 'repo-b', 'repo-c'],
    phases: [
      {
        phase_id: 'phase-a',
        title: 'Phase A',
        goal: 'Goal A',
        exit: 'Exit A',
        packets: [
          {
            feature_id: 'f1',
            repository: 'repo-a',
            title: 'Packet 1',
            outcome: 'Outcome 1',
            writable_paths: ['src/one.ts'],
            acceptance_criteria: ['One works'],
            depends_on: [],
          },
          {
            feature_id: 'f2',
            repository: 'repo-a',
            title: 'Packet 2',
            outcome: 'Outcome 2',
            writable_paths: ['src/two.ts'],
            acceptance_criteria: ['Two works'],
            depends_on: ['f1'],
          },
          {
            feature_id: 'f3',
            repository: 'repo-b',
            title: 'Packet 3',
            outcome: 'Outcome 3',
            writable_paths: ['src/three.ts'],
            acceptance_criteria: ['Three works'],
            depends_on: [],
          },
          {
            feature_id: 'f4',
            repository: 'repo-c',
            title: 'Packet 4',
            outcome: 'Outcome 4',
            writable_paths: ['src/four.ts'],
            acceptance_criteria: ['Four works'],
            depends_on: [],
          },
        ],
      },
      {
        phase_id: 'phase-b',
        title: 'Phase B',
        goal: 'Goal B',
        exit: 'Exit B',
        packets: [
          {
            feature_id: 'f5',
            repository: 'repo-a',
            title: 'Packet 5',
            outcome: 'Outcome 5',
            writable_paths: ['src/five.ts'],
            acceptance_criteria: ['Five works'],
            depends_on: ['f4'],
          },
          {
            feature_id: 'f6',
            repository: 'repo-a',
            title: 'Packet 6',
            outcome: 'Outcome 6',
            writable_paths: ['src/six.ts'],
            acceptance_criteria: ['Six works'],
            depends_on: [],
          },
          {
            feature_id: 'f7',
            repository: 'repo-b',
            title: 'Packet 7',
            outcome: 'Outcome 7',
            writable_paths: ['src/seven.ts'],
            acceptance_criteria: ['Seven works'],
            depends_on: [],
          },
        ],
      },
    ],
  };
}

function makeQueue(): QueueEntry[] {
  return [
    {
      entry_id: 'e1',
      feature_id: 'f1',
      target_repository: 'repo-a',
      status: 'SUCCEEDED',
      queued_at: '2026-01-01T00:00:00Z',
      run_id: 'run-1',
      pull_request_url: 'https://github.com/example/control-plane/pull/1',
    },
    {
      entry_id: 'e2',
      feature_id: 'f2',
      target_repository: 'repo-a',
      status: 'QUEUED',
      queued_at: '2026-01-02T00:00:00Z',
    },
    {
      entry_id: 'e3',
      feature_id: 'f3',
      target_repository: 'repo-b',
      status: 'CLAIMED',
      queued_at: '2026-01-03T00:00:00Z',
      run_id: 'run-3',
    },
    {
      entry_id: 'e4',
      feature_id: 'f4',
      target_repository: 'repo-c',
      status: 'FAILED',
      queued_at: '2026-01-04T00:00:00Z',
      run_id: 'run-4',
      terminal_reason: 'Acceptance criteria failed',
    },
    {
      entry_id: 'e6a',
      feature_id: 'f6',
      target_repository: 'repo-a',
      status: 'FAILED',
      queued_at: '2026-01-05T00:00:00Z',
      run_id: 'run-6a',
      terminal_reason: 'Flaky environment',
    },
    {
      entry_id: 'e6b',
      feature_id: 'f6',
      target_repository: 'repo-a',
      status: 'SUCCEEDED',
      queued_at: '2026-01-06T00:00:00Z',
      run_id: 'run-6b',
      pull_request_url: 'https://github.com/example/control-plane/pull/6',
    },
    {
      entry_id: 'e7a',
      feature_id: 'f7',
      target_repository: 'repo-b',
      status: 'QUEUED',
      queued_at: '2026-01-07T00:00:00Z',
    },
    {
      entry_id: 'e7b',
      feature_id: 'f7',
      target_repository: 'repo-b',
      status: 'QUEUED',
      queued_at: '2026-01-07T00:00:00Z',
      run_id: 'run-7',
    },
    {
      entry_id: 'e-ignored',
      feature_id: 'not-in-blueprint',
      target_repository: 'repo-a',
      status: 'FAILED',
      queued_at: '2026-01-08T00:00:00Z',
      run_id: 'run-ignored',
    },
  ];
}

function makeRuns(): RunSummary[] {
  return [
    {
      run_id: 'run-1',
      feature_id: 'f1',
      target_repository: 'repo-a',
      state: 'AGENT_REVIEW',
      attempt_count: 1,
    },
    {
      run_id: 'run-3',
      feature_id: 'f3',
      target_repository: 'repo-b',
      state: 'BUILDING',
      attempt_count: 1,
    },
    {
      run_id: 'run-4',
      feature_id: 'f4',
      target_repository: 'repo-c',
      state: 'FAILED',
      attempt_count: 1,
    },
    {
      run_id: 'run-6b',
      feature_id: 'f6',
      target_repository: 'repo-a',
      state: 'DRAFT_PR',
      attempt_count: 1,
    },
    {
      run_id: 'run-7',
      feature_id: 'f7',
      target_repository: 'repo-b',
      state: 'PREPARING_WORKSPACE',
      attempt_count: 1,
    },
    {
      run_id: 'run-ignored',
      feature_id: 'not-in-blueprint',
      target_repository: 'repo-a',
      state: 'FAILED',
      attempt_count: 1,
    },
  ];
}

function buildStatus() {
  return toBlueprintStatus({
    blueprint: makeBlueprint(),
    queue: makeQueue(),
    runs: makeRuns(),
  });
}

function findPacket(result: ReturnType<typeof buildStatus>, featureId: string) {
  return result.phases
    .flatMap((phase) => phase.packets)
    .find((packet) => packet.feature_id === featureId);
}

describe('toBlueprintStatus', () => {
  it('does not mutate its inputs', () => {
    const blueprint = makeBlueprint();
    const queue = makeQueue();
    const runs = makeRuns();

    const blueprintSnapshot = structuredClone(blueprint);
    const queueSnapshot = structuredClone(queue);
    const runsSnapshot = structuredClone(runs);

    toBlueprintStatus({ blueprint, queue, runs });

    expect(blueprint).toEqual(blueprintSnapshot);
    expect(queue).toEqual(queueSnapshot);
    expect(runs).toEqual(runsSnapshot);
  });

  it('reports NOT_STARTED with 0 attempts for a packet with no entries', () => {
    const packet = findPacket(buildStatus(), 'f5');
    expect(packet?.status).toBe('NOT_STARTED');
    expect(packet?.attempts).toBe(0);
    expect(packet?.run_id).toBeUndefined();
    expect(packet?.run_state).toBeUndefined();
    expect(packet?.pull_request_url).toBeUndefined();
    expect(packet?.terminal_reason).toBeUndefined();
  });

  it('maps queue statuses to packet statuses', () => {
    const result = buildStatus();
    expect(findPacket(result, 'f2')?.status).toBe('QUEUED');
    expect(findPacket(result, 'f3')?.status).toBe('RUNNING');
    expect(findPacket(result, 'f1')?.status).toBe('AWAITING_REVIEW');
    expect(findPacket(result, 'f4')?.status).toBe('FAILED');
  });

  it('prefers a later SUCCEEDED entry over an earlier FAILED entry', () => {
    const packet = findPacket(buildStatus(), 'f6');
    expect(packet?.status).toBe('AWAITING_REVIEW');
    expect(packet?.attempts).toBe(2);
    expect(packet?.run_id).toBe('run-6b');
    expect(packet?.pull_request_url).toBe(
      'https://github.com/example/control-plane/pull/6',
    );
    expect(packet?.run_state).toBe('DRAFT_PR');
    expect(packet?.terminal_reason).toBeUndefined();
  });

  it('carries run_id, pull_request_url and run_state for AWAITING_REVIEW packets', () => {
    const packet = findPacket(buildStatus(), 'f1');
    expect(packet?.run_id).toBe('run-1');
    expect(packet?.pull_request_url).toBe(
      'https://github.com/example/control-plane/pull/1',
    );
    expect(packet?.run_state).toBe('AGENT_REVIEW');
  });

  it('carries terminal_reason for FAILED packets', () => {
    const packet = findPacket(buildStatus(), 'f4');
    expect(packet?.terminal_reason).toBe('Acceptance criteria failed');
    expect(packet?.run_state).toBe('FAILED');
  });

  it('breaks latest-entry ties by entry_id', () => {
    const packet = findPacket(buildStatus(), 'f7');
    expect(packet?.attempts).toBe(2);
    expect(packet?.run_id).toBe('run-7');
    expect(packet?.run_state).toBe('PREPARING_WORKSPACE');
    expect(packet?.status).toBe('QUEUED');
  });

  it('ignores queue entries and runs for feature ids the blueprint does not list', () => {
    const result = buildStatus();
    const packets = result.phases.flatMap((phase) => phase.packets);
    expect(packets.map((packet) => packet.feature_id)).not.toContain(
      'not-in-blueprint',
    );
    expect(packets.some((packet) => packet.run_id === 'run-ignored')).toBe(
      false,
    );
  });

  it('preserves blueprint packet fields', () => {
    const packet = findPacket(buildStatus(), 'f2');
    expect(packet?.feature_id).toBe('f2');
    expect(packet?.title).toBe('Packet 2');
    expect(packet?.repository).toBe('repo-a');
    expect(packet?.depends_on).toEqual(['f1']);
  });

  it('carries blueprint and phase identity fields', () => {
    const result = buildStatus();
    expect(result.idea_id).toBe('idea-1');
    expect(result.project_id).toBe('project-1');
    expect(result.title).toBe('Example Blueprint');
    expect(result.phases[0]?.phase_id).toBe('phase-a');
    expect(result.phases[0]?.title).toBe('Phase A');
    expect(result.phases[0]?.goal).toBe('Goal A');
    expect(result.phases[0]?.exit).toBe('Exit A');
  });

  it('keeps phases and packets in blueprint order', () => {
    const result = buildStatus();
    expect(result.phases.map((phase) => phase.phase_id)).toEqual([
      'phase-a',
      'phase-b',
    ]);
    expect(
      result.phases[0]?.packets.map((packet) => packet.feature_id),
    ).toEqual(['f1', 'f2', 'f3', 'f4']);
    expect(
      result.phases[1]?.packets.map((packet) => packet.feature_id),
    ).toEqual(['f5', 'f6', 'f7']);
  });

  it('reports counts for every status with zeros and totals across phases', () => {
    const result = buildStatus();
    for (const phase of result.phases) {
      expect(Object.keys(phase.counts).sort()).toEqual(
        [...PACKET_STATUSES].sort(),
      );
    }
    expect(result.phases[0]?.counts).toEqual({
      NOT_STARTED: 0,
      QUEUED: 1,
      RUNNING: 1,
      AWAITING_REVIEW: 1,
      FAILED: 1,
    });
    expect(result.phases[1]?.counts).toEqual({
      NOT_STARTED: 1,
      QUEUED: 1,
      RUNNING: 0,
      AWAITING_REVIEW: 1,
      FAILED: 0,
    });
    expect(result.totals).toEqual({
      NOT_STARTED: 1,
      QUEUED: 2,
      RUNNING: 1,
      AWAITING_REVIEW: 2,
      FAILED: 1,
    });
  });

  it('returns values accepted by BlueprintStatusSchema', () => {
    const result = buildStatus();
    expect(BlueprintStatusSchema.parse(result)).toEqual(result);
  });
});
