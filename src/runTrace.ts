import { z } from 'zod';

import type { RunSummary } from './runSummary.js';

const TraceNodeKindSchema = z.enum([
  'idea',
  'project',
  'repository',
  'feature',
  'run',
  'branch',
  'pull_request',
]);

type TraceNodeKind = z.infer<typeof TraceNodeKindSchema>;

const TraceNodeSchema = z.object({
  kind: TraceNodeKindSchema,
  id: z.string(),
  label: z.string(),
});

type TraceNode = z.infer<typeof TraceNodeSchema>;

export const RunTraceSchema = z.object({
  run_id: z.string(),
  nodes: z.array(TraceNodeSchema),
});

export type RunTrace = z.infer<typeof RunTraceSchema>;

export interface RunTraceOptions {
  idea_id?: string;
  project_id?: string;
}

const NODE_LABELS: Record<TraceNodeKind, string> = {
  idea: 'Idea',
  project: 'Project',
  repository: 'Repository',
  feature: 'Feature',
  run: 'Run',
  branch: 'Branch',
  pull_request: 'Pull request',
};

function traceNode(kind: TraceNodeKind, id: string): TraceNode {
  return {
    kind,
    id,
    label: NODE_LABELS[kind],
  };
}

export function toRunTrace(summary: RunSummary, options: RunTraceOptions): RunTrace {
  const nodes: TraceNode[] = [];

  if (options.idea_id !== undefined) {
    nodes.push(traceNode('idea', options.idea_id));
  }
  if (options.project_id !== undefined) {
    nodes.push(traceNode('project', options.project_id));
  }
  nodes.push(traceNode('repository', summary.target_repository));
  nodes.push(traceNode('feature', summary.feature_id));
  nodes.push(traceNode('run', summary.run_id));
  if (summary.branch !== undefined) {
    nodes.push(traceNode('branch', summary.branch));
  }
  if (summary.pull_request_url !== undefined) {
    nodes.push(traceNode('pull_request', summary.pull_request_url));
  }

  return {
    run_id: summary.run_id,
    nodes,
  };
}
