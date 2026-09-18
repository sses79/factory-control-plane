import type { RunList } from '../runList.js';
import type { RunSummary } from '../runSummary.js';
import type { QueueEntry } from '../state/queueDatabase.js';
import {
  card,
  countTiles,
  emptyState,
  escapeHtml,
  pullRequestLink,
  renderPage,
  shortId,
  statusBadge,
  table,
  timestamp,
} from './layout.js';

export interface DashboardInput {
  runs: RunList;
  queue: QueueEntry[];
  generatedAt: string;
}

function queueCounts(queue: readonly QueueEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of queue) {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
  }
  return counts;
}

function runRow(run: RunSummary): string {
  return `<tr><td>${statusBadge(run.state)}</td><td class="wide">${escapeHtml(
    run.feature_id,
  )}</td><td class="id">${shortId(run.run_id)}</td><td class="num">${String(
    run.attempt_count,
  )}</td><td>${timestamp(run.started_at)}</td><td>${pullRequestLink(
    run.pull_request_url,
  )}</td></tr>`;
}

function outcomeCell(entry: QueueEntry): string {
  if (entry.pull_request_url !== undefined) {
    return pullRequestLink(entry.pull_request_url);
  }
  if (entry.terminal_reason !== undefined) {
    return `<span class="id">${escapeHtml(entry.terminal_reason)}</span>`;
  }
  return '<span class="muted">—</span>';
}

function queueRow(entry: QueueEntry): string {
  const runDir =
    entry.run_dir === undefined ? '<span class="muted">—</span>' : escapeHtml(entry.run_dir);
  return `<tr><td>${statusBadge(entry.status)}</td><td class="wide">${escapeHtml(
    entry.feature_id,
  )}</td><td>${timestamp(entry.queued_at)}</td><td class="id">${runDir}</td><td>${outcomeCell(
    entry,
  )}</td></tr>`;
}

export function renderDashboard(input: DashboardInput): string {
  const runs =
    input.runs.runs.length === 0
      ? emptyState('No runs.')
      : table(
          ['State', 'Feature', 'Run', 'Attempts', 'Started', 'Pull request'],
          input.runs.runs.map(runRow),
        );
  const queue =
    input.queue.length === 0
      ? emptyState('Queue is empty.')
      : table(
          ['Status', 'Feature', 'Queued', 'Run dir', 'Outcome'],
          input.queue.map(queueRow),
        );

  const body = [
    card(
      'Runs',
      `${countTiles(input.runs.by_state)}${runs}`,
      `${String(input.runs.total)} total`,
    ),
    card(
      'Queue',
      `${countTiles(queueCounts(input.queue))}${queue}`,
      `${String(input.queue.length)} entries`,
    ),
  ].join('\n');

  return renderPage({
    title: 'Factory Control Plane',
    heading: 'Dashboard',
    subheading: 'Every run and queued packet, newest first.',
    section: 'dashboard',
    generatedAt: input.generatedAt,
    body,
  });
}
