import type { RunList } from '../runList.js';
import type { RunSummary } from '../runSummary.js';
import type { QueueEntry } from '../state/queueDatabase.js';

export interface DashboardInput {
  runs: RunList;
  queue: QueueEntry[];
  generatedAt: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function pullRequestCell(pullRequestUrl: string | undefined): string {
  if (pullRequestUrl === undefined) {
    return '';
  }
  if (!pullRequestUrl.startsWith('https://')) {
    return escapeHtml(pullRequestUrl);
  }
  const number = pullRequestUrl.slice(pullRequestUrl.lastIndexOf('/') + 1);
  return `<a href="${escapeHtml(pullRequestUrl)}">${escapeHtml(
    `#${number}`,
  )}</a>`;
}

function countText(counts: Record<string, number>): string {
  return Object.entries(counts)
    .map(([label, count]) => `${escapeHtml(label)}: ${count}`)
    .join(', ');
}

function queueCounts(queue: readonly QueueEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of queue) {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
  }
  return counts;
}

function runRow(run: RunSummary): string {
  const startedAt =
    run.started_at === undefined ? '' : escapeHtml(run.started_at);
  return `<tr><td>${escapeHtml(run.state)}</td><td>${escapeHtml(
    run.feature_id,
  )}</td><td>${escapeHtml(run.run_id)}</td><td>${String(
    run.attempt_count,
  )}</td><td>${startedAt}</td><td>${pullRequestCell(
    run.pull_request_url,
  )}</td></tr>`;
}

function outcomeCell(entry: QueueEntry): string {
  if (entry.pull_request_url !== undefined) {
    return pullRequestCell(entry.pull_request_url);
  }
  if (entry.terminal_reason !== undefined) {
    return escapeHtml(entry.terminal_reason);
  }
  return '';
}

function queueRow(entry: QueueEntry): string {
  const runDir =
    entry.run_dir === undefined ? '' : escapeHtml(entry.run_dir);
  return `<tr><td>${escapeHtml(entry.status)}</td><td>${escapeHtml(
    entry.feature_id,
  )}</td><td>${escapeHtml(entry.queued_at)}</td><td>${runDir}</td><td>${outcomeCell(
    entry,
  )}</td></tr>`;
}

const RUNS_TABLE_HEAD =
  '<thead><tr><th>State</th><th>Feature</th><th>Run</th><th>Attempts</th><th>Started</th><th>Pull request</th></tr></thead>';
const QUEUE_TABLE_HEAD =
  '<thead><tr><th>Status</th><th>Feature</th><th>Queued</th><th>Run dir</th><th>Outcome</th></tr></thead>';

export function renderDashboard(input: DashboardInput): string {
  const runCountsText = countText(input.runs.by_state);
  const queueCountsText = countText(queueCounts(input.queue));

  const runsSection =
    input.runs.runs.length === 0
      ? '<p>No runs.</p>'
      : `<table>
${RUNS_TABLE_HEAD}
<tbody>
${input.runs.runs.map(runRow).join('\n')}
</tbody>
</table>`;
  const queueSection =
    input.queue.length === 0
      ? '<p>Queue is empty.</p>'
      : `<table>
${QUEUE_TABLE_HEAD}
<tbody>
${input.queue.map(queueRow).join('\n')}
</tbody>
</table>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Factory Control Plane</title>
<style>
body {
  font-family: system-ui, -apple-system, sans-serif;
  margin: 1rem;
  color: #222;
}
h1, h2 {
  font-weight: 600;
}
table {
  border-collapse: collapse;
  margin-top: 0.5rem;
}
th, td {
  border: 1px solid #ccc;
  padding: 0.25rem 0.5rem;
  text-align: left;
}
</style>
</head>
<body>
<h1>Factory Control Plane</h1>
<p>Generated at: ${escapeHtml(input.generatedAt)}</p>
<h2>Runs</h2>
<p>${runCountsText}</p>
${runsSection}
<h2>Queue</h2>
<p>${queueCountsText}</p>
${queueSection}
</body>
</html>`;
}
